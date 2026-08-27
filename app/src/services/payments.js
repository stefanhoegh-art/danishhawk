import { config } from '../config.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const stripeEnabled = () => Boolean(config.stripeSecretKey);

/** Stripe's REST API takes form-encoded bodies, so no SDK is needed. */
function encodeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') encodeForm(item, `${field}[${i}]`, out);
        else out.append(`${field}[${i}]`, String(item));
      });
    } else if (typeof value === 'object') {
      encodeForm(value, field, out);
    } else {
      out.append(field, String(value));
    }
  }
  return out;
}

async function stripeRequest(path, payload) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.stripeSecretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2024-06-20',
    },
    body: encodeForm(payload).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe request failed (${res.status})`);
  }
  return data;
}

/**
 * Creates a hosted Stripe Checkout session for the deposit (or the full amount
 * when no deposit applies). Returns null when Stripe is not configured, and the
 * caller falls back to invoicing the deposit.
 */
export async function createCheckoutSession({ order, items, amount }) {
  if (!stripeEnabled()) return null;

  const isDeposit = amount < order.total;
  const label = isDeposit
    ? order.locale === 'da'
      ? `Depositum — ordre ${order.order_no}`
      : `Deposit — order ${order.order_no}`
    : `Danish Hawk — ${order.order_no}`;

  const description = items
    .map((item) => `${item.quantity} × ${item.name}`)
    .join(', ')
    .slice(0, 380);

  const session = await stripeRequest('checkout/sessions', {
    mode: 'payment',
    customer_email: order.customer_email,
    client_reference_id: order.order_no,
    locale: order.locale === 'da' ? 'da' : 'en',
    success_url: `${config.publicUrl}/checkout/complete?order=${order.order_no}&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.publicUrl}/checkout/cancelled?order=${order.order_no}`,
    metadata: {
      order_no: order.order_no,
      order_id: String(order.id),
      partner_id: order.partner_id ? String(order.partner_id) : '',
    },
    payment_intent_data: {
      description: label,
      metadata: { order_no: order.order_no },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: amount,
          product_data: { name: label, description: description || undefined },
        },
      },
    ],
  });

  return { id: session.id, url: session.url };
}

/** Verifies a Stripe webhook signature (t=…,v1=…) without the SDK. */
export function verifyStripeSignature(rawBody, signatureHeader, toleranceSeconds = 300) {
  if (!config.stripeWebhookSecret) return { ok: false, reason: 'no webhook secret configured' };
  if (!signatureHeader) return { ok: false, reason: 'missing signature header' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  const expected = createHmac('sha256', config.stripeWebhookSecret)
    .update(`${parts.t}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const provided = String(parts.v1 || '');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
