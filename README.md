# Select Feed — GitHub Pages Edition

A serverless RSS feed generator powered by **GitHub Actions** + **GitHub Pages**. Define your feeds in a YAML config, and GitHub does the rest — scraping sites on a schedule and hosting your RSS feeds for free.

No servers. No Docker. No subscriptions. Just RSS.

> Inspired by [select-feed](https://github.com/AVeryLostNomad/select-feed) by @AVeryLostNomad — rewritten to run entirely on GitHub infrastructure.

## How It Works

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   feeds.yaml    │─────▶│  GitHub Action    │─────▶│   GitHub Pages      │
│   (your config) │      │  (scrapes sites)  │      │   (hosts .xml feeds)│
└─────────────────┘      └──────────────────┘      └─────────────────────┘
                              runs every 30 min         your-user.github.io/
                                                        select-feed/feeds/
                                                        my-feed.xml
```

1. You define feeds in `feeds.yaml` — target URL, CSS selectors, field mappings
2. A GitHub Action runs every 30 minutes (configurable)
3. It fetches each site, parses the HTML, and generates RSS XML
4. The XML files are deployed to GitHub Pages
5. Point any RSS reader at your Pages URL

## Quick Start

### 1. Use this template / fork this repo

### 2. Enable GitHub Pages
- Go to **Settings → Pages**
- Set source to **GitHub Actions**

### 3. Edit `feeds.yaml`

```yaml
feeds:
  - name: hackernews
    site: https://news.ycombinator.com
    metadata:
      title: Hacker News
      description: Links for the intellectually curious
      language: en
    root: ".athing"
    fields:
      - for: title
        selector: ".titleline > a"
        type: textContent
      - for: link
        selector: ".titleline > a"
        type: attribute
        attributeKey: href
```

### 4. Push and wait

The Action will run automatically. Your feeds will be available at:

```
https://<your-username>.github.io/<repo-name>/feeds/<feed-name>.xml
```

### 5. Use the Config Editor

Visit your GitHub Pages site — it includes a visual config editor that helps you build `feeds.yaml` entries with live selector testing.

## Config Reference

### Feed Structure

| Key         | Required | Description                                        |
|-------------|----------|----------------------------------------------------|
| `name`      | ✅       | Slug name — becomes the .xml filename              |
| `site`      | ✅       | URL to scrape                                      |
| `root`      | ✅       | CSS selector for the repeating item container       |
| `fields`    | ✅       | Array of field mappings (see below)                |
| `metadata`  |          | Feed-level metadata (title, description, language) |

### Field Mappings

| Key            | Required | Description                              |
|----------------|----------|------------------------------------------|
| `for`          | ✅       | Target field: title, description, link, content, date, author, image, contributor |
| `selector`     | ✅       | CSS selector relative to the root element |
| `type`         | ✅       | `textContent` or `attribute`             |
| `attributeKey` |          | Which attribute to read (when type is `attribute`) |

### Finding CSS Selectors

1. Open the target site in your browser
2. Right-click on a feed item → **Inspect**
3. Identify the repeating container element — that's your `root`
4. For each field, find the element *within* that container
5. Use the browser's "Copy selector" feature as a starting point

Or use the **Config Editor** on your Pages site for a guided experience with live testing.

## Customization

### Change the schedule

Edit `.github/workflows/update-feeds.yml`:

```yaml
schedule:
  - cron: "*/15 * * * *"   # every 15 minutes
  - cron: "0 * * * *"      # every hour
  - cron: "0 */6 * * *"    # every 6 hours
```

### Add more feeds

Just add more entries to `feeds.yaml` and push. The Action handles the rest.

## Project Structure

```
select-feed/
├── .github/workflows/
│   └── update-feeds.yml    # GitHub Action (cron + deploy)
├── scripts/
│   └── generate-feeds.mjs  # Node.js feed generator (ESM)
├── ui/
│   ├── index.html          # Dashboard + config editor
│   ├── style.css           # Styles
│   └── app.js              # UI logic
├── feeds.yaml              # Your feed configurations
└── README.md
```

## Differences from the Original

| Feature | Original select-feed | This version |
|---------|---------------------|--------------|
| Hosting | Self-hosted Docker | GitHub Pages (free) |
| Scheduling | Background Node process | GitHub Actions cron |
| Database | SQLite | YAML file in repo |
| Visual selector | Full in-app iframe UI | Config editor + browser DevTools |
| Cost | Your server | $0 |
| Setup | Docker Compose | Fork + enable Pages |

## License

MIT — same as the original project.
