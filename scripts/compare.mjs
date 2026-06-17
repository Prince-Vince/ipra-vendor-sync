// Diagnostic: churn between the OLD hardcoded page (90) and the LIVE web-visible list (92).
// Helps spot who dropped off the public directory (lapsed OR set to "don't display on web").
// Run: node scripts/compare.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const src = readFileSync(join(ROOT, '..', 'Refresh Pages', 'Pushed to Web', 'vendor-directory.html'), 'utf8');

function extractLiteral(marker, open, close) {
  const start = src.indexOf(marker);
  const from = src.indexOf(open, start);
  let depth = 0, i = from, inStr = false, q = '';
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (ch === '\\') { i++; continue; } if (ch === q) inStr = false; }
    else if (ch === '"' || ch === "'") { inStr = true; q = ch; }
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) { i++; break; } }
  }
  return Function('"use strict"; return (' + src.slice(from, i) + ');')();
}

const key = (s) => String(s).toLowerCase().replace(/[.,&']/g, '').replace(/\s+/g, ' ').trim();

const OLD = extractLiteral('var VENDORS =', '[', ']').map((v) => v.n);
const LIVE = JSON.parse(readFileSync(join(ROOT, 'vendors.json'), 'utf8')).vendors.map((v) => v.n);

const liveKeys = new Set(LIVE.map(key));
const oldKeys = new Set(OLD.map(key));
const dropped = OLD.filter((n) => !liveKeys.has(key(n))).sort();
const added = LIVE.filter((n) => !oldKeys.has(key(n))).sort();

console.log(`OLD hardcoded: ${OLD.length}    LIVE web-visible: ${LIVE.length}\n`);
console.log(`On OLD page but NOT web-visible now — lapsed or web-hidden (${dropped.length}):`);
dropped.forEach((n) => console.log('  - ' + n));
console.log(`\nWeb-visible now but NOT on old page — new members (${added.length}):`);
added.forEach((n) => console.log('  - ' + n));
