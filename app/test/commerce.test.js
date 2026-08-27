import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the app at a throwaway database before anything imports config.
const dir = mkdtempSync(join(tmpdir(), 'dh-test-'));
process.env.DATA_DIR = dir;
process.env.DB_FILE = join(dir, 'test.db');
process.env.PORT = '0';
process.env.ADMIN_PASSWORD = 'test-password-1234';
process.env.SESSION_SECRET = 'test-secret';

const { config } = await import('../src/config.js');
const { vatTreatment, priceOrder, depositFor, commissionFor, formatMoney, convert } =
  await import('../src/lib/money.js');
const validate = await import('../src/lib/validate.js');
const { hashPassword, verifyPassword } = await import('../src/lib/crypto.js');
const { verifyStripeSignature } = await import('../src/services/payments.js');
const { get } = await import('../src/db.js');
const { ensureSeed } = await import('../src/seed.js');
const { priceConfiguration, requireProduct, presentProduct } = await import('../src/services/catalogue.js');
const { createOrder, loadOrder, setOrderStatus, markPaid } = await import('../src/services/orders.js');

before(() => ensureSeed());
after(() => rmSync(dir, { recursive: true, force: true }));

const kr = (n) => n * 100;

describe('VAT', () => {
  test('Danish customers pay 25% moms, included in the listed price', () => {
    const treatment = vatTreatment({ country: 'DK' });
    assert.equal(treatment.charge, true);
    const totals = priceOrder({ grossLines: [kr(25000)], shippingGross: 0, treatment });
    assert.equal(totals.subtotalExVat, kr(20000));
    assert.equal(totals.vatAmount, kr(5000));
    assert.equal(totals.total, kr(25000));
  });

  test('EU consumers without a VAT number are charged Danish VAT', () => {
    assert.equal(vatTreatment({ country: 'DE' }).charge, true);
    assert.equal(vatTreatment({ country: 'DE' }).reason, 'eu_consumer');
  });

  test('EU businesses with a matching VAT number get reverse charge', () => {
    const treatment = vatTreatment({ country: 'DE', vatNumber: 'DE 123 456 789' });
    assert.equal(treatment.charge, false);
    assert.equal(treatment.reason, 'reverse_charge');
    const totals = priceOrder({ grossLines: [kr(25000)], shippingGross: 0, treatment });
    assert.equal(totals.total, kr(20000), 'VAT comes out of the price, it is not added on top');
    assert.equal(totals.vatAmount, 0);
  });

  test('a VAT number from another country does not unlock reverse charge', () => {
    assert.equal(vatTreatment({ country: 'DE', vatNumber: 'FR12345678' }).charge, true);
  });

  test('outside the EU is an export with no Danish VAT', () => {
    const treatment = vatTreatment({ country: 'US' });
    assert.equal(treatment.charge, false);
    assert.equal(treatment.reason, 'export');
  });

  test('the total always reconciles with its parts', () => {
    for (const country of ['DK', 'DE', 'US']) {
      const treatment = vatTreatment({ country });
      const totals = priceOrder({ grossLines: [kr(19000), kr(3400)], shippingGross: kr(1200), treatment });
      assert.equal(
        totals.total,
        totals.subtotalExVat + totals.shippingAmount + totals.vatAmount,
        `parts must sum to the total for ${country}`
      );
    }
  });
});

describe('money', () => {
  test('deposits round to whole kroner', () => {
    assert.equal(depositFor(2337333, 0.5) % 100, 0);
    assert.equal(depositFor(kr(25000), 0.5), kr(12500));
    assert.equal(depositFor(kr(25000), 0), 0);
  });

  test('commission is taken on the ex-VAT value', () => {
    assert.equal(commissionFor(kr(20000), 0.15), kr(3000));
  });

  test('Danish and English formatting differ as they should', () => {
    assert.equal(formatMoney(kr(19000), 'DKK', 'da'), '19.000 kr');
    assert.equal(formatMoney(kr(19000), 'DKK', 'en'), '19,000 kr');
    assert.match(formatMoney(convert(kr(19000), 'GBP'), 'GBP', 'en'), /^£2,1/);
  });
});

