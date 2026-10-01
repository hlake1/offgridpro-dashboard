#!/usr/bin/env node
/*
 * Generates all client profile files, or just the ones named on the
 * command line:
 *
 *   node scripts/build-all.js                 # every client in CLIENTS
 *   node scripts/build-all.js bafmotorsport ipps   # just these two
 *
 * Always pass explicit slugs when onboarding new clients alongside
 * existing ones — running with no args regenerates EVERY client's
 * index.html/builder.html/etc. from the template, which would overwrite
 * any hand customisation made to existing clients since they were built.
 */
const fs = require('fs');
const path = require('path');
const { CLIENTS, ROOT, authJS, reportsStoreJS } = require('./build-client-profiles.js');
const { indexHTML } = require('./build-client-pages.js');
const { builderHTML } = require('./build-client-pages2.js');
const { viewHTML, juneHTML } = require('./build-client-pages3.js');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function w(p, content) { fs.writeFileSync(p, content); console.log('wrote', path.relative(ROOT, p)); }

function currentMonthFolder() {
  const d = new Date();
  const month = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  return `${month}-${d.getFullYear()}`;
}

const args = process.argv.slice(2);
const targets = args.length ? CLIENTS.filter((c) => args.includes(c.slug)) : CLIENTS;

if (args.length) {
  const found = new Set(targets.map((c) => c.slug));
  const missing = args.filter((s) => !found.has(s));
  if (missing.length) console.error('Unknown client slug(s), skipping:', missing.join(', '));
}

const monthFolder = currentMonthFolder();

for (const c of targets) {
  const base = path.join(ROOT, c.slug);
  ensureDir(path.join(base, 'assets'));
  ensureDir(path.join(base, 'admin'));
  ensureDir(path.join(base, monthFolder));

  w(path.join(base, 'assets', 'auth.js'), authJS(c));
  w(path.join(base, 'assets', 'reports-store.js'), reportsStoreJS(c));
  w(path.join(base, 'index.html'), indexHTML(c));
  w(path.join(base, 'admin', 'builder.html'), builderHTML(c));
  w(path.join(base, 'admin', 'view.html'), viewHTML(c));
  w(path.join(base, monthFolder, 'index.html'), juneHTML(c));
}
console.log('\nDone. Built', targets.length, 'client profile(s).');
