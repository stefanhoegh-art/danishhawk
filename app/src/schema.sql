-- Danish Hawk commerce schema.
-- All money is stored as integer minor units (øre) in the base currency (DKK),
-- VAT included, matching how prices are quoted to Danish consumers.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A partner is any external website allowed to sell Danish Hawk pieces:
-- an interior designer, an architecture studio, a gallery, a marketplace.
CREATE TABLE IF NOT EXISTS partners (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  contact_name    TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  country         TEXT NOT NULL DEFAULT 'DK',
  -- JSON array of hostnames allowed to load the widget with this key.
  domains         TEXT NOT NULL DEFAULT '[]',
  public_key      TEXT NOT NULL UNIQUE,
  portal_key      TEXT NOT NULL UNIQUE,
  commission_rate REAL NOT NULL DEFAULT 0.15,
  -- 'all' or a JSON array of product ids this partner may show.
  catalogue       TEXT NOT NULL DEFAULT 'all',
  locale          TEXT NOT NULL DEFAULT 'da',
  currency        TEXT NOT NULL DEFAULT 'DKK',
  theme           TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active', -- active | paused | archived
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY,
  sku             TEXT NOT NULL UNIQUE,
  slug            TEXT NOT NULL UNIQUE,
  category        TEXT NOT NULL DEFAULT '',
  name_da         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  tagline_da      TEXT NOT NULL DEFAULT '',
  tagline_en      TEXT NOT NULL DEFAULT '',
  description_da  TEXT NOT NULL DEFAULT '',
  description_en  TEXT NOT NULL DEFAULT '',
  base_price      INTEGER NOT NULL,          -- øre, incl. VAT
  lead_time_days  INTEGER NOT NULL DEFAULT 42,
  deposit_pct     REAL NOT NULL DEFAULT 0.5,
  shipping_price  INTEGER NOT NULL DEFAULT 0, -- øre, 0 = quoted after order
  commission_rate REAL,                       -- overrides the partner rate when set
  images          TEXT NOT NULL DEFAULT '[]', -- JSON array of URLs
  materials_da    TEXT NOT NULL DEFAULT '',
  materials_en    TEXT NOT NULL DEFAULT '',
  dimensions      TEXT NOT NULL DEFAULT '',
  bespoke         INTEGER NOT NULL DEFAULT 1, -- made to order
  status          TEXT NOT NULL DEFAULT 'active', -- active | draft | archived
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_options (
  id         INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  label_da   TEXT NOT NULL,
  label_en   TEXT NOT NULL,
  required   INTEGER NOT NULL DEFAULT 1,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_options_product ON product_options(product_id);

CREATE TABLE IF NOT EXISTS product_option_values (
  id          INTEGER PRIMARY KEY,
  option_id   INTEGER NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  value       TEXT NOT NULL,
  label_da    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0, -- øre, incl. VAT
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_option_values_option ON product_option_values(option_id);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY,
  order_no         TEXT NOT NULL UNIQUE,
  partner_id       INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  kind             TEXT NOT NULL DEFAULT 'order', -- order | quote
  status           TEXT NOT NULL DEFAULT 'awaiting_payment',
  -- awaiting_payment | deposit_paid | paid | in_production | shipped | completed | cancelled
  --                  | quote_requested | quote_sent
  locale           TEXT NOT NULL DEFAULT 'da',
  -- Settlement always happens in DKK; display_* records what the buyer was shown.
  currency         TEXT NOT NULL DEFAULT 'DKK',
  display_currency TEXT NOT NULL DEFAULT 'DKK',
  display_rate     REAL NOT NULL DEFAULT 1,
  customer_name    TEXT NOT NULL,
  customer_email   TEXT NOT NULL,
  customer_phone   TEXT NOT NULL DEFAULT '',
  company          TEXT NOT NULL DEFAULT '',
  vat_number       TEXT NOT NULL DEFAULT '',
  address_line1    TEXT NOT NULL DEFAULT '',
  address_line2    TEXT NOT NULL DEFAULT '',
  postal_code      TEXT NOT NULL DEFAULT '',
  city             TEXT NOT NULL DEFAULT '',
  country          TEXT NOT NULL DEFAULT 'DK',
  subtotal_ex_vat  INTEGER NOT NULL DEFAULT 0,
  vat_amount       INTEGER NOT NULL DEFAULT 0,
  shipping_amount  INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL DEFAULT 0,
  deposit_amount   INTEGER NOT NULL DEFAULT 0,
  amount_paid      INTEGER NOT NULL DEFAULT 0,
  commission_rate  REAL NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0,
  commission_status TEXT NOT NULL DEFAULT 'pending', -- pending | payable | paid | void
  payment_provider TEXT NOT NULL DEFAULT 'invoice',  -- stripe | invoice
  payment_ref      TEXT NOT NULL DEFAULT '',
  payment_url      TEXT NOT NULL DEFAULT '',
  customer_note    TEXT NOT NULL DEFAULT '',
  internal_note    TEXT NOT NULL DEFAULT '',
  source_url       TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sku          TEXT NOT NULL,
  name         TEXT NOT NULL,
  unit_price   INTEGER NOT NULL, -- øre incl. VAT, options applied
  quantity     INTEGER NOT NULL DEFAULT 1,
  line_total   INTEGER NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Widget analytics, used for partner attribution and conversion reporting.
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY,
  partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  type       TEXT NOT NULL, -- view | open | configure | checkout_start | order | quote
  visitor    TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_partner ON events(partner_id, created_at);

-- Mail is queued here; a relay webhook can drain it, and the admin can always read it.
CREATE TABLE IF NOT EXISTS outbox (
  id         INTEGER PRIMARY KEY,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued', -- queued | sent | failed
  error      TEXT NOT NULL DEFAULT '',
  order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at    TEXT
);
