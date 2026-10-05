#!/usr/bin/env node
/*
 * Generates <slug>/live/index.html for every client that pulls Google Ads
 * data through the OAuth connect flow (google-oauth-worker) instead of
 * Maton. Run with no args to build all of them, or pass specific slugs:
 *
 *   node scripts/build-live-pages.js
 *   node scripts/build-live-pages.js scl gfs
 *
 * offgridpro is intentionally excluded (default and explicit) — it already
 * has its own working Live Metrics page powered by Maton. Don't build it
 * from this template; see /offgridpro/live/index.html.
 */
const fs = require('fs');
const path = require('path');
const { CLIENTS, ROOT } = require('./build-client-profiles.js');
const { liveHTML } = require('./build-live-page-template.js');
const { weeklyLiveHTML } = require('./build-live-page-weekly.js');

const args = process.argv.slice(2);
const targetSlugs = args.length ? args : CLIENTS.map((c) => c.slug).filter((s) => s !== 'offgridpro');

for (const slug of targetSlugs) {
  if (slug === 'offgridpro') {
    console.log('Skipping offgridpro — it has its own Maton-based Live Metrics page.');
    continue;
  }
  const c = CLIENTS.find((x) => x.slug === slug);
  if (!c) {
    console.error('Unknown client slug:', slug);
    continue;
  }
  const dir = path.join(ROOT, c.slug, 'live');
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, 'index.html');
  // Weekly (no-Ads) clients get the weekly Analytics/Search Console page.
  fs.writeFileSync(outPath, c.weekly ? weeklyLiveHTML(c) : liveHTML(c));
  console.log('wrote', path.relative(ROOT, outPath));
}
