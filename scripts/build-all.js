#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { CLIENTS, ROOT, authJS, reportsStoreJS } = require('./build-client-profiles.js');
const { indexHTML } = require('./build-client-pages.js');
const { builderHTML } = require('./build-client-pages2.js');
const { viewHTML, juneHTML } = require('./build-client-pages3.js');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function w(p, content) { fs.writeFileSync(p, content); console.log('wrote', path.relative(ROOT, p)); }

for (const c of CLIENTS) {
  const base = path.join(ROOT, c.slug);
  ensureDir(path.join(base, 'assets'));
  ensureDir(path.join(base, 'admin'));
  ensureDir(path.join(base, 'june-2026'));

  w(path.join(base, 'assets', 'auth.js'), authJS(c));
  w(path.join(base, 'assets', 'reports-store.js'), reportsStoreJS(c));
  w(path.join(base, 'index.html'), indexHTML(c));
  w(path.join(base, 'admin', 'builder.html'), builderHTML(c));
  w(path.join(base, 'admin', 'view.html'), viewHTML(c));
  w(path.join(base, 'june-2026', 'index.html'), juneHTML(c));
}
console.log('\nDone. Built', CLIENTS.length, 'client profiles.');
