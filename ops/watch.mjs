#!/usr/bin/env node
// The watchtower. One command that looks over the whole of Danish Hawk and says
// what is wrong, so nobody has to remember to look.
//
//   node ops/watch.mjs           the report, in prose
//   node ops/watch.mjs --json    the same findings, for a machine
//   node ops/watch.mjs --quick   skip the app's test suite
//
// Exit code 0 when everything holds, 1 when something needs a person.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_OUT = process.argv.includes('--json');
const QUICK = process.argv.includes('--quick');

const findings = [];
const report = (level, check, message) => findings.push({ level, check, message });
const fail = (check, message) => report('fail', check, message);
const warn = (check, message) => report('warn', check, message);
const note = (check, message) => report('note', check, message);

// Every .html file the public site serves. The app keeps its own pages and is
// not published by Netlify, so it is not part of the site's link graph.
function sitePages(dir = ROOT, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'app' || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sitePages(path, found);
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}

const pages = sitePages();

// A link is broken when nothing on disk answers it. That is the failure that
// reaches a customer as an empty photograph or a dead door.
function checkLinks() {
  let checked = 0;
  for (const page of pages) {
    const html = readFileSync(page, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const here = relative(ROOT, page);
    for (const [, , target] of html.matchAll(/(href|src)="([^"]*)"/g)) {
      if (!target || /^(https?:|mailto:|tel:|data:|#|\/\/)/.test(target)) continue;
      checked++;
      const path = target.split(/[?#]/)[0];
      const absolute = path.startsWith('/')
        ? join(ROOT, path)
        : join(dirname(page), path);
      const candidates = path.endsWith('/') || !path.split('/').pop().includes('.')
        ? [join(absolute, 'index.html'), absolute]
        : [absolute];
      if (!candidates.some(existsSync)) fail('links', `${here} points at ${target}, which is not there`);
    }
  }
  note('links', `${checked} internal links and images across ${pages.length} pages`);
}

// The sitemap is what Google is told exists, and a noindex tag is the page
// telling Google to forget it. A page doing both is invisible either way, and
// nobody finds out except by wondering where the enquiries went.
function checkSitemap() {
  const xml = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(([, url]) => new URL(url).pathname);

  for (const path of listed) {
    if (!existsSync(join(ROOT, path, 'index.html')) && !existsSync(join(ROOT, path))) {
      fail('sitemap', `the sitemap promises ${path}, which is not there`);
    }
  }

  let hidden = 0;
  for (const page of pages) {
    if (page.endsWith('404.html')) continue;
    const path = '/' + relative(ROOT, page).replace(/index\.html$/, '');
    const noindex = /<meta[^>]+noindex/i.test(readFileSync(page, 'utf8'));
    if (noindex && listed.includes(path)) {
      fail('sitemap', `${path} is in the sitemap and also marked noindex — Google is told to find it and then to forget it`);
    } else if (noindex) hidden++;
    else if (!listed.includes(path)) {
      warn('sitemap', `${path} can be indexed but is not in the sitemap — nobody is told it exists`);
    }
  }
  note('sitemap', `${listed.length} pages listed, ${hidden} deliberately hidden`);
}

// Photographs are the shop window. An asset nothing points at is only clutter,
// but it is worth saying, because it usually means a page was edited badly.
function checkAssets() {
  const referenced = new Set();
  for (const page of pages) {
    const html = readFileSync(join(page), 'utf8');
    for (const [, name] of html.matchAll(/assets\/([A-Za-z0-9._-]+)/g)) referenced.add(name);
  }
  const orphans = readdirSync(join(ROOT, 'assets')).filter((name) => !referenced.has(name));
  if (orphans.length) note('assets', `${orphans.length} unreferenced: ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? '…' : ''}`);
  note('assets', `${referenced.size} referenced by the site`);
}

// The commerce app holds orders and admin passwords. Neither its database nor
// its secrets may ever reach the repository.
function checkSecrets() {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  for (const path of tracked) {
    if (/(^|\/)\.env$|\.env\.(local|production)$/.test(path)) fail('secrets', `${path} is committed — rotate what is in it`);
    if (/\.(db|sqlite3?)$/.test(path)) fail('secrets', `${path} is committed — that is customer data in public`);
  }
  note('secrets', `${tracked.filter(Boolean).length} tracked files, none carrying secrets`);
}

// Netlify serves this repository as it stands. If the app ever became publicly
// servable, order handling would be exposed, so the 404 redirect is load-bearing.
function checkDeployConfig() {
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  if (!/from\s*=\s*"\/app\/\*"/.test(toml)) {
    fail('deploy', 'netlify.toml no longer hides /app/* — the webshop server would be served as files');
  }
  if (!/publish\s*=\s*"\."/.test(toml)) warn('deploy', 'netlify.toml no longer publishes the repository root');
  note('deploy', 'the webshop stays unpublished, the site builds from the root');
}

// The app's own tests are the only thing standing between a pricing bug and a
// wrong invoice.
function checkApp() {
  if (QUICK) return note('app', 'test suite skipped (--quick)');
  try {
    const out = execFileSync('npm', ['test'], { cwd: join(ROOT, 'app'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const pass = out.match(/^# pass (\d+)$/m)?.[1] ?? '?';
    note('app', `${pass} tests pass`);
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const failed = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map(([, name]) => name);
    fail('app', failed.length ? `failing tests: ${failed.join('; ')}` : 'the test suite did not pass');
  }
}

// The money. A wrong price is worse than a broken page: the page is noticed.
async function checkMoney() {
  const pricingFile = join(ROOT, 'assets', 'tandhjulet-pricing.js');
  if (!existsSync(pricingFile)) {
    return fail('money', 'assets/tandhjulet-pricing.js is gone — the page and the checkout would quote separately');
  }
  const pricing = await import(pathToFileURL(pricingFile).href);
  const server = readFileSync(join(ROOT, 'app', 'src', 'pricing', 'index.js'), 'utf8');
  if (!server.includes('assets/tandhjulet-pricing.js')) {
    fail('money', 'the server no longer quotes from the same file as the page — they can now disagree about a price');
  }
  if (!readFileSync(join(ROOT, 'tandhjulet', 'index.html'), 'utf8').includes('tandhjulet-pricing.js')) {
    fail('money', 'the Tandhjulet page no longer loads the pricing module — it cannot be quoting a real price');
  }

  // Nothing may ever be sold for less than it costs to make. The markup lives
  // in one constant, and one careless edit to it is a year of work given away.
  let worst = null;
  for (const diameter of [1855, 1900, 1950, 2000]) {
    for (const material of Object.keys(pricing.MATERIAL)) {
      for (const treatment of Object.keys(pricing.TREATMENT)) {
        for (const bearing of Object.keys(pricing.BEARING)) {
          const price = pricing.priceDKK({ diameter, material, treatment, bearing });
          const area = Math.pow(diameter / pricing.REF_DIA, 2);
          const cost = pricing.WORK_DKK
                     + (pricing.MATERIAL[material] + pricing.TREATMENT[treatment]) * area
                     + pricing.BEARING[bearing];
          const margin = price - cost;
          if (!worst || margin < worst.margin) worst = { margin, diameter, material, treatment, bearing, price };
        }
      }
    }
  }
  if (worst.margin <= 0) {
    fail('money', `a ${worst.diameter} mm ${worst.material} in ${worst.treatment} sells at ${worst.price} kr, which is at or below what it costs to build`);
  } else {
    note('money', `thinnest margin across the range: ${Math.round(worst.margin)} kr (${worst.diameter} mm ${worst.material})`);
  }

  // A price that rounds to nothing, or runs backwards as the table grows, means
  // the formula has been broken rather than merely re-tuned.
  let previous = 0;
  for (let d = pricing.MIN_DIA; d <= pricing.MAX_DIA; d += 5) {
    const price = pricing.priceDKK({ diameter: d, material: 'solid', treatment: 'olie', bearing: '601.5' });
    if (!(price > 0)) fail('money', `a ${d} mm table prices at ${price}`);
    if (price < previous) fail('money', `a ${d} mm table costs less than a smaller one`);
    previous = price;
  }

  // The rates the business runs on. An env file with 25 where 0.25 belongs would
  // invoice every customer twenty-five times over.
  const env = readFileSync(join(ROOT, 'app', 'src', 'config.js'), 'utf8');
  const vat = Number(env.match(/VAT_RATE, ([\d.]+)/)?.[1]);
  const commission = Number(env.match(/DEFAULT_COMMISSION_RATE, ([\d.]+)/)?.[1]);
  const deposit = Number(env.match(/DEFAULT_DEPOSIT_PCT, ([\d.]+)/)?.[1]);
  if (vat !== 0.25) fail('money', `the default VAT rate is ${vat}, and Danish moms is 0.25`);
  for (const [name, value] of [['commission', commission], ['deposit', deposit]]) {
    if (!(value >= 0 && value <= 1)) fail('money', `the default ${name} rate is ${value}, which is not a fraction`);
  }
  note('money', `moms ${vat * 100}%, commission ${commission * 100}%, deposit ${deposit * 100}%`);
}

// Whether the site is actually up. This needs the open internet, which a
// sandboxed run may not have — an unreachable proxy is not a down website, and
// saying so wrongly would be worse than saying nothing.
async function checkLive() {
  const url = 'https://' + readFileSync(join(ROOT, 'CNAME'), 'utf8').trim() + '/';
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const behindProxy = Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
    if (response.ok) note('live', `${url} answers ${response.status}`);
    else if (behindProxy && (response.status === 403 || response.status === 407)) {
      warn('live', `a proxy answered ${response.status} before reaching ${url} — not checked, not necessarily down`);
    } else fail('live', `${url} answers ${response.status}`);
  } catch (error) {
    warn('live', `could not reach ${url} from here (${error.cause?.code ?? error.name}) — not checked, not necessarily down`);
  }
}

checkLinks();
checkSitemap();
checkAssets();
checkSecrets();
checkDeployConfig();
checkApp();
await checkMoney();
await checkLive();

const failures = findings.filter((f) => f.level === 'fail');
const warnings = findings.filter((f) => f.level === 'warn');

if (JSON_OUT) {
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    ok: failures.length === 0,
    failures: failures.length,
    warnings: warnings.length,
    findings,
  }, null, 2));
} else {
  const mark = { fail: '✗', warn: '!', note: '·' };
  for (const { level, check, message } of findings) {
    console.log(`${mark[level]} ${check.padEnd(8)} ${message}`);
  }
  console.log('');
  console.log(failures.length
    ? `${failures.length} thing${failures.length > 1 ? 's need' : ' needs'} you.`
    : warnings.length
      ? `Nothing broken. ${warnings.length} worth a look.`
      : 'All well.');
}

process.exit(failures.length ? 1 : 0);
