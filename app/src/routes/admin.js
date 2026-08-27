import { config, CURRENCIES } from '../config.js';
import { all, get, run, tx, bindable, getSetting, setSetting } from '../db.js';
import {
  sendJson, readJson, badRequest, unauthorized, notFound,
  parseCookies, cookieHeader, rateLimit, clientIp,
} from '../lib/http.js';
import { hashPassword, verifyPassword, token, publicKey, portalKey } from '../lib/crypto.js';
import * as validate from '../lib/validate.js';
import { formatMoney } from '../lib/money.js';
import { loadOptions } from '../services/catalogue.js';
import { loadOrder, setOrderStatus } from '../services/orders.js';
import { retryQueued } from '../services/mail.js';

const COOKIE = 'dh_session';

export function currentAdmin(req) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw) return null;
  const session = get(
    `SELECT s.token, s.expires_at, a.id, a.email, a.name
       FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token = :token AND s.expires_at > datetime('now')`,
    { token: raw }
  );
  return session || null;
}

function requireAdmin(req) {
  const admin = currentAdmin(req);
  if (!admin) throw unauthorized('Log in to continue');
  return admin;
}

function saveOptions(productId, options) {
  run('DELETE FROM product_options WHERE product_id = :productId', { productId });
  if (!Array.isArray(options)) return;
  options.forEach((option, index) => {
    const key = validate.str(option.key || option.label_en || option.label_da, 'option key', { max: 40 });
    const result = run(
      `INSERT INTO product_options (product_id, key, label_da, label_en, required, position)
       VALUES (:productId, :key, :labelDa, :labelEn, :required, :position)`,
      bindable({
        productId,
        key: validate.slugify(key) || `option-${index + 1}`,
        labelDa: validate.str(option.label_da, 'option label (DA)', { max: 80 }),
        labelEn: validate.str(option.label_en || option.label_da, 'option label (EN)', { max: 80 }),
        required: option.required === false ? 0 : 1,
        position: index,
      })
    );
    const optionId = Number(result.lastInsertRowid);
    (option.values || []).forEach((value, valueIndex) => {
      run(
        `INSERT INTO product_option_values (option_id, value, label_da, label_en, price_delta, position)
         VALUES (:optionId, :value, :labelDa, :labelEn, :priceDelta, :position)`,
        bindable({
          optionId,
          value: validate.slugify(value.value || value.label_en || value.label_da) || `v${valueIndex + 1}`,
          labelDa: validate.str(value.label_da, 'value label (DA)', { max: 80 }),
          labelEn: validate.str(value.label_en || value.label_da, 'value label (EN)', { max: 80 }),
          priceDelta: validate.int(value.price_delta ?? 0, 'price delta', {
            min: -10_000_00, max: 10_000_000_00, fallback: 0,
          }),
          position: valueIndex,
        })
      );
    });
  });
}

function productPayload(row) {
  return { ...row, images: validate.jsonArray(row.images), options: loadOptions(row.id) };
}

function partnerPayload(row) {
  const stats = get(
    `SELECT COUNT(*) AS orders,
            COALESCE(SUM(total), 0) AS revenue,
            COALESCE(SUM(commission_amount), 0) AS commission,
            COALESCE(SUM(CASE WHEN commission_status = 'payable' THEN commission_amount ELSE 0 END), 0) AS commission_due
       FROM orders WHERE partner_id = :id AND status != 'cancelled'`,
    { id: row.id }
  );
  return {
    ...row,
    domains: validate.jsonArray(row.domains),
    catalogue: row.catalogue === 'all' ? 'all' : validate.jsonArray(row.catalogue),
    stats,
    embedSnippet: buildSnippet(row),
  };
}

function buildSnippet(partner) {
  return [
    `<!-- Danish Hawk — ${partner.name} -->`,
    `<div data-danishhawk-collection></div>`,
    `<script async src="${config.publicUrl}/embed.js" data-key="${partner.public_key}"></script>`,
  ].join('\n');
}

