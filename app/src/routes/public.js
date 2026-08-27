import { config } from '../config.js';
import { all, get, run, bindable } from '../db.js';
import {
  sendJson, sendNoContent, readJson, badRequest, forbidden, notFound,
  originHost, rateLimit, clientIp,
} from '../lib/http.js';
import * as validate from '../lib/validate.js';
import { convert, formatMoney, priceOrder, vatTreatment, depositFor } from '../lib/money.js';
import { CURRENCIES } from '../config.js';
import { catalogueFor, presentProduct, priceConfiguration, requireProduct } from '../services/catalogue.js';
import { createOrder, notifyOrder, loadOrder } from '../services/orders.js';
import { createCheckoutSession, stripeEnabled } from '../services/payments.js';

const LOCALES = ['da', 'en'];

function resolveLocale(value, fallback = 'da') {
  const s = String(value || '').slice(0, 2).toLowerCase();
  return LOCALES.includes(s) ? s : fallback;
}

function resolveCurrency(value, fallback = config.baseCurrency) {
  const s = String(value || '').toUpperCase();
  return CURRENCIES[s] ? s : fallback;
}

/**
 * Resolves the partner behind a public key and checks the calling site is one
 * they registered. The key is public by design — the domain allowlist is what
 * stops someone else embedding the shop and claiming commission.
 */
export function resolvePartner(req, url, { required = true } = {}) {
  const key = url.searchParams.get('key') || req.headers['x-dh-key'] || '';
  if (!key) {
    if (required) throw badRequest('Missing embed key. Add data-key to the Danish Hawk script tag.');
    return null;
  }

  const partner = get('SELECT * FROM partners WHERE public_key = :key', { key });
  if (!partner) throw forbidden('Unknown embed key');
  if (partner.status !== 'active') throw forbidden('This Danish Hawk partner account is paused');

  const domains = validate.jsonArray(partner.domains);
  const host = originHost(req);
  const localDev = !host || host === 'localhost' || host === '127.0.0.1';

  if (domains.length && !localDev && !validate.hostMatches(host, domains)) {
    throw forbidden(`${host} is not a registered domain for this embed key`);
  }
  return partner;
}

function partnerPayload(partner) {
  const theme = (() => {
    try { return JSON.parse(partner.theme || '{}'); } catch { return {}; }
  })();
  return {
    name: partner.name,
    slug: partner.slug,
    locale: partner.locale,
    currency: partner.currency,
    theme,
  };
}

function trackEvent({ partnerId, productId = null, type, req, url }) {
  run(
    `INSERT INTO events (partner_id, product_id, type, visitor, url)
     VALUES (:partnerId, :productId, :type, :visitor, :url)`,
    bindable({
      partnerId,
      productId,
      type,
      visitor: String(url.searchParams.get('v') || '').slice(0, 64),
      url: String(req.headers.referer || '').slice(0, 500),
    })
  );
}

