# IPRA Vendor Directory — auto-sync

Builds **`vendors.json`** for the IPRA Vendor Directory page by reading IPRA's **public**
GrowthZone partner directory. **GrowthZone is the source of truth** — names, phone, website,
logo, and category all come straight from the live directory. No API key, no member PII.

```
GrowthZone public directory  ──scrape──►  GitHub Action (daily) ──►  commits vendors.json to this repo
  members.ilipra.org/ipra-partner-directory      │ scripts/sync.mjs                       │
  (the "All" view = every web-visible member)     │                                  served by GitHub
                                                   ├── data/levels.json   (membership tier, from the GZ report export)
                                                   └── data/editorial-overlay.json  (your descriptions + specialty tags)
                                                                                          │  fetch()
                                          IPRA Vendor Directory page (Beaver Builder) ◄────┘
    page fetches: https://raw.githubusercontent.com/Prince-Vince/ipra-vendor-sync/main/vendors.json
```

No Vercel needed — the page fetches `vendors.json` straight from GitHub (raw URLs are CORS-enabled).

## What comes from where

| Field | Source | Auto-updates? |
|---|---|---|
| Name, phone, website, logo, category | GrowthZone public directory (scraped) | ✅ daily |
| Membership tier (elite / premium / basic) | `data/levels.json` — seeded from the GZ membership report; **blank level = basic** | when you re-export the report |
| Description, specialty tag | `data/editorial-overlay.json` — your own copy | when you edit it |

Members set to **"don't display on web"** in GrowthZone won't appear (by design). Flip that
setting in GZ and they show up on the next sync — no code change.

## Run locally

```bash
node scripts/sync.mjs        # rebuild vendors.json from the live directory
```

Re-seed membership tiers after exporting a fresh GZ membership report (Name + Level columns):

```bash
python scripts/levels-from-report.py "C:\path\to\Membership Report.xlsx"
node scripts/sync.mjs
```

Add/adjust a vendor description or specialty tag: edit `data/editorial-overlay.json`
(keyed by company name), then `node scripts/sync.mjs`.

## Deploy (one-time)

1. Push this `vendor-sync/` folder to a GitHub repo (`Prince-Vince/ipra-vendor-sync`), default branch `main`.
2. Confirm the page's `VENDORS_URL` constant points at the committed file:
   `https://raw.githubusercontent.com/Prince-Vince/ipra-vendor-sync/main/vendors.json`
   (already the default in `vendor-directory.html` — just verify the repo name/branch match).
3. The included GitHub Action (`.github/workflows/sync-vendors.yml`) re-runs the sync **daily**
   and commits `vendors.json` whenever the directory changes. Run it on demand from the Actions
   tab ("Sync vendor directory" → Run workflow). No other hosting required.

> Optional upgrades: for a CDN-backed URL you can serve the repo via **GitHub Pages** or import it
> into **Vercel** (the included `vercel.json` adds CORS/cache headers) and point `VENDORS_URL` there
> instead. Not necessary for normal traffic.

## Files

- `scripts/sync.mjs` — scraper + merge → `vendors.json` (the only thing the daily job runs)
- `scripts/levels-from-report.py` — seeds `data/levels.json` from a GZ membership report (manual)
- `scripts/extract-overlay.mjs` — one-time seed of `data/editorial-overlay.json` from the old page
- `scripts/analyze_report.py`, `scripts/compare.mjs` — diagnostics (count reconciliation, churn)
