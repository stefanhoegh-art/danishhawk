import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { config, ROOT } from './src/config.js';
import { get, run, getSetting } from './src/db.js';
import { ensureSeed } from './src/seed.js';
import {
  HttpError, sendJson, sendText, corsHeaders, securityHeaders,
  readBody, notFound, redirect,
} from './src/lib/http.js';
import { handlePublicApi } from './src/routes/public.js';
import { handleAdminApi } from './src/routes/admin.js';
import { handlePartnerApi } from './src/routes/partner.js';
import { verifyStripeSignature } from './src/services/payments.js';
import { markPaid, loadOrder } from './src/services/orders.js';
import { formatMoney } from './src/lib/money.js';

const PUBLIC_DIR = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(PUBLIC_DIR, clean);

  // Never escape the public directory.
  if (!filePath.startsWith(PUBLIC_DIR + sep) && filePath !== PUBLIC_DIR) return false;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

  const ext = extname(filePath).toLowerCase();
  const isWidget = filePath.endsWith(`${sep}embed.js`);
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': statSync(filePath).size,
    ...securityHeaders(),
  };

  if (isWidget) {
    // The widget is loaded cross-origin by partner sites.
    Object.assign(headers, corsHeaders(req), { 'cache-control': 'public, max-age=300' });
    delete headers['x-frame-options'];
  } else {
    headers['cache-control'] = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
  }

  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
  return true;
}

function checkoutPage({ title, heading, body, accent = '#c8a96e' }) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Danish Hawk</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f2ed;color:#0f0e0b;
       font-family:"DM Mono",monospace;font-weight:300;padding:24px}
  .card{max-width:520px;background:#eeebe5;border:1px solid #d8d2c8;padding:48px 40px;text-align:center}
  .mark{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:${accent};margin-bottom:28px}
  h1{font-family:"Cormorant Garamond",serif;font-weight:300;font-size:38px;line-height:1.15;margin:0 0 18px}
  p{font-size:13px;line-height:1.8;color:#4a4643;margin:0 0 14px}
  a{color:#0f0e0b;text-decoration:none;border-bottom:1px solid ${accent};padding-bottom:2px;font-size:12px;
    letter-spacing:.12em;text-transform:uppercase;display:inline-block;margin-top:22px}
</style></head>
<body><div class="card"><div class="mark">Danish Hawk</div><h1>${heading}</h1>${body}
<a href="https://danishhawk.com">danishhawk.com</a></div></body></html>`;
}

const server = createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendText(res, 400, 'Bad request');
  }

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      return res.end();
    }

    const path = url.pathname;

    // --- APIs --------------------------------------------------------------
    if (path.startsWith('/api/v1')) {
      res.setHeader('access-control-allow-origin', req.headers.origin || '*');
      res.setHeader('vary', 'Origin');
      return await handlePublicApi(req, res, url);
    }

    if (path.startsWith('/api/admin')) return await handleAdminApi(req, res, url);

    if (path.startsWith('/api/partner')) return handlePartnerApi(req, res, url);

    // --- Stripe webhook ----------------------------------------------------
    if (path === '/webhooks/stripe' && req.method === 'POST') {
      const raw = await readBody(req);
      const check = verifyStripeSignature(raw, req.headers['stripe-signature']);
      if (!check.ok) return sendJson(res, 400, { error: `Signature rejected: ${check.reason}` });

      const event = JSON.parse(raw.toString('utf8'));
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const orderNo = session.metadata?.order_no || session.client_reference_id;
        if (orderNo) {
          markPaid(orderNo, {
            amount: session.amount_total ?? 0,
            provider: 'stripe',
            reference: session.payment_intent || session.id,
          });
        }
      }
      return sendJson(res, 200, { received: true });
    }

    // --- Checkout return pages --------------------------------------------
    if (path === '/checkout/complete') {
      const order = loadOrder(url.searchParams.get('order') || '');
      const html = checkoutPage({
        title: 'Thank you',
        heading: order?.locale === 'da' ? 'Tak for din ordre.' : 'Thank you for your order.',
        body: order
          ? `<p>${order.locale === 'da' ? 'Ordrenummer' : 'Order number'} <strong>${order.order_no}</strong>.</p>
             <p>${
               order.locale === 'da'
                 ? 'Vi sender en 3D-visualisering til godkendelse, før vi skærer det første stykke træ.'
                 : 'We will send a 3D visualisation for your approval before we cut the first piece of timber.'
             }</p>
             <p>${order.locale === 'da' ? 'I alt' : 'Total'}: ${formatMoney(order.total, order.currency, order.locale)}</p>`
          : '<p>Your payment was received.</p>',
      });
      return sendText(res, 200, html, { 'content-type': 'text/html; charset=utf-8' });
    }

    if (path === '/checkout/cancelled') {
      const html = checkoutPage({
        title: 'Payment cancelled',
        heading: 'Payment cancelled.',
        body: `<p>Nothing has been charged. Your order is saved — reply to the confirmation email and we will send a payment link or an invoice instead.</p>`,
      });
      return sendText(res, 200, html, { 'content-type': 'text/html; charset=utf-8' });
    }

    // --- Health ------------------------------------------------------------
    if (path === '/health') {
      return sendJson(res, 200, {
        ok: true,
        products: get(`SELECT COUNT(*) AS n FROM products WHERE status = 'active'`).n,
        partners: get(`SELECT COUNT(*) AS n FROM partners WHERE status = 'active'`).n,
        stripe: Boolean(config.stripeSecretKey),
      });
    }

    // --- Demo shop ---------------------------------------------------------
    // Served through a template so the seeded demo key never has to be pasted in by hand.
    if (path === '/demo' || path === '/demo/') {
      const demoKey =
        getSetting('demoKey', '') ||
        get(`SELECT public_key FROM partners WHERE slug = 'demo-studio'`)?.public_key ||
        '';
      const html = readFileSync(join(PUBLIC_DIR, 'demo', 'index.html'), 'utf8')
        .replaceAll('__DEMO_KEY__', demoKey)
        .replaceAll('__ORIGIN__', config.publicUrl);
      return sendText(res, 200, html, { 'content-type': 'text/html; charset=utf-8' });
    }

    // --- Friendly routes ---------------------------------------------------
    if (path === '/') return redirect(res, '/admin/');
    if (path === '/admin') return redirect(res, '/admin/');
    if (path === '/partner') return redirect(res, `/partner/${url.search}`);

    if (serveStatic(req, res, path)) return;

    throw notFound(`Nothing at ${path}`);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[error]', req.method, url.pathname, err);
    if (res.headersSent) return res.end();
    const wantsJson =
      url.pathname.startsWith('/api') ||
      String(req.headers.accept || '').includes('application/json');
    if (wantsJson) {
      return sendJson(res, status, {
        error: status >= 500 ? 'Something went wrong on our side' : err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }
    return sendText(res, status, status >= 500 ? 'Internal error' : err.message);
  }
});

ensureSeed();

// Expire stale sessions once an hour.
setInterval(() => run(`DELETE FROM sessions WHERE expires_at <= datetime('now')`), 3600_000).unref();

server.listen(config.port, config.host, () => {
  console.log(`Danish Hawk commerce — listening on ${config.publicUrl}`);
  console.log(`  Admin      ${config.publicUrl}/admin/`);
  console.log(`  Widget     ${config.publicUrl}/embed.js`);
  console.log(`  Demo shop  ${config.publicUrl}/demo/`);
  if (!config.stripeSecretKey) {
    console.log('  Payments   invoice/deposit mode (set STRIPE_SECRET_KEY for card payments)');
  }
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
