#!/usr/bin/env node
/**
 * Fails if lead forms still point at a placeholder inbox, use a placeholder
 * phone, or reference a local file (css, js, images, and other extensioned
 * assets) that is not in the repo. Extensionless page links are routes, not
 * assets, and are left to the pages that own them.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const skipDirs = new Set(['.git', 'node_modules']);
const textExts = new Set([
  '.html', '.js', '.css', '.json', '.md', '.xml', '.txt', '.yml', '.yaml', '.svg',
]);

const forbidden = [
  { label: 'form' + 'spree', re: new RegExp('form' + 'spree', 'i') },
  { label: 'YOUR_' + 'FORM_ID', re: new RegExp('YOUR_' + 'FORM_ID', 'i') },
  { label: 'REPLACE_' + 'WITH', re: new RegExp('REPLACE_' + 'WITH', 'i') },
  { label: 'placeholder phone', re: new RegExp('555-\\d|\\(555\\)') },
];

const errors = [];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function isLocalUrl(url) {
  if (!url || url.startsWith('#')) return false;
  if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(url)) return false;
  if (url.startsWith('//')) return false;
  return true;
}

function resolveLocal(fromFile, raw) {
  const clean = decodeURIComponent(raw.split('#')[0].split('?')[0]);
  if (!isLocalUrl(clean)) return null;
  if (clean === '/') return path.join(root, 'index.html');
  const rel = clean.replace(/^\//, '');
  const abs = clean.startsWith('/')
    ? path.join(root, rel)
    : path.resolve(path.dirname(fromFile), clean);
  const normalized = path.normalize(abs);
  if (!normalized.startsWith(root + path.sep) && normalized !== root) {
    return { missing: true, target: normalized };
  }
  if (clean.endsWith('/') || (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory())) {
    return path.join(normalized, 'index.html');
  }
  return normalized;
}

const files = walk(root, []);

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!textExts.has(ext)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);

  for (const rule of forbidden) {
    if (rule.re.test(text)) {
      errors.push(rel + ' contains forbidden placeholder (' + rule.label + ')');
    }
  }

  if (ext === '.html' && /<form\b/i.test(text)) {
    if (!text.includes('/js/tdp-leads.js')) {
      errors.push(rel + ' has a form but does not load /js/tdp-leads.js');
    }
    if (!text.includes('name="company_website"')) {
      errors.push(rel + ' has a form but no company_website honeypot');
    }
  }

  if (ext === '.html') {
    const attr = /(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
    let match;
    while ((match = attr.exec(text))) {
      const url = match[1] || match[2];
      const pathOnly = url.split('#')[0].split('?')[0];
      const rooted = pathOnly.startsWith('/') || pathOnly.startsWith('./') || pathOnly.startsWith('../') || pathOnly.includes('/');
      if (!rooted || !/\.[a-z0-9]{1,8}$/i.test(pathOnly)) continue;
      const target = resolveLocal(file, url);
      if (!target) continue;
      if (target.missing || !fs.existsSync(target)) {
        errors.push(rel + ' references missing local asset ' + url);
      }
    }
  }
}

const leadsPath = path.join(root, 'js', 'tdp-leads.js');
if (!fs.existsSync(leadsPath)) {
  errors.push('js/tdp-leads.js is missing');
} else {
  const leads = fs.readFileSync(leadsPath, 'utf8');
  if (!leads.includes('63e7470e-fe1e-4367-aae0-56d0d6392d78')) {
    errors.push('js/tdp-leads.js is missing the TradeDeskPro profile id');
  }
  if (!leads.includes('https://www.tradedeskpro.com/api/leads')) {
    errors.push('js/tdp-leads.js is missing the TradeDeskPro leads URL');
  }
  if (/X-TDP-Lead-Secret/i.test(leads)) {
    errors.push('js/tdp-leads.js must not include a lead secret');
  }
}

if (errors.length) {
  console.error('Site check failed:');
  for (const err of errors) console.error(' - ' + err);
  process.exit(1);
}

console.log('Site check passed (' + files.length + ' files scanned).');
