import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Minimal .env loader so the app stays dependency-free.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));
const bool = (v, fallback) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1');

export const config = {
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',

  // Public origin the widget and payment redirects point back to.
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),

  dataDir: process.env.DATA_DIR || join(ROOT, 'data'),
  dbFile: process.env.DB_FILE || join(process.env.DATA_DIR || join(ROOT, 'data'), 'danishhawk.db'),

  // Bootstrap admin. Change ADMIN_PASSWORD before deploying.
  adminEmail: process.env.ADMIN_EMAIL || 'stefanhoegh@live.dk',
  adminPassword: process.env.ADMIN_PASSWORD || 'skift-mig-nu',

  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 12),

  // Commerce defaults
  baseCurrency: process.env.BASE_CURRENCY || 'DKK',
  vatRate: num(process.env.VAT_RATE, 0.25), // Danish moms
  defaultCommissionRate: num(process.env.DEFAULT_COMMISSION_RATE, 0.15),
  defaultDepositPct: num(process.env.DEFAULT_DEPOSIT_PCT, 0.5),

  // Payments. Without a Stripe key the platform falls back to deposit-by-invoice,
  // which is how bespoke furniture is normally sold anyway.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  // Outgoing mail is written to an in-app outbox unless a webhook relay is set.
  mailFrom: process.env.MAIL_FROM || 'Danish Hawk <stefanhoegh@live.dk>',
  mailWebhookUrl: process.env.MAIL_WEBHOOK_URL || '',

  // Set true only behind a TLS terminator.
  secureCookies: bool(process.env.SECURE_COOKIES, process.env.NODE_ENV === 'production'),

  isProduction: process.env.NODE_ENV === 'production',
};

export const CURRENCIES = {
  DKK: { symbol: 'kr', decimals: 2, rate: 1, position: 'suffix' },
  EUR: { symbol: '€', decimals: 2, rate: 0.134, position: 'prefix' },
  GBP: { symbol: '£', decimals: 2, rate: 0.113, position: 'prefix' },
  USD: { symbol: '$', decimals: 2, rate: 0.143, position: 'prefix' },
  SEK: { symbol: 'kr', decimals: 2, rate: 1.5, position: 'suffix' },
  NOK: { symbol: 'kr', decimals: 2, rate: 1.55, position: 'suffix' },
};