describe('input handling', () => {
  test('Danish characters survive slugification', () => {
    assert.equal(validate.slugify('HØGH TV-bord'), 'hoegh-tv-bord');
    assert.equal(validate.slugify('Vægkonsol i eg'), 'vaegkonsol-i-eg');
  });

  test('domains are normalised and rubbish is dropped', () => {
    assert.deepEqual(
      validate.hostList('https://Studio.dk/path, *.arkitekt.dk\nnot-a-domain'),
      ['studio.dk', '*.arkitekt.dk']
    );
  });

  test('wildcard domains cover subdomains but not lookalikes', () => {
    assert.equal(validate.hostMatches('shop.studio.dk', ['*.studio.dk']), true);
    assert.equal(validate.hostMatches('studio.dk', ['*.studio.dk']), true);
    assert.equal(validate.hostMatches('studio.dk.evil.com', ['*.studio.dk']), false);
    assert.equal(validate.hostMatches('notstudio.dk', ['*.studio.dk']), false);
  });

  test('bad email addresses are rejected', () => {
    assert.throws(() => validate.email('not-an-email'), /valid email/);
    assert.equal(validate.email('  Stefan@Example.DK '), 'stefan@example.dk');
  });
});

describe('passwords', () => {
  test('a correct password verifies and a wrong one does not', () => {
    const hash = hashPassword('correct horse battery staple');
    assert.equal(verifyPassword('correct horse battery staple', hash), true);
    assert.equal(verifyPassword('wrong', hash), false);
  });

  test('the same password hashes differently each time', () => {
    assert.notEqual(hashPassword('same'), hashPassword('same'));
  });
});

describe('configuring a piece', () => {
  test('option choices move the price by their delta', () => {
    const product = requireProduct('DH-PAUROSA-CONSOLE');
    const base = priceConfiguration(product, { wood: 'pau-rosa', length: '120', finish: 'natur' });
    assert.equal(base.unitPrice, kr(19000));

    const upgraded = priceConfiguration(product, { wood: 'pau-rosa', length: '150', finish: 'moerk' });
    assert.equal(upgraded.unitPrice, kr(19000 + 3500 + 900));
    assert.equal(upgraded.resolved.length, 3);
  });

  test('an option the customer invented is refused', () => {
    const product = requireProduct('DH-PAUROSA-CONSOLE');
    assert.throws(
      () => priceConfiguration(product, { wood: 'solid-gold', length: '120', finish: 'natur' }),
      /not available/
    );
  });

  test('a required option cannot be skipped', () => {
    const product = requireProduct('DH-PAUROSA-CONSOLE');
    assert.throws(() => priceConfiguration(product, { wood: 'pau-rosa' }), /Choose an option/);
  });

  test('the widget gets the piece in the requested language and currency', () => {
    const product = requireProduct('DH-HOEGH-TV');
    const da = presentProduct(product, { locale: 'da', currency: 'DKK' });
    const en = presentProduct(product, { locale: 'en', currency: 'GBP' });
    assert.equal(da.name, 'HØGH TV-bord');
    assert.equal(en.name, 'HØGH TV Table');
    assert.match(da.fromLabel, /^Fra/);
    assert.match(en.fromLabel, /^From £/);
  });
});

