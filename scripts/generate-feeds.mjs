/**
 * generate-feeds.mjs
 *
 * Reads feeds.yaml, scrapes each configured site, produces RSS XML files,
 * and writes them (along with the static UI) into ./output/ for GitHub Pages.
 *
 * Supports two fetch modes per feed:
 *   - Default: fast HTTP fetch (for static HTML sites)
 *   - jsRender: true → headless Chromium via Playwright (for JS-rendered SPAs)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { JSDOM } from "jsdom";
import { Feed } from "feed";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FEEDS_PATH = path.resolve(__dirname, "..", "feeds.yaml");
const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const FEEDS_OUTPUT_DIR = path.join(OUTPUT_DIR, "feeds");
const UI_SOURCE = path.resolve(__dirname, "..", "ui");

// ── Playwright (lazy-loaded — only imported if a feed needs jsRender) ───────

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const { chromium } = await import("playwright");
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchHTMLWithBrowser(url, waitFor) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    console.log(`   ↳ Navigating headless browser…`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

    // If the user specified a CSS selector to wait for, wait until it appears
    if (waitFor) {
      console.log(`   ↳ Waiting for selector: ${waitFor}`);
      await page.waitForSelector(waitFor, { timeout: 30_000 });
    } else {
      // Default: give JS a few extra seconds to finish rendering
      await page.waitForTimeout(5_000);
    }

    return await page.content();
  } finally {
    await page.close();
  }
}

function resolveUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ── Feed generation ─────────────────────────────────────────────────────────

async function generateFeed(feedConfig) {
  const { name, site, metadata = {}, root, fields, jsRender, waitFor } = feedConfig;
  console.log(`\n⟐  Processing "${name}" — ${site}`);
  if (jsRender) console.log(`   ↳ Using headless browser (jsRender: true)`);

  const defaultMeta = {
    title: `${site} Feed`,
    description: `A feed for ${site}`,
    id: site,
    link: site,
    language: "en",
    copyright: "",
    generator: "select-feed (GitHub Pages edition)",
    ...metadata,
    updated: new Date(),
  };

  const feed = new Feed(defaultMeta);

  // 1. Fetch & parse
  let html;
  try {
    html = jsRender
      ? await fetchHTMLWithBrowser(site, waitFor)
      : await fetchHTML(site);
  } catch (err) {
    console.error(`   ✗ Failed to fetch: ${err.message}`);
    return null;
  }

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // 2. Find all repeating root elements
  const roots = doc.querySelectorAll(root);
  console.log(`   ↳ Found ${roots.length} items matching "${root}"`);

  if (roots.length === 0) {
    console.warn(`   ⚠ No items found — check your root selector`);
  }

  // 3. Extract fields from each item
  for (const item of roots) {
    const feedItem = {};

    for (const field of fields) {
      const el = item.querySelector(field.selector);
      if (!el) continue;

      let value = null;

      switch (field.type) {
        case "attribute":
          value = el.getAttribute(field.attributeKey);
          break;
        case "textContent":
          value = el.textContent;
          break;
        default:
          break;
      }

      if (value === null || value === undefined) continue;
      value = value.trim();
      if (!value) continue;

      // Resolve relative URLs for link & image fields
      if ((field.for === "link" || field.for === "image") && value) {
        value = resolveUrl(value, site);
      }

      // Parse date strings
      if (field.for === "date") {
        value = new Date(value);
      }

      feedItem[field.for] = value;
    }

    // Only add if we got at least a title or description
    if (feedItem.title || feedItem.description) {
      if (!feedItem.id) {
        feedItem.id = feedItem.link || feedItem.title || `${name}-${Date.now()}`;
      }
      feed.addItem(feedItem);
    }
  }

  console.log(`   ↳ Generated ${feed.items.length} feed items`);
  return feed.rss2();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(FEEDS_PATH)) {
    console.error("feeds.yaml not found — nothing to do.");
    process.exit(1);
  }

  const raw = fs.readFileSync(FEEDS_PATH, "utf-8");
  const config = YAML.parse(raw);

  if (!config?.feeds?.length) {
    console.error("No feeds defined in feeds.yaml");
    process.exit(1);
  }

  fs.mkdirSync(FEEDS_OUTPUT_DIR, { recursive: true });

  const manifest = [];

  for (const feedConfig of config.feeds) {
    if (!feedConfig.name || !feedConfig.site || !feedConfig.root || !feedConfig.fields) {
      console.warn(`⚠ Skipping incomplete feed config:`, feedConfig.name || "(unnamed)");
      continue;
    }

    const rss = await generateFeed(feedConfig);
    if (rss) {
      const filename = `${feedConfig.name}.xml`;
      fs.writeFileSync(path.join(FEEDS_OUTPUT_DIR, filename), rss, "utf-8");
      console.log(`   ✓ Wrote feeds/${filename}`);
      manifest.push({
        name: feedConfig.name,
        site: feedConfig.site,
        title: feedConfig.metadata?.title || feedConfig.site,
        description: feedConfig.metadata?.description || "",
        file: `feeds/${filename}`,
        updated: new Date().toISOString(),
      });
    }
  }

  // Clean up browser if it was used
  await closeBrowser();

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify({ feeds: manifest, generated: new Date().toISOString() }, null, 2),
    "utf-8"
  );

  if (fs.existsSync(UI_SOURCE)) {
    copyDirSync(UI_SOURCE, OUTPUT_DIR);
    console.log(`\n✓ Copied UI files to output/`);
  }

  fs.copyFileSync(FEEDS_PATH, path.join(OUTPUT_DIR, "feeds.yaml"));
  console.log(`\n✅ Done — ${manifest.length} feed(s) generated in ./output/`);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
