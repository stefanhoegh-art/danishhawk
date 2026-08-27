import { config, CURRENCIES } from '../config.js';

/** EU member states, used to decide VAT treatment. */
export const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export function currencyInfo(code) {
  return CURRENCIES[code] || CURRENCIES[config.baseCurrency];
}

/** Convert base-currency minor units into another currency's minor units. */
export function convert(amountMinor, toCurrency) {
  const info = currencyInfo(toCurrency);
  return Math.round(amountMinor * info.rate);
}

export function formatMoney(amountMinor, currency = config.baseCurrency, locale = 'da') {
  const info = currencyInfo(currency);
  const value = amountMinor / 100;
  const intlLocale = locale === 'da' ? 'da-DK' : 'en-GB';
  const formatted = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return info.position === 'prefix'
    ? `${info.symbol}${formatted}`
    : `${formatted} ${info.symbol}`;
}

/**
 * Decide how VAT applies to an order.
 * - Danish customers and EU consumers: 25% Danish VAT, already inside the price.
 * - EU businesses with a valid-looking VAT number: reverse charge, VAT removed.
 * - Outside the EU: export, VAT removed.
 */
export function vatTreatment({ country, vatNumber }) {
  const cc = String(country || 'DK').toUpperCase();
  const vat = String(vatNumber || '').replace(/[\s.-]/g, '').toUpperCase();
  if (cc === 'DK') return { charge: true, reason: 'domestic', rate: config.vatRate };
  if (!EU_COUNTRIES.has(cc)) return { charge: false, reason: 'export', rate: 0 };
  if (vat && /^[A-Z]{2}[0-9A-Z]{6,12}$/.test(vat) && vat.startsWith(cc)) {
    return { charge: false, reason: 'reverse_charge', rate: 0 };
  }
  return { charge: true, reason: 'eu_consumer', rate: config.vatRate };
}

/**
 * Turn gross (VAT-inclusive) line totals into an order total.
 * When VAT is not charged, the VAT portion is stripped from the gross price
 * rather than added on top — the listed price already contains it.
 */
export function priceOrder({ grossLines, shippingGross = 0, treatment }) {
  const rate = config.vatRate;
  const grossGoods = grossLines.reduce((sum, n) => sum + n, 0);
  const netGoods = Math.round(grossGoods / (1 + rate));
  const netShipping = Math.round(shippingGross / (1 + rate));

  // Amounts are always stored ex-VAT so that
  // total = subtotalExVat + shippingAmount + vatAmount holds in every case.
  const vatAmount = treatment.charge
    ? grossGoods - netGoods + (shippingGross - netShipping)
    : 0;

  return {
    subtotalExVat: netGoods,
    shippingAmount: netShipping,
    vatAmount,
    total: netGoods + netShipping + vatAmount,
  };
}

export function depositFor(total, pct) {
  const clamped = Math.min(Math.max(pct, 0), 1);
  // Round to whole currency units — deposits appear on invoices.
  return Math.round((total * clamped) / 100) * 100;
}

export function commissionFor(subtotalExVat, rate) {
  return Math.round(subtotalExVat * Math.min(Math.max(rate, 0), 1));
}