export async function handlePublicApi(req, res, url) {
  const path = url.pathname.replace(/^\/api\/v1/, '');

  if (!rateLimit(`api:${clientIp(req)}`, 300, 60_000)) {
    throw badRequest('Too many requests — slow down a moment');
  }

  // --- Widget bootstrap -----------------------------------------------------
  if (req.method === 'GET' && path === '/config') {
    const partner = resolvePartner(req, url);
    const locale = resolveLocale(url.searchParams.get('locale'), partner.locale);
    const currency = resolveCurrency(url.searchParams.get('currency'), partner.currency);
    const products = catalogueFor(partner);
    return sendJson(res, 200, {
      partner: partnerPayload(partner),
      locale,
      currency,
      vatRate: config.vatRate,
      payments: stripeEnabled() ? ['card', 'invoice'] : ['invoice'],
      categories: [...new Set(products.map((p) => p.category).filter(Boolean))],
      productCount: products.length,
      apiBase: `${config.publicUrl}/api/v1`,
    });
  }

  // --- Catalogue ------------------------------------------------------------
  if (req.method === 'GET' && path === '/products') {
    const partner = resolvePartner(req, url);
    const locale = resolveLocale(url.searchParams.get('locale'), partner.locale);
    const currency = resolveCurrency(url.searchParams.get('currency'), partner.currency);
    const category = url.searchParams.get('category');
    const skus = (url.searchParams.get('sku') || '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    let products = catalogueFor(partner);
    if (category) products = products.filter((p) => p.category === category);
    if (skus.length) products = products.filter((p) => skus.includes(p.sku));

    return sendJson(res, 200, {
      currency,
      locale,
      products: products.map((p) => presentProduct(p, { locale, currency })),
    });
  }

  if (req.method === 'GET' && path.startsWith('/products/')) {
    const partner = resolvePartner(req, url);
    const locale = resolveLocale(url.searchParams.get('locale'), partner.locale);
    const currency = resolveCurrency(url.searchParams.get('currency'), partner.currency);
    const sku = decodeURIComponent(path.slice('/products/'.length));

    const allowed = catalogueFor(partner);
    const product = allowed.find((p) => p.sku === sku || p.slug === sku || String(p.id) === sku);
    if (!product) throw notFound('That piece is not available here');

    trackEvent({ partnerId: partner.id, productId: product.id, type: 'view', req, url });
    return sendJson(res, 200, { product: presentProduct(product, { locale, currency }) });
  }

  // --- Live pricing ---------------------------------------------------------
  if (req.method === 'POST' && path === '/price') {
    const partner = resolvePartner(req, url);
    const body = await readJson(req);
    const locale = resolveLocale(body.locale, partner.locale);
    const currency = resolveCurrency(body.currency, partner.currency);
    const cart = Array.isArray(body.cart) ? body.cart : [];
    if (!cart.length) throw badRequest('Nothing to price');

    const allowedIds = new Set(catalogueFor(partner).map((p) => p.id));
    let shippingGross = 0;
    let maxDeposit = 0;
    const grossLines = [];
    const detail = [];

    for (const entry of cart) {
      const product = requireProduct(entry.sku ?? entry.productId);
      if (!allowedIds.has(product.id)) throw forbidden('That piece is not available here');
      const quantity = validate.int(entry.quantity ?? 1, 'quantity', { min: 1, max: 20 });
      const { unitPrice, resolved } = priceConfiguration(product, entry.options || {}, locale);
      grossLines.push(unitPrice * quantity);
      shippingGross += product.shipping_price * quantity;
      maxDeposit = Math.max(maxDeposit, product.deposit_pct);
      detail.push({
        sku: product.sku,
        name: locale === 'da' ? product.name_da : product.name_en,
        quantity,
        options: resolved.map((o) => ({ label: o.label, value: o.value })),
        unitPrice: convert(unitPrice, currency),
        unitPriceLabel: formatMoney(convert(unitPrice, currency), currency, locale),
        lineTotal: convert(unitPrice * quantity, currency),
        lineTotalLabel: formatMoney(convert(unitPrice * quantity, currency), currency, locale),
      });
    }

    const treatment = vatTreatment({ country: body.country, vatNumber: body.vatNumber });
    const totals = priceOrder({ grossLines, shippingGross, treatment });
    const deposit = depositFor(totals.total, maxDeposit);

    const money = (amount) => ({
      amount: convert(amount, currency),
      label: formatMoney(convert(amount, currency), currency, locale),
    });

    return sendJson(res, 200, {
      currency,
      locale,
      lines: detail,
      vat: { charged: treatment.charge, reason: treatment.reason, rate: treatment.rate },
      subtotal: money(totals.subtotalExVat),
      shipping: { ...money(totals.shippingAmount), quoted: totals.shippingAmount === 0 },
      vatAmount: money(totals.vatAmount),
      total: money(totals.total),
      settlement: {
        currency: config.baseCurrency,
        total: totals.total,
        label: formatMoney(totals.total, config.baseCurrency, locale),
      },
      deposit: { ...money(deposit), pct: maxDeposit },
      balance: money(totals.total - deposit),
    });
  }

  // --- Order placement ------------------------------------------------------
  if (req.method === 'POST' && path === '/orders') {
    const partner = resolvePartner(req, url);
    if (!rateLimit(`order:${clientIp(req)}`, 10, 60 * 60_000)) {
      throw badRequest('Too many orders from this connection — please contact us directly');
    }

    const body = await readJson(req);
    const locale = resolveLocale(body.locale, partner.locale);
    const displayCurrency = resolveCurrency(body.currency, partner.currency);
    const kind = validate.oneOf(body.kind, 'kind', ['order', 'quote'], 'order');
    const wantsCard = body.payment === 'card' && stripeEnabled() && kind === 'order';

    // Honeypot: real customers never fill this field.
    if (String(body.website || '').trim()) return sendJson(res, 200, { ok: true, orderNo: 'DH-0000-0000' });

    const needsAddress = kind === 'order';
    const customer = {
      name: validate.str(body.name, 'name', { max: 120 }),
      email: validate.email(body.email),
      phone: validate.str(body.phone, 'phone', { max: 40, required: false }),
      company: validate.str(body.company, 'company', { max: 120, required: false }),
      vatNumber: validate.str(body.vatNumber, 'vatNumber', { max: 40, required: false }),
      address1: validate.str(body.address1, 'address', { max: 160, required: needsAddress }),
      address2: validate.str(body.address2, 'address2', { max: 160, required: false }),
      postalCode: validate.str(body.postalCode, 'postal code', { max: 20, required: needsAddress }),
      city: validate.str(body.city, 'city', { max: 80, required: needsAddress }),
      country: validate.str(body.country, 'country', { max: 2, min: 2 }).toUpperCase(),
      note: validate.str(body.note, 'note', { max: 2000, required: false }),
    };

    const allowedIds = new Set(catalogueFor(partner).map((p) => p.id));
    for (const entry of body.cart || []) {
      const product = requireProduct(entry.sku ?? entry.productId);
      if (!allowedIds.has(product.id)) throw forbidden('That piece is not available here');
    }

    const order = createOrder({
      cart: body.cart,
      customer,
      partner,
      locale,
      displayCurrency,
      sourceUrl: String(req.headers.referer || '').slice(0, 500),
      kind,
    });

    trackEvent({ partnerId: partner.id, type: kind === 'quote' ? 'quote' : 'order', req, url });

    let paymentUrl = '';
    if (wantsCard) {
      const amount = order.deposit_amount || order.total;
      try {
        const session = await createCheckoutSession({ order, items: order.items, amount });
        if (session) {
          paymentUrl = session.url;
          run(
            `UPDATE orders SET payment_provider = 'stripe', payment_ref = :ref, payment_url = :url WHERE id = :id`,
            { id: order.id, ref: session.id, url: session.url }
          );
        }
      } catch (err) {
        // Payment setup failing must not lose the order — fall back to invoicing.
        console.error('[stripe] checkout session failed:', err.message);
        run(`UPDATE orders SET internal_note = :note WHERE id = :id`, {
          id: order.id,
          note: `Stripe checkout failed: ${err.message}`,
        });
      }
    }

    notifyOrder(order);

    return sendJson(res, 201, {
      ok: true,
      orderNo: order.order_no,
      kind: order.kind,
      status: order.status,
      total: { amount: order.total, label: formatMoney(order.total, order.currency, locale) },
      deposit: {
        amount: order.deposit_amount,
        label: formatMoney(order.deposit_amount, order.currency, locale),
      },
      paymentUrl,
      leadTimeDays: Math.max(
        ...order.items.map(
          (item) =>
            get('SELECT lead_time_days FROM products WHERE id = :id', { id: item.product_id })
              ?.lead_time_days ?? 42
        )
      ),
    });
  }

  // --- Analytics beacon -----------------------------------------------------
  if (req.method === 'POST' && path === '/events') {
    const partner = resolvePartner(req, url, { required: false });
    if (!partner) return sendNoContent(res);
    const body = await readJson(req);
    const type = validate.oneOf(body.type, 'type', ['view', 'open', 'configure', 'checkout_start'], 'view');
    const product = body.sku ? all('SELECT id FROM products WHERE sku = :sku', { sku: body.sku })[0] : null;
    run(
      `INSERT INTO events (partner_id, product_id, type, visitor, url)
       VALUES (:partnerId, :productId, :type, :visitor, :url)`,
      bindable({
        partnerId: partner.id,
        productId: product?.id ?? null,
        type,
        visitor: String(body.visitor || '').slice(0, 64),
        url: String(body.url || req.headers.referer || '').slice(0, 500),
      })
    );
    return sendNoContent(res);
  }

  // --- Order status lookup (customer-facing, needs the order number + email) --
  if (req.method === 'POST' && path === '/order-status') {
    const body = await readJson(req);
    const orderNo = validate.str(body.orderNo, 'order number', { max: 32 });
    const email = validate.email(body.email);
    if (!rateLimit(`status:${clientIp(req)}`, 20, 60_000)) throw badRequest('Too many lookups');
    const order = loadOrder(orderNo);
    if (!order || order.customer_email !== email) throw notFound('No order found with those details');
    return sendJson(res, 200, {
      orderNo: order.order_no,
      status: order.status,
      placedAt: order.created_at,
      total: formatMoney(order.total, order.currency, order.locale),
      paid: formatMoney(order.amount_paid, order.currency, order.locale),
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity })),
    });
  }

  throw notFound('Unknown API endpoint');
}
