import { all, get } from '../db.js';
import { config } from '../config.js';
import { convert, formatMoney } from '../lib/money.js';
import { badRequest, notFound } from '../lib/http.js';
import { jsonArray } from '../lib/validate.js';

export function loadProduct(idOrSku) {
  const key = String(idOrSku);
  return get(
    `SELECT * FROM products WHERE sku = :key OR slug = :key OR id = :id`,
    { key, id: Number.isInteger(Number(key)) ? Number(key) : -1 }
  );
}

export function loadOptions(productId) {
  const options = all(
    `SELECT * FROM product_options WHERE product_id = :productId ORDER BY position, id`,
    { productId }
  );
  for (const option of options) {
    option.values = all(
      `SELECT * FROM product_option_values WHERE option_id = :optionId ORDER BY position, id`,
      { optionId: option.id }
    );
  }
  return options;
}

/** Which products a partner is allowed to display. */
export function catalogueFor(partner) {
  const rows = all(`SELECT * FROM products WHERE status = 'active' ORDER BY position, id`);
  if (!partner || partner.catalogue === 'all') return rows;
  const allowed = new Set(jsonArray(partner.catalogue).map(Number));
  return rows.filter((p) => allowed.has(p.id));
}

const pick = (row, field, locale) => row[`${field}_${locale === 'da' ? 'da' : 'en'}`] ?? '';

/** Shape a product for the widget, in the requested language and currency. */
export function presentProduct(product, { locale = 'da', currency = config.baseCurrency } = {}) {
  const options = loadOptions(product.id).map((option) => ({
    key: option.key,
    label: pick(option, 'label', locale),
    required: Boolean(option.required),
    values: option.values.map((value) => ({
      value: value.value,
      label: pick(value, 'label', locale),
      priceDelta: convert(value.price_delta, currency),
      priceDeltaLabel:
        value.price_delta === 0
          ? ''
          : `${value.price_delta > 0 ? '+' : '−'}${formatMoney(
              convert(Math.abs(value.price_delta), currency),
              currency,
              locale
            )}`,
    })),
  }));

  const basePrice = convert(product.base_price, currency);

  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    category: product.category,
    name: pick(product, 'name', locale),
    tagline: pick(product, 'tagline', locale),
    description: pick(product, 'description', locale),
    materials: pick(product, 'materials', locale),
    dimensions: product.dimensions,
    images: jsonArray(product.images),
    bespoke: Boolean(product.bespoke),
    leadTimeDays: product.lead_time_days,
    depositPct: product.deposit_pct,
    shippingPrice: convert(product.shipping_price, currency),
    basePrice,
    basePriceLabel: formatMoney(basePrice, currency, locale),
    fromLabel:
      locale === 'da'
        ? `Fra ${formatMoney(basePrice, currency, locale)}`
        : `From ${formatMoney(basePrice, currency, locale)}`,
    currency,
    options,
  };
}

/**
 * Prices a requested configuration from the database, never from the client.
 * Returns the gross unit price in base-currency øre plus resolved option labels.
 */
export function priceConfiguration(product, selection = {}, locale = 'da') {
  const options = loadOptions(product.id);
  let unitPrice = product.base_price;
  const resolved = [];

  for (const option of options) {
    const chosen = selection[option.key];
    if (chosen === undefined || chosen === null || chosen === '') {
      if (option.required) {
        throw badRequest(`Choose an option for “${pick(option, 'label', locale)}”`, {
          field: option.key,
        });
      }
      continue;
    }
    const match = option.values.find((v) => v.value === String(chosen));
    if (!match) {
      throw badRequest(`“${chosen}” is not available for ${pick(option, 'label', locale)}`, {
        field: option.key,
      });
    }
    unitPrice += match.price_delta;
    resolved.push({
      key: option.key,
      label: pick(option, 'label', locale),
      value: pick(match, 'label', locale),
      raw: match.value,
      priceDelta: match.price_delta,
    });
  }

  if (unitPrice <= 0) throw badRequest('Configured price is invalid');
  return { unitPrice, resolved };
}

export function requireProduct(idOrSku) {
  const product = loadProduct(idOrSku);
  if (!product || product.status !== 'active') throw notFound('Product not available');
  return product;
}
