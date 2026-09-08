import { all, get } from '../db.js';
import { config } from '../config.js';
import { convert, formatMoney } from '../lib/money.js';
import { badRequest, notFound } from '../lib/http.js';
import { jsonArray } from '../lib/validate.js';
import { PRICING_MODELS } from '../pricing/index.js';

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
    /* A range option is a number the buyer slides to, not a list to pick from:
       the widget renders it as a slider and starts it at the smallest size,
       which is the configuration base_price quotes from. */
    type: option.type === 'range' ? 'range' : 'choice',
    ...(option.type === 'range'
      ? {
          min: option.min_value,
          max: option.max_value,
          step: option.step_value,
          unit: option.unit,
          default: option.min_value,
        }
      : {}),
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
  const enquiryOnly = Boolean(product.enquiry_only);

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
    /* A piece shown rather than sold carries no price out to the widget. Its
       base_price is a starting point for writing a quote, not a figure anyone
       should read as an offer. */
    enquiryOnly,
    basePrice: enquiryOnly ? null : basePrice,
    basePriceLabel: enquiryOnly ? '' : formatMoney(basePrice, currency, locale),
    fromLabel: enquiryOnly
      ? (locale === 'da' ? 'Pris efter aftale' : 'Priced on enquiry')
      : locale === 'da'
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

  /* A piece whose price is a formula works it out from the configuration, using
     the same module the website quotes from. The option list still describes
     what may be chosen; it just does not carry the money. */
  const model = product.pricing ? PRICING_MODELS[product.pricing] : null;
  if (product.pricing && !model) {
    throw badRequest(`Unknown pricing model “${product.pricing}”`);
  }

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
    if (option.type === 'range') {
      resolved.push({
        key: option.key,
        label: pick(option, 'label', locale),
        value: rangeValue(option, chosen, pick(option, 'label', locale)),
        raw: String(Number(chosen)),
        priceDelta: 0,
      });
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

  if (model) {
    try {
      unitPrice = model.price(selection);
    } catch (err) {
      throw badRequest(err.message);
    }
  }

  if (unitPrice <= 0) throw badRequest('Configured price is invalid');
  return { unitPrice, resolved };
}

/**
 * Checks a slider value against the bounds the option was seeded with and
 * returns it as a label. The pricing model checks the number again on its own
 * terms; this is what stops a value that is out of range or off the step from
 * ever reaching it.
 */
function rangeValue(option, chosen, label) {
  const num = Number(chosen);
  if (!Number.isFinite(num)) throw badRequest(`“${chosen}” is not a number for ${label}`, { field: option.key });
  if (num < option.min_value || num > option.max_value) {
    throw badRequest(`${label} must be between ${option.min_value} and ${option.max_value}${option.unit ? ` ${option.unit}` : ''}`, {
      field: option.key,
    });
  }
  const step = option.step_value > 0 ? option.step_value : 1;
  const steps = Math.round((num - option.min_value) / step);
  if (Math.abs(option.min_value + steps * step - num) > 1e-6) {
    throw badRequest(`${label} is set in steps of ${step}${option.unit ? ` ${option.unit}` : ''}`, {
      field: option.key,
    });
  }
  return option.unit ? `${num} ${option.unit}` : String(num);
}

export function requireProduct(idOrSku) {
  const product = loadProduct(idOrSku);
  if (!product || product.status !== 'active') throw notFound('Product not available');
  return product;
}
