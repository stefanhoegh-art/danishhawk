import { config } from '../config.js';
import { run, all, get } from '../db.js';
import { formatMoney } from '../lib/money.js';

/**
 * Mail is always persisted first, so nothing is lost when no relay is configured.
 * If MAIL_WEBHOOK_URL is set, the queued message is POSTed there
 * ({from, to, subject, text}) — any transactional provider accepts that shape.
 */
export function queueMail({ to, subject, body, orderId = null }) {
  const result = run(
    `INSERT INTO outbox (to_email, subject, body, order_id) VALUES (:to, :subject, :body, :orderId)`,
    { to, subject, body, orderId }
  );
  const id = Number(result.lastInsertRowid);
  if (config.mailWebhookUrl) queueMicrotask(() => deliver(id));
  return id;
}

async function deliver(id) {
  const mail = get('SELECT * FROM outbox WHERE id = :id', { id });
  if (!mail || mail.status === 'sent') return;
  try {
    const res = await fetch(config.mailWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: config.mailFrom,
        to: mail.to_email,
        subject: mail.subject,
        text: mail.body,
      }),
    });
    if (!res.ok) throw new Error(`relay responded ${res.status}`);
    run(`UPDATE outbox SET status = 'sent', sent_at = datetime('now'), error = '' WHERE id = :id`, { id });
  } catch (err) {
    run(`UPDATE outbox SET status = 'failed', error = :error WHERE id = :id`, {
      id,
      error: String(err.message).slice(0, 500),
    });
  }
}

export function retryQueued() {
  if (!config.mailWebhookUrl) return 0;
  const pending = all(`SELECT id FROM outbox WHERE status != 'sent' ORDER BY id LIMIT 50`);
  for (const row of pending) deliver(row.id);
  return pending.length;
}

const t = (locale, da, en) => (locale === 'da' ? da : en);

export function orderConfirmationMail(order, items, partner) {
  const l = order.locale;
  const lines = items
    .map((item) => {
      const opts = JSON.parse(item.options_json || '[]')
        .map((o) => `    ${o.label}: ${o.value}`)
        .join('\n');
      return `  ${item.quantity} × ${item.name} — ${formatMoney(item.line_total, order.currency, l)}${
        opts ? `\n${opts}` : ''
      }`;
    })
    .join('\n');

  const body = [
    t(l, `Kære ${order.customer_name},`, `Dear ${order.customer_name},`),
    '',
    t(
      l,
      `Tak for din bestilling hos Danish Hawk. Ordrenummer ${order.order_no}.`,
      `Thank you for your order with Danish Hawk. Order number ${order.order_no}.`
    ),
    partner ? t(l, `Bestilt via ${partner.name}.`, `Placed through ${partner.name}.`) : null,
    '',
    t(l, 'Din ordre:', 'Your order:'),
    lines,
    '',
    `${t(l, 'Subtotal (ekskl. moms)', 'Subtotal (excl. VAT)')}: ${formatMoney(order.subtotal_ex_vat, order.currency, l)}`,
    `${t(l, 'Fragt', 'Shipping')}: ${
      order.shipping_amount ? formatMoney(order.shipping_amount, order.currency, l) : t(l, 'oplyses efter mål', 'quoted after measuring')
    }`,
    `${t(l, 'Moms', 'VAT')}: ${formatMoney(order.vat_amount, order.currency, l)}`,
    `${t(l, 'I alt', 'Total')}: ${formatMoney(order.total, order.currency, l)}`,
    order.deposit_amount
      ? `${t(l, 'Depositum til opstart', 'Deposit to begin production')}: ${formatMoney(order.deposit_amount, order.currency, l)}`
      : null,
    '',
    t(
      l,
      'Vi tegner dit stykke i fuld 3D og sender en visualisering til godkendelse, før vi skærer.',
      'We model your piece in full 3D and send a visualisation for approval before we cut.'
    ),
    '',
    t(l, 'Venlig hilsen', 'Kind regards'),
    'Stefan Høgh — Danish Hawk',
    'danishhawk.com',
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    subject: t(l, `Ordrebekræftelse ${order.order_no} — Danish Hawk`, `Order confirmation ${order.order_no} — Danish Hawk`),
    body,
  };
}

export function internalOrderMail(order, items, partner) {
  const body = [
    `${order.kind === 'quote' ? 'QUOTE REQUEST' : 'NEW ORDER'} ${order.order_no}`,
    `Source: ${partner ? `${partner.name} (${partner.slug})` : 'direct'}`,
    `Page: ${order.source_url || '—'}`,
    '',
    `Customer: ${order.customer_name} <${order.customer_email}> ${order.customer_phone}`,
    order.company ? `Company: ${order.company} ${order.vat_number}` : null,
    `Ship to: ${order.address_line1} ${order.address_line2}, ${order.postal_code} ${order.city}, ${order.country}`,
    '',
    ...items.map((item) => {
      const opts = JSON.parse(item.options_json || '[]').map((o) => `${o.label}=${o.value}`).join(', ');
      return `${item.quantity} × ${item.sku} ${item.name}${opts ? ` [${opts}]` : ''} — ${formatMoney(item.line_total)}`;
    }),
    '',
    `Total: ${formatMoney(order.total)} (VAT ${formatMoney(order.vat_amount)})`,
    `Deposit: ${formatMoney(order.deposit_amount)}`,
    partner ? `Commission ${(order.commission_rate * 100).toFixed(1)}%: ${formatMoney(order.commission_amount)}` : null,
    order.customer_note ? `\nNote from customer:\n${order.customer_note}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    subject: `[Danish Hawk] ${order.kind === 'quote' ? 'Quote request' : 'Order'} ${order.order_no} — ${formatMoney(order.total)}`,
    body,
  };
}

export function partnerNotificationMail(order, partner) {
  const body = [
    `Hi ${partner.contact_name || partner.name},`,
    '',
    `A Danish Hawk piece just sold through your site — order ${order.order_no}.`,
    `Order value (excl. VAT): ${formatMoney(order.subtotal_ex_vat)}`,
    `Your commission (${(order.commission_rate * 100).toFixed(1)}%): ${formatMoney(order.commission_amount)}`,
    '',
    'Commission becomes payable once the customer’s deposit clears.',
    `Your live figures: ${config.publicUrl}/partner?key=${partner.portal_key}`,
    '',
    'Danish Hawk',
  ].join('\n');

  return { subject: `Sale through your site — ${order.order_no}`, body };
}
