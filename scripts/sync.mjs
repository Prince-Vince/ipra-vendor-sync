// IPRA Vendor Directory sync
// Scrapes the PUBLIC GrowthZone "Commercial Member Directory (Website)" category pages,
// merges a hand-kept editorial overlay (descriptions/specialty/tier/city/contact),
// and writes vendors.json for the custom directory page to fetch().
//
// Zero dependencies — Node 18+ (global fetch). Run: node scripts/sync.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'vendors.json');
const OVERLAY_PATH = join(ROOT, 'data', 'editorial-overlay.json');
const LEVELS_PATH = join(ROOT, 'data', 'levels.json'); // GrowthZone membership level per member (from the report export)

// The directory's "All" button returns every web-visible member in one page,
// regardless of category (so uncategorized members are included too). term=#! url-encoded.
const ALL_URL = 'https://members.ilipra.org/ipra-partner-directory/FindStartsWith?term=%23%21';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MIN_EXPECTED = 50; // safety valve: never publish a near-empty file

function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}
// dedupe key — tolerant of punctuation/case/spacing differences between category pages
function keyOf(name) {
  return decode(name).toLowerCase().replace(/[.,&']/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseCards(html) {
  const out = [];
  const parts = html.split('<div class="card gz-directory-card');
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const nameM = block.match(/gz-card-title"[^>]*itemprop="name">\s*<a[^>]*itemprop="url"[^>]*>([^<]+)<\/a>/);
    if (!nameM) continue;
    const name = decode(nameM[1]);
    if (!name) continue;

    const logoM = block.match(/<img[^>]*itemprop="logo"[^>]*src="([^"]+)"/);
    const logoUrl = logoM ? decode(logoM[1]) : '';

    let website = '';
    const webM = block.match(/gz-card-website">[\s\S]*?<a\s+href="([^"]+)"/);
    if (webM) {
      website = decode(webM[1]);
    } else {
      const titleHrefM = block.match(/gz-card-title"[^>]*itemprop="name">\s*<a[^>]*href="([^"]+)"/);
      const h = titleHrefM ? decode(titleHrefM[1]) : '';
      if (/^https?:\/\//i.test(h) && !/members\.ilipra\.org\/.*\/Details\//i.test(h)) website = h;
    }

    const phoneM = block.match(/itemprop="telephone">([^<]+)</);
    const phone = phoneM ? decode(phoneM[1]) : '';

    // per-vendor PROTECTED contact form (GZ "Send Email") — reaches the vendor, no address exposed
    const contactM = block.match(/gz-card-email">[\s\S]*?<a\s+href="([^"]+)"/);
    const contactUrl = contactM ? decode(contactM[1]) : '';

    // categories live in the card-footer as <span class="gz-cat gz-cl-NN">Label</span>
    const cats = [];
    const catRe = /<span class="gz-cat[^"]*">([^<]+)<\/span>/g;
    let cm;
    while ((cm = catRe.exec(block))) {
      const c = decode(cm[1]);
      if (c && !cats.includes(c)) cats.push(c);
    }

    out.push({ name, website, phone, contactUrl, logoUrl, cats });
  }
  return out;
}

async function scrapeAll() {
  const html = await fetchText(ALL_URL);
  const cards = parseCards(html);
  console.log(`  Fetched directory "All" page: ${cards.length} cards`);

  const byKey = new Map();
  for (const card of cards) {
    const key = keyOf(card.name);
    if (!byKey.has(key)) byKey.set(key, { n: card.name, website: '', p: '', contactUrl: '', logoUrl: '', cats: new Set() });
    const v = byKey.get(key);
    for (const c of card.cats) v.cats.add(c);
    if (!v.website && card.website) v.website = card.website;
    if (!v.p && card.phone) v.p = card.phone;
    if (!v.contactUrl && card.contactUrl) v.contactUrl = card.contactUrl;
    if (!v.logoUrl && card.logoUrl) v.logoUrl = card.logoUrl;
  }
  return byKey;
}

function loadOverlay() {
  if (!existsSync(OVERLAY_PATH)) return {};
  const raw = JSON.parse(readFileSync(OVERLAY_PATH, 'utf8'));
  const map = {};
  for (const [name, data] of Object.entries(raw)) map[keyOf(name)] = data;
  return map;
}

// GrowthZone membership level per member. Anyone not listed defaults to 'basic'
// (blank level in the GZ report == Basic tier).
function loadLevels() {
  if (!existsSync(LEVELS_PATH)) return {};
  const raw = JSON.parse(readFileSync(LEVELS_PATH, 'utf8'));
  const map = {};
  for (const [name, tier] of Object.entries(raw)) map[keyOf(name)] = tier;
  return map;
}

async function main() {
  console.log('Scraping public GrowthZone partner directory…');
  const byKey = await scrapeAll();
  const overlay = loadOverlay();
  const levels = loadLevels();

  const vendors = [...byKey.values()]
    .map((v) => {
      // GrowthZone is authoritative for everything it publishes — NO hardcoded fallback.
      // The overlay is OPTIONAL editorial enrichment only (descriptions/specialty/tier that
      // GrowthZone has no field for) and only attaches to a vendor GZ already returned.
      const o = overlay[keyOf(v.n)] || {};
      return {
        n: v.n,                       // GrowthZone (authoritative)
        p: v.p,                       // GrowthZone
        website: v.website,           // GrowthZone
        contactUrl: v.contactUrl,     // GrowthZone protected contact form ("Send Email")
        logoUrl: v.logoUrl,           // GrowthZone (real member logo)
        cats: [...v.cats].sort(),     // GrowthZone
        tier: levels[keyOf(v.n)] || 'basic',  // GrowthZone membership level (blank == basic)
        specialty: o.specialty || '', // editorial
        desc: o.desc || '',           // editorial
      };
    })
    .sort((a, b) => a.n.toLowerCase().replace(/^[^a-z0-9]+/i, '').localeCompare(b.n.toLowerCase().replace(/^[^a-z0-9]+/i, '')));

  if (vendors.length < MIN_EXPECTED) {
    throw new Error(`Only ${vendors.length} vendors parsed (expected >= ${MIN_EXPECTED}). Aborting so we don't publish a broken file.`);
  }

  const uncategorized = vendors.filter((v) => !v.cats.length).map((v) => v.n);

  const payload = {
    source: 'members.ilipra.org/ipra-partner-directory (Commercial Member Directory — Website)',
    generatedAt: new Date().toISOString(),
    count: vendors.length,
    withLogos: vendors.filter((v) => v.logoUrl).length,
    withWebsite: vendors.filter((v) => v.website).length,
    withContactForm: vendors.filter((v) => v.contactUrl).length,
    withoutCategory: uncategorized.length,
    byTier: vendors.reduce((a, v) => ((a[v.tier] = (a[v.tier] || 0) + 1), a), {}),
    vendors,
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  writeFileSync(join(ROOT, 'uncategorized.txt'), uncategorized.join('\n') + '\n');
  console.log(`\nWrote ${vendors.length} vendors → ${OUT}`);
  console.log(`  with logo: ${payload.withLogos}   with website: ${payload.withWebsite}   uncategorized: ${uncategorized.length}`);
  if (uncategorized.length) {
    console.log('\nCompanies with NO category in the directory:');
    for (const n of uncategorized) console.log(`  - ${n}`);
  }
}

main().catch((err) => {
  console.error('\nSYNC FAILED:', err.message);
  process.exit(1);
});
