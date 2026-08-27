import { all, get, run, tx, bindable } from '../db.js';
import { config, CURRENCIES } from '../config.js';
import { commissionFor, depositFor, priceOrder, vatTreatment, formatMoney } from '../lib/money.js';
import { badRequest } from '../lib/http.js';
import { priceConfiguration, requireProduct } from './catalogue.js';
import * as validate from '../lib/validate.js';
import {
  queueMail,
  orderConfirmationMail,
  internalOrderMail,
  partnerNotificationMail,
} from './mail.js';

const MAX_LINES = 12;
const MAX_QTY = 20;

export function nextOrderNo() {
  const year = new Date().getFullYear();
  const row = get(
    `SELECT COUNT(*) AS n FROM orders WHERE order_no LIKE :prefix`,
    { prefix: `DH-${year}-%` }
  );
  return `DH-${year}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

/**
 * Builds an order from a client cart. Every price is recomputed server-side —
 * the client only says which product and which options.
 */
export function buildOrder({ cart, customer, partner, locale, kind }) {
  if (!Array.isArray(cart) || cart.length === 0) throw badRequest('Your basket is empty');
  if (cart.length > MAX_LINES) throw badRequest(`At most ${MAX_LINES} different pieces per order`);

  const lines = [];
  let shippingGross = 0;

  for (const entry of cart) {
    const product = requireProduct(entry.sku ?? entry.productId ?? entry.id);
    const quantity = validate.int(entry.quantity ?? 1, 'quantity', { min: 1, max: MAX_QTY });
    const { unitPrice, resolved } = priceConfiguration(product, entry.options || {}, locale);
    const lineTotal = unitPrice * quantity;
    shippingGross += product.shipping_price * quantity;
    lines.push({
      product,
      sku: product.sku,
      name: locale === 'da' ? product.name_da : product.name_en,
      unitPrice,
      quantity,
      lineTotal,
      options: resolved,
    });
  }

  const treatment = vatTreatment({ country: customer.country, vatNumber: customer.vatNumber });
  const totals = priceOrder({
    grossLines: lines.map((l) => l.lineTotal),
    shippingGross,
    treatment,
  });

  // The deposit follows the piece with the largest deposit requirement in the basket.
  const depositPct = kind === 'quote' ? 0 : Math.max(...lines.map((l) => l.product.deposit_pct), 0);
  const depositAmount = depositFor(totals.total, depositPct);

  // A product-level commission rate overrides the partner's default.
  const commissionRate = partner
    ? lines[0].product.commission_rate ?? partner.commission_rate
    : 0;
  const commissionAmount = partner ? commissionFor(totals.subtotalExVat, commissionRate) : 0;

  return { lines, totals, treatment, depositAmount, commissionRate, commissionAmount };
}

export function createOrder({
  cart,
  customer,
  partner,
  locale = 'da',
  displayCurrency = 'DKK',
  sourceUrl = '',
  kind = 'order',
}) {
  const built = buildOrder({ cart, customer, partner, locale, kind });
  const { lines, totals, depositAmount, commissionRate, commissionAmount } = built;

  const rate = CURRENCIES[displayCurrency]?.rate ?? 1;
  const orderNo = nextOrderNo();

  const orderId = tx(() => {
    const result = run(
      `INSERT INTO orders (
         order_no, partner_id, kind, status, locale, currency, display_currency, display_rate,
         customer_name, customer_email, customer_phone, company, vat_number,
         address_line1, address_line2, postal_code, city, country,
         subtotal_ex_vat, vat_amount, shipping_amount, total, deposit_amount,
         commission_rate, commission_amount, payment_provider, customer_note, source_url
       ) VALUES (
         :orderNo, :partnerId, :kind, :status, :locale, :currency, :displayCurrency, :displayRate,
         :name, :email, :phone, :company, :vatNumber,
         :address1, :address2, :postalCode, :city, :country,
         :subtotal, :vat, :shipping, :total, :deposit,
         :commissionRate, :commissionAmount, :provider, :note, :sourceUrl
       )`,
      bindable({
        orderNo,
        partnerId: partner?.id ?? null,
        kind,
        status: kind === 'quote' ? 'quote_requested' : 'awaiting_payment',
        locale,
        currency: config.baseCurrency,
        displayCurrency,
        displayRate: rate,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        company: customer.company,
        vatNumber: customer.vatNumber,
        address1: customer.address1,
        address2: customer.address2,
        postalCode: customer.postalCode,
        city: customer.city,
        country: customer.country,
        subtotal: totals.subtotalExVat,
        vat: totals.vatAmount,
        shipping: totals.shippingAmount,
        total: totals.total,
        deposit: depositAmount,
        commissionRate,
        commissionAmount,
        provider: 'invoice',
        note: customer.note,
        sourceUrl,
      })
    );
    const id = Number(result.lastInsertRowid);

    for (const line of lines) {
      run(
        `INSERT INTO order_items (order_id, product_id, sku, name, unit_price, quantity, line_total, options_json)
         VALUES (:orderId, :productId, :sku, :name, :unitPrice, :quantity, :lineTotal, :options)`,
        bindable({
          orderId: id,
          productId: line.product.id,
          sku: line.sku,
          name: line.name,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          options: JSON.stringify(line.options),
        })
      );
    }
    return id;
  });

  return loadOrder(orderId);
}

export function loadOrder(idOrNo) {
  const order = get(
    `SELECT * FROM orders WHERE id = :id OR order_no = :no`,
    { id: Number.isInteger(Number(idOrNo)) ? Number(idOrNo) : -1, no: String(idOrNo) }
  );
  if (!order) return null;
  order.items = all(`SELECT * FROM order_items WHERE order_id = :id ORDER BY id`, { id: order.id });
  return order;
}

export function notifyOrder(order) {
  const partner = order.partner_id
    ? get('SELECT * FROM partners WHERE id = :id', { id: order.partner_id })
    : null;

  const customerMail = orderConfirmationMail(order, order.items, partner);
  queueMail({ to: order.customer_email, ...customerMail, orderId: order.id });

  const internal = internalOrderMail(order, order.items, partner);
  queueMail({ to: config.adminEmail, ...internal, orderId: order.id });

  if (partner?.email) {
    const partnerMail = partnerNotificationMail(order, partner);
    queueMail({ to: partner.email, ...partnerMail, orderId: order.id });
  }
}

const STATUS_FLOW = [
  'awaiting_payment',
  'quote_requested',
  'quote_sent',
  'deposit_paid',
  'paid',
  'in_production',
  'shipped',
  'completed',
  'cancelled',
];

export function setOrderStatus(orderId, status, { amountPaid, internalNote } = {}) {
  if (!STATUS_FLOW.includes(status)) throw badRequest('Unknown order status');
  const fields = [`status = :status`, `updated_at = datetime('now')`];
  const params = { id: orderId, status };

  if (amountPaid !== undefined) {
    fields.push('amount_paid = :amountPaid');
    params.amountPaid = amountPaid;
  }
  if (internalNote !== undefined) {
    fields.push('internal_note = :internalNote');
    params.internalNote = internalNote;
  }
  // Commission is only owed once money has actually arrived.
  if (['deposit_paid', 'paid', 'in_production', 'shipped', 'completed'].includes(status)) {
    fields.push(`commission_status = CASE WHEN commission_status = 'pending' THEN 'payable' ELSE commission_status END`);
  }
  if (status === 'cancelled') {
    fields.push(`commission_status = CASE WHEN commission_status = 'paid' THEN 'paid' ELSE 'void' END`);
  }

  run(`UPDATE orders SET ${fields.join(', ')} WHERE id = :id`, bindable(params));
  return loadOrder(orderId);
}

export function markPaid(orderNo, { amount, provider, reference }) {
  const order = loadOrder(orderNo);
  if (!order) return null;
  const paid = (order.amount_paid || 0) + amount;
  run(
    `UPDATE orders
       SET amount_paid = :paid,
           status = :status,
           payment_provider = :provider,
           payment_ref = :reference,
           commission_status = CASE WHEN commission_status = 'pending' THEN 'payable' ELSE commission_status END,
           updated_at = datetime('now')
     WHERE id = :id`,
    bindable({
      id: order.id,
      paid,
      status: paid >= order.total ? 'paid' : 'deposit_paid',
      provider,
      reference,
    })
  );
  return loadOrder(order.id);
}

export function orderSummaryLine(order) {
  return `${order.order_no} · ${order.customer_name} · ${formatMoney(order.total, order.currency, order.locale)}`;
}
