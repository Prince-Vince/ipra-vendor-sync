// Verifies each vendor's editorial description/specialty against their live website.
// Fetches the site's title + meta description + h1 and flags blurbs whose key words
// don't appear on the site (likely-stale copy, like the McConnell mix-up).
// Run: node scripts/verify-descriptions.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const STOP = new Set(('and for the with services solutions of to park parks recreation agencies districts district ' +
  'illinois community communities providing offering public your their that this from full service commercial ' +
  'company firm including across throughout management products design designs solution inc llp corp ltd').split(/\s+/));

const vendors = JSON.parse(readFileSync(join(ROOT, 'vendors.json'), 'utf8')).vendors;
const targets = vendors.filter((v) => v.website && (v.desc || v.specialty));

function strip(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function firstMatch(re, html) { var m = html.match(re); return m ? m[1] : ''; }

async function signal(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    const html = await res.text();
    const title = strip(firstMatch(/<title[^>]*>([^<]*)<\/title>/i, html));
    const desc = firstMatch(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html) ||
                 firstMatch(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i, html);
    const og = firstMatch(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i, html);
    const h1 = strip(firstMatch(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html));
    return { ok: true, title: title, text: (title + ' ' + desc + ' ' + og + ' ' + h1).toLowerCase() };
  } catch (e) { return { ok: false, title: '', text: '' }; }
}

function keywords(v) {
  var t = ((v.specialty || '') + ' ' + (v.desc || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  return [...new Set(t.split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

const results = await pool(targets, 8, async (v) => {
  const s = await signal(v.website);
  const kws = keywords(v);
  const hits = s.ok ? kws.filter((k) => s.text.indexOf(k) !== -1) : [];
  return { v: v, ok: s.ok, title: s.title, hits: hits.length, kws: kws.length, sample: kws.slice(0, 6) };
});

function line(r) {
  return `  ${r.v.n}\n     specialty: ${r.v.specialty || '(none)'}\n     site title: ${r.ok ? (r.title || '(no title)') : 'FETCH FAILED'}  [${r.hits}/${r.kws} keywords matched]`;
}

const tierRank = { elite: 0, premium: 1, basic: 2 };
const featured = results.filter((r) => r.v.tier === 'elite' || r.v.tier === 'premium')
  .sort((a, b) => tierRank[a.v.tier] - tierRank[b.v.tier]);
const flagged = results.filter((r) => r.v.tier === 'basic' && r.ok && r.hits === 0);
const failed = results.filter((r) => !r.ok);

console.log(`Verified ${results.length} vendors with a website + description.\n`);
console.log(`===== ELITE / PREMIUM (review all — most visible) =====`);
featured.forEach((r) => console.log(line(r)));
console.log(`\n===== BASIC with ZERO keyword match (likely stale/wrong) — ${flagged.length} =====`);
flagged.forEach((r) => console.log(line(r)));
console.log(`\n===== FETCH FAILED (couldn't verify, check manually) — ${failed.length} =====`);
failed.forEach((r) => console.log(`  ${r.v.n}  (${r.v.website})`));
