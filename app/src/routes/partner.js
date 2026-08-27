import { all, get } from '../db.js';
import { sendJson, notFound, unauthorized, rateLimit, clientIp } from '../lib/http.js';
import { formatMoney } from '../lib/money.js';
import { config } from '../config.js';

/**
 * Read-only figures for a partner, unlocked by their portal key.
 * Deliberately narrow: their own orders, their own commission, nothing else.
 */
export function handlePartnerApi(req, res, url) {
  if (!rateLimit(`portal:${clientIp(req)}`, 60, 60_000)) throw unauthorized('Too many requests');

  const key = url.searchParams.get('key') || req.headers['x-dh-key'] || '';
  const partner = key ? get('SELECT * FROM partners WHERE portal_key = :key', { key }) : null;
  if (!partner) throw unauthorized('Invalid portal key');

  const path = url.pathname.replace(/^\/api\/partner/, '');

  if (path === '' || path === '/' || path === '/summary') {
    const totals = get(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(commission_amount), 0) AS commission,
              COALESCE(SUM(CASE WHEN commission_status = 'payable' THEN commission_amount ELSE 0 END), 0) AS due,
              COALESCE(SUM(CASE WHEN commission_status = 'paid' THEN commission_amount ELSE 0 END), 0) AS paid
         FROM orders WHERE partner_id = :id AND status != 'cancelled'`,
      { id: partner.id }
    );

    const orders = all(
      `SELECT order_no, created_at, status, commission_status, total, commission_amount, kind
         FROM orders WHERE partner_id = :id ORDER BY id DESC LIMIT 50`,
      { id: partner.id }
    );

    const traffic = all(
      `SELECT type, COUNT(*) AS n FROM events
        WHERE partner_id = :id AND created_at > datetime('now', '-30 days')
        GROUP BY type`,
      { id: partner.id }
    );

    const topProducts = all(
      `SELECT p.sku, p.name_en AS name, SUM(i.quantity) AS units, SUM(i.line_total) AS revenue
         FROM order_items i
         JOIN orders o ON o.id = i.order_id
         JOIN products p ON p.id = i.product_id
        WHERE o.partner_id = :id AND o.status != 'cancelled'
        GROUP BY p.id ORDER BY revenue DESC LIMIT 5`,
      { id: partner.id }
    );

    return sendJson(res, 200, {
      partner: {
        name: partner.name,
        commissionRate: partner.commission_rate,
        publicKey: partner.public_key,
        domains: JSON.parse(partner.domains || '[]'),
        currency: partner.currency,
      },
      totals: {
        ...totals,
        revenueLabel: formatMoney(totals.revenue),
        commissionLabel: formatMoney(totals.commission),
        dueLabel: formatMoney(totals.due),
        paidLabel: formatMoney(totals.paid),
      },
      traffic: Object.fromEntries(traffic.map((t) => [t.type, t.n])),
      topProducts: topProducts.map((p) => ({ ...p, revenueLabel: formatMoney(p.revenue) })),
      orders: orders.map((o) => ({
        ...o,
        totalLabel: formatMoney(o.total),
        commissionLabel: formatMoney(o.commission_amount),
      })),
      embedSnippet: [
        '<div data-danishhawk-collection></div>',
        `<script async src="${config.publicUrl}/embed.js" data-key="${partner.public_key}"></script>`,
      ].join('\n'),
    });
  }

  throw notFound('Unknown partner endpoint');
}
