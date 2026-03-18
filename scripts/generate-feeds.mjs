/**
 * generate-feeds.mjs
 *
 * Reads feeds.yaml, scrapes each configured site, produces RSS XML files,
 * and writes them (along with the static UI) into ./output/ for GitHub Pages.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function resolveUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function generateFeed(feedConfig) {
  const { name, site, metadata = {}, root, fields } = feedConfig;
  console.log(`\n⟐  Processing "${name}" — ${site}`);

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
    html = await fetchHTML(site);
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
      // Ensure an id exists — the feed library requires it for some formats
      if (!feedItem.id) {
        feedItem.id = feedItem.link || feedItem.title || `${name}-${Date.now()}`;
      }
      feed.addItem(feedItem);
    }
  }

  console.log(`   ↳ Generated ${feed.items.length} feed items`);
  return feed.rss2();
}

async function main() {
  // ── Read config ────────────────────────────────────────────────────────
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

  // ── Prepare output directory ──────────────────────────────────────────
  fs.mkdirSync(FEEDS_OUTPUT_DIR, { recursive: true });

  // ── Generate each feed ────────────────────────────────────────────────
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

  // ── Write manifest (for the UI) ───────────────────────────────────────
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify({ feeds: manifest, generated: new Date().toISOString() }, null, 2),
    "utf-8"
  );

  // ── Copy static UI files ──────────────────────────────────────────────
  if (fs.existsSync(UI_SOURCE)) {
    copyDirSync(UI_SOURCE, OUTPUT_DIR);
    console.log(`\n✓ Copied UI files to output/`);
  }

  // ── Copy feeds.yaml so the UI can read the config ─────────────────────
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
