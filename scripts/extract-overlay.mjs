// ONE-TIME seeding script: extracts the editorial data baked into the current
// vendor-directory.html (contact, city, email, tier, specialty, description) into
// data/editorial-overlay.json. After this, the overlay is hand-maintained.
//
// Run: node scripts/extract-overlay.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, '..', 'Refresh Pages', 'Pushed to Web', 'vendor-directory.html');
const OUT_DIR = join(ROOT, 'data');
const OUT = join(OUT_DIR, 'editorial-overlay.json');

const src = readFileSync(SRC, 'utf8');

// Pull a balanced [ ... ] or { ... } literal that follows a marker, then eval it.
function extractLiteral(marker, open, close) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('marker not found: ' + marker);
  const from = src.indexOf(open, start);
  let depth = 0, i = from, inStr = false, q = '';
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === q) inStr = false;
    } else if (ch === '"' || ch === "'") { inStr = true; q = ch; }
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) { i++; break; } }
  }
  const literal = src.slice(from, i);
  // eslint-disable-next-line no-new-func
  return Function('"use strict"; return (' + literal + ');')();
}

const VENDORS = extractLiteral('var VENDORS =', '[', ']');
const ELITE = new Set(extractLiteral('var ELITE_VENDORS =', '[', ']'));
const PREMIUM = new Set(extractLiteral('var PREMIUM_VENDORS =', '[', ']'));
const PROFILES = extractLiteral('var VENDOR_PROFILES =', '{', '}');

function tierOf(name) {
  if (ELITE.has(name)) return 'elite';
  if (PREMIUM.has(name)) return 'premium';
  return '';
}

// Editorial enrichment ONLY — tier, specialty, description. We deliberately do NOT
// carry over hardcoded names/contact/city/email; GrowthZone is the source of truth for those.
const overlay = {};
const names = new Set([...VENDORS.map((v) => v.n), ...Object.keys(PROFILES)]);
for (const name of names) {
  const prof = PROFILES[name] || {};
  const entry = {};
  // tier now comes from GrowthZone's real membership levels (data/levels.json), NOT from here.
  if (prof.specialty) entry.specialty = prof.specialty;
  if (prof.desc) entry.desc = prof.desc;
  if (Object.keys(entry).length) overlay[name] = entry;
}

// stable alphabetical key order
const sorted = {};
for (const k of Object.keys(overlay).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))) sorted[k] = overlay[k];

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(`Extracted overlay for ${Object.keys(sorted).length} vendors → ${OUT}`);
console.log(`  elite: ${[...ELITE].length}   premium: ${[...PREMIUM].length}   with profile: ${Object.keys(PROFILES).length}`);