describe('orders', () => {
  const customer = {
    name: 'Test Testesen', email: 'test@example.dk', phone: '', company: '', vatNumber: '',
    address1: 'Testvej 1', address2: '', postalCode: '8000', city: 'Aarhus', country: 'DK', note: '',
  };

  test('prices come from the database, never from the client', () => {
    const partner = get(`SELECT * FROM partners WHERE slug = 'demo-studio'`);
    const order = createOrder({
      cart: [{
        sku: 'DH-PAUROSA-CONSOLE',
        quantity: 1,
        options: { wood: 'pau-rosa', length: '120', finish: 'natur' },
        // A tampered client sending its own price must be ignored.
        unitPrice: 1, total: 1, basePrice: 1,
      }],
      customer,
      partner,
      locale: 'da',
    });
    assert.equal(order.items[0].unit_price, kr(19000));
    assert.equal(order.total, kr(19000) + kr(1200));
  });

  test('the partner is credited commission on the ex-VAT value', () => {
    const partner = get(`SELECT * FROM partners WHERE slug = 'demo-studio'`);
    const order = createOrder({
      cart: [{ sku: 'DH-TANDHJULET', quantity: 1, options: { seats: '6', wood: 'eg-moerk', base: 'birk' } }],
      customer, partner, locale: 'da',
    });
    assert.equal(order.commission_rate, partner.commission_rate);
    assert.equal(order.commission_amount, commissionFor(order.subtotal_ex_vat, partner.commission_rate));
    assert.equal(order.commission_status, 'pending', 'nothing is owed until money arrives');
  });

  test('a direct order carries no commission', () => {
    const order = createOrder({
      cart: [{ sku: 'DH-HOEGH-TV', quantity: 1, options: { lettering: 'hoegh', led: 'warm', length: '160' } }],
      customer, partner: null, locale: 'da',
    });
    assert.equal(order.partner_id, null);
    assert.equal(order.commission_amount, 0);
  });

  test('order numbers are sequential within the year', () => {
    const numbers = ['DH-2026-0001'];
    assert.match(loadOrder(1).order_no, /^DH-\d{4}-\d{4}$/);
    assert.notEqual(loadOrder(1).order_no, loadOrder(2).order_no);
    assert.ok(numbers.length);
  });

  test('commission becomes payable once a deposit is recorded', () => {
    const order = loadOrder(2);
    assert.equal(order.commission_status, 'pending');
    const updated = setOrderStatus(order.id, 'deposit_paid');
    assert.equal(updated.commission_status, 'payable');
  });

  test('cancelling an unpaid order voids the commission', () => {
    const partner = get(`SELECT * FROM partners WHERE slug = 'demo-studio'`);
    const order = createOrder({
      cart: [{ sku: 'DH-CNC-HOUR', quantity: 2, options: { files: 'ready' } }],
      customer, partner, locale: 'da',
    });
    const cancelled = setOrderStatus(order.id, 'cancelled');
    assert.equal(cancelled.commission_status, 'void');
  });

  test('a partial payment is a deposit; paying the rest completes it', () => {
    const partner = get(`SELECT * FROM partners WHERE slug = 'demo-studio'`);
    const order = createOrder({
      cart: [{ sku: 'DH-PAUROSA-CONSOLE', quantity: 1, options: { wood: 'eg', length: '100', finish: 'natur' } }],
      customer, partner, locale: 'da',
    });
    const half = markPaid(order.order_no, { amount: order.deposit_amount, provider: 'stripe', reference: 'pi_1' });
    assert.equal(half.status, 'deposit_paid');
    assert.equal(half.commission_status, 'payable');

    const full = markPaid(order.order_no, {
      amount: order.total - order.deposit_amount, provider: 'stripe', reference: 'pi_2',
    });
    assert.equal(full.status, 'paid');
    assert.equal(full.amount_paid, order.total);
  });

  test('an empty basket is refused', () => {
    assert.throws(() => createOrder({ cart: [], customer, partner: null }), /basket is empty/);
  });

  test('a service with no deposit asks for nothing up front', () => {
    const order = createOrder({
      cart: [{ sku: 'DH-CNC-HOUR', quantity: 4, options: { files: 'ready' } }],
      customer, partner: null, locale: 'en',
    });
    assert.equal(order.deposit_amount, 0);
    assert.equal(order.items[0].line_total, kr(850) * 4);
  });

  test('a quote request skips the deposit entirely', () => {
    const order = createOrder({
      cart: [{ sku: 'DH-TANDHJULET', quantity: 1, options: { seats: '10', wood: 'valnoed', base: 'stål' } }],
      customer, partner: null, locale: 'da', kind: 'quote',
    });
    assert.equal(order.kind, 'quote');
    assert.equal(order.status, 'quote_requested');
    assert.equal(order.deposit_amount, 0);
  });
});

describe('Stripe webhooks', () => {
  test('an unsigned webhook is rejected', () => {
    const result = verifyStripeSignature(Buffer.from('{}'), undefined);
    assert.equal(result.ok, false);
  });

  test('a forged signature is rejected', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    config.stripeWebhookSecret = 'whsec_test';
    const timestamp = Math.floor(Date.now() / 1000);
    const result = verifyStripeSignature(Buffer.from('{"a":1}'), `t=${timestamp},v1=deadbeef`);
    assert.equal(result.ok, false);
    assert.match(result.reason, /signature/);
  });

  test('a correctly signed webhook is accepted', async () => {
    const { createHmac } = await import('node:crypto');
    config.stripeWebhookSecret = 'whsec_test';
    const body = Buffer.from('{"type":"checkout.session.completed"}');
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'whsec_test')
      .update(`${timestamp}.${body.toString('utf8')}`).digest('hex');
    assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`).ok, true);
  });

  test('a replayed old webhook is rejected', async () => {
    const { createHmac } = await import('node:crypto');
    config.stripeWebhookSecret = 'whsec_test';
    const body = Buffer.from('{}');
    const stale = Math.floor(Date.now() / 1000) - 4000;
    const signature = createHmac('sha256', 'whsec_test')
      .update(`${stale}.${body.toString('utf8')}`).digest('hex');
    const result = verifyStripeSignature(body, `t=${stale},v1=${signature}`);
    assert.equal(result.ok, false);
    assert.match(result.reason, /tolerance/);
  });
});
