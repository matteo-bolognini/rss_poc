/* ═══════════════════════════════════════════════════════════════════════════
   Select Feed — Static UI
   Tabs, feed list, config editor, YAML generation, live selector testing
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Tabs ─────────────────────────────────────────────────────────────────────

document.querySelectorAll("button.tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("button.tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById("tab-" + btn.dataset.tab);
    if (target) target.classList.add("active");
  });
});

// ── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

// ── Feeds tab ────────────────────────────────────────────────────────────────

async function loadFeeds() {
  const list = document.getElementById("feeds-list");
  const updated = document.getElementById("last-updated");

  try {
    const res = await fetch("manifest.json");
    if (!res.ok) throw new Error("No manifest found");
    const data = await res.json();

    if (data.generated) {
      const d = new Date(data.generated);
      updated.textContent = "Updated " + d.toLocaleString();
    }

    if (!data.feeds || data.feeds.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>No feeds generated yet.</p>
          <p>Add feeds to <code>feeds.yaml</code> and push to trigger the Action.</p>
        </div>`;
      return;
    }

    list.innerHTML = data.feeds
      .map((feed) => {
        const feedUrl = new URL(feed.file, window.location.href).href;
        return `
        <div class="feed-card">
          <div class="feed-card-header">
            <div>
              <div class="feed-title">${esc(feed.title || feed.name)}</div>
              <div class="feed-site">${esc(feed.site)}</div>
            </div>
          </div>
          ${feed.description ? `<div class="feed-desc">${esc(feed.description)}</div>` : ""}
          <div class="feed-actions">
            <a href="${esc(feed.file)}" target="_blank" class="btn btn-sm btn-outline">View XML</a>
            <button class="btn btn-sm btn-copy-feed" onclick="copyFeedUrl('${esc(feedUrl)}')">
              Copy Feed URL
            </button>
          </div>
          <div class="feed-meta">
            <span><span class="status-dot"></span>Active</span>
            <span>Last run: ${new Date(feed.updated).toLocaleString()}</span>
          </div>
        </div>`;
      })
      .join("");
  } catch (e) {
    list.innerHTML = `
      <div class="empty-state">
        <p>Could not load feeds.</p>
        <p>Make sure the GitHub Action has run at least once.</p>
      </div>`;
  }
}

function copyFeedUrl(url) {
  navigator.clipboard.writeText(url).then(() => showToast("Feed URL copied!"));
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

loadFeeds();

// ── Config Editor ────────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  "title",
  "description",
  "link",
  "content",
  "date",
  "author",
  "image",
  "contributor",
];

const TYPE_OPTIONS = ["textContent", "attribute"];

let fields = [
  { for: "title", selector: "", type: "textContent", attributeKey: "" },
  { for: "link", selector: "", type: "attribute", attributeKey: "href" },
];

function renderFields() {
  const container = document.getElementById("fields-container");
  container.innerHTML = fields
    .map((f, i) => {
      const showAttr = f.type === "attribute";
      return `
      <div class="field-row">
        <select onchange="updateField(${i},'for',this.value)">
          ${FIELD_OPTIONS.map(
            (o) => `<option value="${o}" ${f.for === o ? "selected" : ""}>${o}</option>`
          ).join("")}
        </select>
        <input
          value="${esc(f.selector)}"
          placeholder="CSS selector"
          spellcheck="false"
          oninput="updateField(${i},'selector',this.value)"
        />
        <select onchange="updateField(${i},'type',this.value)">
          ${TYPE_OPTIONS.map(
            (o) => `<option value="${o}" ${f.type === o ? "selected" : ""}>${o}</option>`
          ).join("")}
        </select>
        <button class="remove-field" onclick="removeField(${i})" title="Remove">×</button>
      </div>
      ${
        showAttr
          ? `<div class="field-row" style="grid-template-columns:120px 1fr 120px auto;margin-top:-0.25rem">
              <span style="font-size:.75rem;color:var(--text-mute);text-align:right">attr key</span>
              <input
                value="${esc(f.attributeKey)}"
                placeholder="href, src, data-url…"
                spellcheck="false"
                oninput="updateField(${i},'attributeKey',this.value)"
              />
              <span></span><span></span>
            </div>`
          : ""
      }`;
    })
    .join("");
  generateYAML();
}

window.updateField = function (i, key, val) {
  fields[i][key] = val;
  if (key === "type" && val === "attribute" && !fields[i].attributeKey) {
    fields[i].attributeKey = fields[i].for === "link" ? "href" : fields[i].for === "image" ? "src" : "";
  }
  renderFields();
};

window.removeField = function (i) {
  fields.splice(i, 1);
  renderFields();
};

document.getElementById("add-field-btn").addEventListener("click", () => {
  const usedFor = new Set(fields.map((f) => f.for));
  const next = FIELD_OPTIONS.find((o) => !usedFor.has(o)) || "title";
  fields.push({ for: next, selector: "", type: "textContent", attributeKey: "" });
  renderFields();
});

// ── YAML generation ──────────────────────────────────────────────────────────

function generateYAML() {
  const name = document.getElementById("f-name").value.trim();
  const site = document.getElementById("f-site").value.trim();
  const title = document.getElementById("f-title").value.trim();
  const desc = document.getElementById("f-desc").value.trim();
  const root = document.getElementById("f-root").value.trim();

  if (!name && !site) {
    document.getElementById("yaml-output").innerHTML =
      "<code>feeds:\n  # Fill in the form on the left...</code>";
    return;
  }

  let yml = "feeds:\n";
  yml += `  - name: ${name || "my-feed"}\n`;
  yml += `    site: ${site || "https://example.com"}\n`;

  if (title || desc) {
    yml += "    metadata:\n";
    if (title) yml += `      title: ${title}\n`;
    if (desc) yml += `      description: ${desc}\n`;
    yml += "      language: en\n";
  }

  yml += `    root: "${root || ".item"}"\n`;

  if (fields.length > 0) {
    yml += "    fields:\n";
    for (const f of fields) {
      yml += `      - for: ${f.for}\n`;
      yml += `        selector: "${f.selector}"\n`;
      yml += `        type: ${f.type}\n`;
      if (f.type === "attribute" && f.attributeKey) {
        yml += `        attributeKey: ${f.attributeKey}\n`;
      }
    }
  }

  document.getElementById("yaml-output").innerHTML = `<code>${esc(yml)}</code>`;
}

// Wire up live regeneration
["f-name", "f-site", "f-title", "f-desc", "f-root"].forEach((id) => {
  document.getElementById(id).addEventListener("input", generateYAML);
});

document.getElementById("copy-yaml-btn").addEventListener("click", () => {
  const text = document.getElementById("yaml-output").textContent;
  navigator.clipboard.writeText(text).then(() => showToast("YAML copied!"));
});

// ── Test selectors ───────────────────────────────────────────────────────────

document.getElementById("test-btn").addEventListener("click", async () => {
  const site = document.getElementById("f-site").value.trim();
  const root = document.getElementById("f-root").value.trim();
  const results = document.getElementById("test-results");
  results.classList.remove("hidden");

  if (!site) {
    results.innerHTML = '<div class="test-err">Enter a target URL first.</div>';
    return;
  }

  if (!root) {
    results.innerHTML = '<div class="test-err">Enter a root CSS selector first.</div>';
    return;
  }

  results.innerHTML = '<div class="test-warn">⏳ Fetching page via CORS proxy…</div>';

  try {
    // Use a public CORS proxy — these are best-effort; users can self-host
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(site)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const roots = doc.querySelectorAll(root);
    let out = `<div class="test-ok">✓ Found <strong>${roots.length}</strong> items matching "${esc(root)}"</div>\n`;

    if (roots.length === 0) {
      out += `<div class="test-warn">⚠ No matches. Check your root selector.</div>`;
    } else {
      // Test each field against the first root
      const first = roots[0];
      out += `\n<div style="margin-top:.5rem;color:var(--text-dim)">Testing fields against first item:</div>`;

      for (const f of fields) {
        if (!f.selector) {
          out += `<div class="test-warn">  ${f.for}: (no selector set)</div>`;
          continue;
        }
        const el = first.querySelector(f.selector);
        if (!el) {
          out += `<div class="test-err">  ✗ ${f.for}: "${f.selector}" — not found</div>`;
        } else {
          let val =
            f.type === "attribute"
              ? el.getAttribute(f.attributeKey || "href")
              : el.textContent;
          if (val) val = val.trim().substring(0, 80);
          out += `<div class="test-ok">  ✓ ${f.for}: ${esc(val || "(empty)")}${
            val && val.length >= 80 ? "…" : ""
          }</div>`;
        }
      }

      // Show a few more items for confidence
      if (roots.length > 1) {
        out += `\n<div style="margin-top:.75rem;color:var(--text-dim)">Preview of first 3 items (title only):</div>`;
        const titleField = fields.find((f) => f.for === "title");
        for (let i = 0; i < Math.min(3, roots.length); i++) {
          if (titleField && titleField.selector) {
            const el = roots[i].querySelector(titleField.selector);
            const txt = el?.textContent?.trim().substring(0, 80) || "(no match)";
            out += `<div style="color:var(--text)">  ${i + 1}. ${esc(txt)}</div>`;
          }
        }
      }
    }

    results.innerHTML = `<pre style="margin:0">${out}</pre>`;
  } catch (err) {
    results.innerHTML = `<div class="test-err">✗ Failed: ${esc(err.message)}</div>
      <div class="test-warn" style="margin-top:.5rem">
        Note: The browser test uses a public CORS proxy which may be blocked or slow.
        The GitHub Action fetches directly without CORS restrictions and will work reliably.
      </div>`;
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

renderFields();