export async function handleAdminApi(req, res, url) {
  const path = url.pathname.replace(/^\/api\/admin/, '');

  // --- Session -------------------------------------------------------------
  if (req.method === 'POST' && path === '/login') {
    if (!rateLimit(`login:${clientIp(req)}`, 8, 15 * 60_000)) {
      throw badRequest('Too many login attempts. Try again in a few minutes.');
    }
    const body = await readJson(req);
    const email = validate.email(body.email);
    const password = validate.str(body.password, 'password', { max: 200 });
    const admin = get('SELECT * FROM admins WHERE email = :email', { email });
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      throw unauthorized('Wrong email or password');
    }
    const sessionToken = token(32);
    run(
      `INSERT INTO sessions (token, admin_id, expires_at)
       VALUES (:token, :adminId, datetime('now', :ttl))`,
      { token: sessionToken, adminId: admin.id, ttl: `+${config.sessionTtlHours} hours` }
    );
    run(`DELETE FROM sessions WHERE expires_at <= datetime('now')`);
    return sendJson(
      res, 200,
      { ok: true, admin: { email: admin.email, name: admin.name } },
      { 'set-cookie': cookieHeader(COOKIE, sessionToken, { maxAge: config.sessionTtlHours * 3600 }) }
    );
  }

  if (req.method === 'POST' && path === '/logout') {
    const raw = parseCookies(req)[COOKIE];
    if (raw) run('DELETE FROM sessions WHERE token = :token', { token: raw });
    return sendJson(res, 200, { ok: true }, { 'set-cookie': cookieHeader(COOKIE, '', { clear: true }) });
  }

  if (req.method === 'GET' && path === '/me') {
    const admin = currentAdmin(req);
    if (!admin) return sendJson(res, 200, { admin: null });
    return sendJson(res, 200, { admin: { email: admin.email, name: admin.name } });
  }

  requireAdmin(req);

  // --- Dashboard -----------------------------------------------------------
  if (req.method === 'GET' && path === '/stats') {
    const totals = get(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(commission_amount), 0) AS commission,
              COALESCE(SUM(CASE WHEN commission_status = 'payable' THEN commission_amount ELSE 0 END), 0) AS commission_due,
              COALESCE(SUM(amount_paid), 0) AS collected
         FROM orders WHERE status != 'cancelled'`
    );
    const open = get(
      `SELECT COUNT(*) AS n FROM orders
        WHERE status IN ('awaiting_payment','quote_requested','deposit_paid','in_production')`
    );
    const byPartner = all(
      `SELECT p.id, p.name, p.slug,
              COUNT(o.id) AS orders,
              COALESCE(SUM(o.total), 0) AS revenue,
              COALESCE(SUM(o.commission_amount), 0) AS commission
         FROM partners p
         LEFT JOIN orders o ON o.partner_id = p.id AND o.status != 'cancelled'
        GROUP BY p.id ORDER BY revenue DESC`
    );
    const funnel = all(
      `SELECT type, COUNT(*) AS n FROM events
        WHERE created_at > datetime('now', '-30 days') GROUP BY type`
    );
    const recent = all(
      `SELECT o.order_no, o.customer_name, o.total, o.status, o.kind, o.created_at, p.name AS partner_name
         FROM orders o LEFT JOIN partners p ON p.id = o.partner_id
        ORDER BY o.id DESC LIMIT 8`
    );
    const monthly = all(
      `SELECT strftime('%Y-%m', created_at) AS month,
              COUNT(*) AS orders,
              COALESCE(SUM(total), 0) AS revenue
         FROM orders WHERE status != 'cancelled'
        GROUP BY month ORDER BY month DESC LIMIT 12`
    );
    return sendJson(res, 200, {
      totals: { ...totals, openOrders: open.n },
      byPartner,
      funnel: Object.fromEntries(funnel.map((f) => [f.type, f.n])),
      recent,
      monthly,
      products: get(`SELECT COUNT(*) AS n FROM products WHERE status = 'active'`).n,
      partners: get(`SELECT COUNT(*) AS n FROM partners WHERE status = 'active'`).n,
    });
  }

  // --- Products ------------------------------------------------------------
  if (req.method === 'GET' && path === '/products') {
    return sendJson(res, 200, {
      products: all('SELECT * FROM products ORDER BY position, id').map(productPayload),
    });
  }

  if (req.method === 'POST' && path === '/products') {
    const body = await readJson(req);
    const id = tx(() => {
      const result = run(
        `INSERT INTO products (
           sku, slug, category, name_da, name_en, tagline_da, tagline_en,
           description_da, description_en, base_price, lead_time_days, deposit_pct,
           shipping_price, commission_rate, images, materials_da, materials_en,
           dimensions, bespoke, status, position
         ) VALUES (
           :sku, :slug, :category, :nameDa, :nameEn, :taglineDa, :taglineEn,
           :descDa, :descEn, :basePrice, :leadTime, :depositPct,
           :shippingPrice, :commissionRate, :images, :materialsDa, :materialsEn,
           :dimensions, :bespoke, :status, :position
         )`,
        productFields(body)
      );
      const productId = Number(result.lastInsertRowid);
      saveOptions(productId, body.options);
      return productId;
    });
    return sendJson(res, 201, { product: productPayload(get('SELECT * FROM products WHERE id = :id', { id })) });
  }

  const productMatch = path.match(/^\/products\/(\d+)$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    const existing = get('SELECT * FROM products WHERE id = :id', { id });
    if (!existing) throw notFound('Product not found');

    if (req.method === 'GET') return sendJson(res, 200, { product: productPayload(existing) });

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readJson(req);
      tx(() => {
        run(
          `UPDATE products SET
             sku = :sku, slug = :slug, category = :category,
             name_da = :nameDa, name_en = :nameEn,
             tagline_da = :taglineDa, tagline_en = :taglineEn,
             description_da = :descDa, description_en = :descEn,
             base_price = :basePrice, lead_time_days = :leadTime, deposit_pct = :depositPct,
             shipping_price = :shippingPrice, commission_rate = :commissionRate,
             images = :images, materials_da = :materialsDa, materials_en = :materialsEn,
             dimensions = :dimensions, bespoke = :bespoke, status = :status, position = :position,
             updated_at = datetime('now')
           WHERE id = :id`,
          { ...productFields({ ...existing, ...normaliseProductBody(existing, body) }), id }
        );
        if (body.options !== undefined) saveOptions(id, body.options);
      });
      return sendJson(res, 200, { product: productPayload(get('SELECT * FROM products WHERE id = :id', { id })) });
    }

    if (req.method === 'DELETE') {
      // Archive rather than delete: order history references products.
      run(`UPDATE products SET status = 'archived', updated_at = datetime('now') WHERE id = :id`, { id });
      return sendJson(res, 200, { ok: true });
    }
  }

  // --- Partners ------------------------------------------------------------
  if (req.method === 'GET' && path === '/partners') {
    return sendJson(res, 200, {
      partners: all('SELECT * FROM partners ORDER BY name').map(partnerPayload),
    });
  }

  if (req.method === 'POST' && path === '/partners') {
    const body = await readJson(req);
    const name = validate.str(body.name, 'name', { max: 120 });
    let slug = validate.slugify(body.slug || name);
    if (get('SELECT id FROM partners WHERE slug = :slug', { slug })) slug = `${slug}-${token(3)}`;
    const result = run(
      `INSERT INTO partners (
         name, slug, contact_name, email, phone, country, domains,
         public_key, portal_key, commission_rate, catalogue, locale, currency, theme, status, notes
       ) VALUES (
         :name, :slug, :contactName, :email, :phone, :country, :domains,
         :publicKey, :portalKey, :commissionRate, :catalogue, :locale, :currency, :theme, :status, :notes
       )`,
      bindable({
        name,
        slug,
        contactName: validate.str(body.contact_name, 'contact', { max: 120, required: false }),
        email: validate.email(body.email, 'email', { required: false }),
        phone: validate.str(body.phone, 'phone', { max: 40, required: false }),
        country: validate.str(body.country || 'DK', 'country', { max: 2, min: 2 }).toUpperCase(),
        domains: JSON.stringify(validate.hostList(body.domains)),
        publicKey: publicKey(),
        portalKey: portalKey(),
        commissionRate: validate.rate(body.commission_rate, 'commission rate', {
          fallback: config.defaultCommissionRate,
        }),
        catalogue: body.catalogue === 'all' || !body.catalogue
          ? 'all'
          : JSON.stringify(validate.jsonArray(body.catalogue).map(Number)),
        locale: validate.oneOf(body.locale, 'locale', ['da', 'en'], 'da'),
        currency: validate.oneOf(body.currency, 'currency', Object.keys(CURRENCIES), 'DKK'),
        theme: JSON.stringify(body.theme && typeof body.theme === 'object' ? body.theme : {}),
        status: validate.oneOf(body.status, 'status', ['active', 'paused', 'archived'], 'active'),
        notes: validate.str(body.notes, 'notes', { max: 2000, required: false }),
      })
    );
    const partner = get('SELECT * FROM partners WHERE id = :id', { id: Number(result.lastInsertRowid) });
    return sendJson(res, 201, { partner: partnerPayload(partner) });
  }

  const partnerMatch = path.match(/^\/partners\/(\d+)(\/rotate-key)?$/);
  if (partnerMatch) {
    const id = Number(partnerMatch[1]);
    const existing = get('SELECT * FROM partners WHERE id = :id', { id });
    if (!existing) throw notFound('Partner not found');

    if (partnerMatch[2] === '/rotate-key' && req.method === 'POST') {
      run(
        `UPDATE partners SET public_key = :key, updated_at = datetime('now') WHERE id = :id`,
        { id, key: publicKey() }
      );
      return sendJson(res, 200, { partner: partnerPayload(get('SELECT * FROM partners WHERE id = :id', { id })) });
    }

    if (req.method === 'GET') return sendJson(res, 200, { partner: partnerPayload(existing) });

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readJson(req);
      run(
        `UPDATE partners SET
           name = :name, contact_name = :contactName, email = :email, phone = :phone,
           country = :country, domains = :domains, commission_rate = :commissionRate,
           catalogue = :catalogue, locale = :locale, currency = :currency, theme = :theme,
           status = :status, notes = :notes, updated_at = datetime('now')
         WHERE id = :id`,
        bindable({
          id,
          name: validate.str(body.name ?? existing.name, 'name', { max: 120 }),
          contactName: validate.str(body.contact_name ?? existing.contact_name, 'contact', { max: 120, required: false }),
          email: validate.email(body.email ?? existing.email, 'email', { required: false }),
          phone: validate.str(body.phone ?? existing.phone, 'phone', { max: 40, required: false }),
          country: validate.str(body.country ?? existing.country, 'country', { max: 2, min: 2 }).toUpperCase(),
          domains: JSON.stringify(validate.hostList(body.domains ?? validate.jsonArray(existing.domains))),
          commissionRate: validate.rate(body.commission_rate ?? existing.commission_rate, 'commission rate'),
          catalogue: body.catalogue === undefined
            ? existing.catalogue
            : body.catalogue === 'all'
              ? 'all'
              : JSON.stringify(validate.jsonArray(body.catalogue).map(Number)),
          locale: validate.oneOf(body.locale ?? existing.locale, 'locale', ['da', 'en'], 'da'),
          currency: validate.oneOf(body.currency ?? existing.currency, 'currency', Object.keys(CURRENCIES), 'DKK'),
          theme: JSON.stringify(
            body.theme && typeof body.theme === 'object' ? body.theme : safeJson(existing.theme)
          ),
          status: validate.oneOf(body.status ?? existing.status, 'status', ['active', 'paused', 'archived'], 'active'),
          notes: validate.str(body.notes ?? existing.notes, 'notes', { max: 2000, required: false }),
        })
      );
      return sendJson(res, 200, { partner: partnerPayload(get('SELECT * FROM partners WHERE id = :id', { id })) });
    }

    if (req.method === 'DELETE') {
      run(`UPDATE partners SET status = 'archived', updated_at = datetime('now') WHERE id = :id`, { id });
      return sendJson(res, 200, { ok: true });
    }
  }

  // --- Orders --------------------------------------------------------------
  if (req.method === 'GET' && path === '/orders') {
    const status = url.searchParams.get('status');
    const partnerId = url.searchParams.get('partner');
    const clauses = [];
    const params = {};
    if (status) { clauses.push('o.status = :status'); params.status = status; }
    if (partnerId) { clauses.push('o.partner_id = :partnerId'); params.partnerId = Number(partnerId); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orders = all(
      `SELECT o.*, p.name AS partner_name FROM orders o
         LEFT JOIN partners p ON p.id = o.partner_id
         ${where} ORDER BY o.id DESC LIMIT 200`,
      params
    );
    return sendJson(res, 200, { orders });
  }

  const orderMatch = path.match(/^\/orders\/([\w-]+)$/);
  if (orderMatch) {
    const order = loadOrder(orderMatch[1]);
    if (!order) throw notFound('Order not found');

    if (req.method === 'GET') {
      const partner = order.partner_id
        ? get('SELECT id, name, slug, commission_rate FROM partners WHERE id = :id', { id: order.partner_id })
        : null;
      return sendJson(res, 200, {
        order: {
          ...order,
          items: order.items.map((i) => ({ ...i, options: validate.jsonArray(i.options_json) })),
          partner,
          mail: all('SELECT id, to_email, subject, status, created_at FROM outbox WHERE order_id = :id', { id: order.id }),
        },
      });
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      let updated = order;
      if (body.status) {
        updated = setOrderStatus(order.id, body.status, {
          internalNote: body.internal_note,
          amountPaid: body.amount_paid === undefined ? undefined : validate.int(body.amount_paid, 'amount paid', { min: 0 }),
        });
      } else if (body.internal_note !== undefined) {
        run(`UPDATE orders SET internal_note = :note, updated_at = datetime('now') WHERE id = :id`, {
          id: order.id, note: validate.str(body.internal_note, 'note', { max: 4000, required: false }),
        });
        updated = loadOrder(order.id);
      }
      if (body.commission_status) {
        run(`UPDATE orders SET commission_status = :cs, updated_at = datetime('now') WHERE id = :id`, {
          id: order.id,
          cs: validate.oneOf(body.commission_status, 'commission status', ['pending', 'payable', 'paid', 'void']),
        });
        updated = loadOrder(order.id);
      }
      return sendJson(res, 200, { order: updated });
    }
  }

  // --- Commission payouts ---------------------------------------------------
  if (req.method === 'GET' && path === '/payouts') {
    const rows = all(
      `SELECT p.id, p.name, p.email,
              COALESCE(SUM(CASE WHEN o.commission_status = 'payable' THEN o.commission_amount ELSE 0 END), 0) AS due,
              COALESCE(SUM(CASE WHEN o.commission_status = 'paid' THEN o.commission_amount ELSE 0 END), 0) AS paid,
              COUNT(CASE WHEN o.commission_status = 'payable' THEN 1 END) AS due_orders
         FROM partners p LEFT JOIN orders o ON o.partner_id = p.id
        GROUP BY p.id HAVING due > 0 OR paid > 0 ORDER BY due DESC`
    );
    return sendJson(res, 200, { payouts: rows.map((r) => ({ ...r, dueLabel: formatMoney(r.due) })) });
  }

  if (req.method === 'POST' && path === '/payouts/settle') {
    const body = await readJson(req);
    const partnerId = validate.int(body.partnerId, 'partnerId', { min: 1 });
    const result = run(
      `UPDATE orders SET commission_status = 'paid', updated_at = datetime('now')
        WHERE partner_id = :partnerId AND commission_status = 'payable'`,
      { partnerId }
    );
    return sendJson(res, 200, { ok: true, settled: result.changes });
  }

  // --- Outbox ---------------------------------------------------------------
  if (req.method === 'GET' && path === '/outbox') {
    return sendJson(res, 200, {
      mail: all('SELECT * FROM outbox ORDER BY id DESC LIMIT 100'),
      relayConfigured: Boolean(config.mailWebhookUrl),
    });
  }

  if (req.method === 'POST' && path === '/outbox/retry') {
    return sendJson(res, 200, { ok: true, attempted: retryQueued() });
  }

  // --- Settings -------------------------------------------------------------
  if (req.method === 'GET' && path === '/settings') {
    return sendJson(res, 200, {
      settings: {
        vatRate: config.vatRate,
        defaultCommissionRate: config.defaultCommissionRate,
        defaultDepositPct: config.defaultDepositPct,
        publicUrl: config.publicUrl,
        stripeConfigured: Boolean(config.stripeSecretKey),
        mailRelayConfigured: Boolean(config.mailWebhookUrl),
        announcement: getSetting('announcement', ''),
      },
      currencies: CURRENCIES,
    });
  }

  if (req.method === 'PATCH' && path === '/settings') {
    const body = await readJson(req);
    if (body.announcement !== undefined) {
      setSetting('announcement', validate.str(body.announcement, 'announcement', { max: 500, required: false }));
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && path === '/password') {
    const admin = requireAdmin(req);
    const body = await readJson(req);
    const record = get('SELECT * FROM admins WHERE id = :id', { id: admin.id });
    if (!verifyPassword(validate.str(body.current, 'current password'), record.password_hash)) {
      throw unauthorized('Current password is wrong');
    }
    const next = validate.str(body.next, 'new password', { min: 10, max: 200 });
    run('UPDATE admins SET password_hash = :hash WHERE id = :id', { id: admin.id, hash: hashPassword(next) });
    run('DELETE FROM sessions WHERE admin_id = :id', { id: admin.id });
    return sendJson(res, 200, { ok: true }, { 'set-cookie': cookieHeader(COOKIE, '', { clear: true }) });
  }

  throw notFound('Unknown admin endpoint');
}

function safeJson(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normaliseProductBody(existing, body) {
  return {
    sku: body.sku ?? existing.sku,
    slug: body.slug ?? existing.slug,
    category: body.category ?? existing.category,
    name_da: body.name_da ?? existing.name_da,
    name_en: body.name_en ?? existing.name_en,
    tagline_da: body.tagline_da ?? existing.tagline_da,
    tagline_en: body.tagline_en ?? existing.tagline_en,
    description_da: body.description_da ?? existing.description_da,
    description_en: body.description_en ?? existing.description_en,
    base_price: body.base_price ?? existing.base_price,
    lead_time_days: body.lead_time_days ?? existing.lead_time_days,
    deposit_pct: body.deposit_pct ?? existing.deposit_pct,
    shipping_price: body.shipping_price ?? existing.shipping_price,
    commission_rate: body.commission_rate === undefined ? existing.commission_rate : body.commission_rate,
    images: body.images ?? validate.jsonArray(existing.images),
    materials_da: body.materials_da ?? existing.materials_da,
    materials_en: body.materials_en ?? existing.materials_en,
    dimensions: body.dimensions ?? existing.dimensions,
    bespoke: body.bespoke ?? existing.bespoke,
    status: body.status ?? existing.status,
    position: body.position ?? existing.position,
  };
}

function productFields(body) {
  const name = validate.str(body.name_da || body.name_en, 'name', { max: 120 });
  return bindable({
    sku: validate.str(body.sku || validate.slugify(name).toUpperCase(), 'sku', { max: 40 }),
    slug: validate.slugify(body.slug || name),
    category: validate.str(body.category, 'category', { max: 60, required: false }),
    nameDa: name,
    nameEn: validate.str(body.name_en || name, 'name (EN)', { max: 120 }),
    taglineDa: validate.str(body.tagline_da, 'tagline (DA)', { max: 160, required: false }),
    taglineEn: validate.str(body.tagline_en, 'tagline (EN)', { max: 160, required: false }),
    descDa: validate.str(body.description_da, 'description (DA)', { max: 4000, required: false }),
    descEn: validate.str(body.description_en, 'description (EN)', { max: 4000, required: false }),
    basePrice: validate.int(body.base_price, 'base price', { min: 100, max: 100_000_000_00 }),
    leadTime: validate.int(body.lead_time_days ?? 42, 'lead time', { min: 0, max: 365, fallback: 42 }),
    depositPct: validate.rate(body.deposit_pct, 'deposit', { fallback: config.defaultDepositPct }),
    shippingPrice: validate.int(body.shipping_price ?? 0, 'shipping', { min: 0, max: 1_000_000_00, fallback: 0 }),
    commissionRate:
      body.commission_rate === null || body.commission_rate === undefined || body.commission_rate === ''
        ? null
        : validate.rate(body.commission_rate, 'commission rate'),
    images: JSON.stringify(
      validate.jsonArray(body.images).map((u) => String(u).trim()).filter(Boolean).slice(0, 12)
    ),
    materialsDa: validate.str(body.materials_da, 'materials (DA)', { max: 500, required: false }),
    materialsEn: validate.str(body.materials_en, 'materials (EN)', { max: 500, required: false }),
    dimensions: validate.str(body.dimensions, 'dimensions', { max: 200, required: false }),
    bespoke: body.bespoke === false || body.bespoke === 0 ? 0 : 1,
    status: validate.oneOf(body.status, 'status', ['active', 'draft', 'archived'], 'active'),
    position: validate.int(body.position ?? 0, 'position', { min: 0, max: 9999, fallback: 0 }),
  });
}
