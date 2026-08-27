# Danish Hawk — Commerce

Sell Danish Hawk furniture **from other people's websites**.

An interior studio, an architect, a gallery or a magazine pastes three lines of HTML into
their page. Their visitors then see your pieces, configure the timber and the size, watch the
price and the VAT update, and place the order — without ever leaving that site. The order
arrives in your console with the referring site credited for commission.

```html
<div data-danishhawk-collection></div>
<script async src="https://shop.danishhawk.com/embed.js" data-key="dh_pk_..."></script>
```

Try it: run the app and open **http://localhost:3000/demo/** — a fictional partner site with
the widget on it, next to **http://localhost:3000/admin/** where the orders land.

---

## Running it

Requires Node 22.5 or newer. There is nothing to install — no dependencies, no build step.

```bash
cd app
cp .env.example .env      # then edit ADMIN_PASSWORD at minimum
npm start
```

That creates `data/danishhawk.db`, your admin login, the three catalogue pieces from
danishhawk.com, and a demo partner.

| Command | What it does |
|---|---|
| `npm start` | Runs the server |
| `npm run dev` | Same, restarting when you edit a file |
| `npm test` | Runs the test suite (33 tests) |
| `npm run seed` | Adds the seed data if the database is empty, and prints the embed keys |
| `npm run reset` | **Deletes everything** and reseeds. Only for development |

---

## How a sale actually happens

1. **You add a partner** in the console. You get a snippet with their own embed key, and you
   list the domains that key is allowed to work on.
2. **They paste it** into their page. The widget renders inside a shadow root, so their CSS
   cannot break yours and yours cannot leak into their design.
3. **A visitor configures a piece.** Every choice is priced by the server against the database
   — the browser only ever says *which* timber, never *what it costs*. A tampered request is
   simply repriced.
4. **They check out in place.** Name, address, country. VAT is worked out from where they are:
   25% moms for Denmark and EU consumers, reverse charge for an EU business with a valid VAT
   number, no Danish VAT for exports.
5. **The order lands** in your console. The customer gets a confirmation, you get the full
   specification, the partner gets told they earned commission.
6. **Commission becomes payable** the moment the customer's deposit clears — not before.
   Cancel an unpaid order and it voids itself.

## What sits where

```
app/
  server.js              HTTP server, static files, Stripe webhook, checkout return pages
  src/
    config.js            Settings, read from .env
    schema.sql           The database, documented inline
    db.js  seed.js       SQLite access and the starting catalogue
    lib/                 http · crypto · money (VAT, deposits, commission) · validate
    services/
      catalogue.js       Products, options, server-side pricing
      orders.js          Building, storing and advancing orders
      payments.js        Stripe over plain fetch — no SDK
      mail.js            Queues mail, relays it if you configure a relay
    routes/
      public.js          What the widget calls
      admin.js           Your console
      partner.js         A partner's read-only view of their own numbers
  public/
    embed.js             The widget. This is the product
    admin/               Your console
    partner/             The partner's commission dashboard
    demo/                A fictional partner site, to show people
    media/               Product photography
```

---

## The embed, in detail

Everything is driven by data attributes, so a partner never writes JavaScript.

```html
<!-- The whole catalogue as a grid -->
<div data-danishhawk-collection></div>

<!-- Just the dining tables, at most four -->
<div data-danishhawk-collection data-category="dining" data-limit="4"></div>

<!-- One piece, e.g. inside an article -->
<div data-danishhawk-product="DH-PAUROSA-CONSOLE"></div>

<!-- A buy button anywhere, with the price appended -->
<div data-danishhawk-button="DH-TANDHJULET" data-label="Order this table"></div>

<script async src="https://shop.danishhawk.com/embed.js"
        data-key="dh_pk_..."
        data-locale="en"        <!-- da | en, defaults to the partner's setting -->
        data-currency="GBP"     <!-- display currency; you are still paid in DKK -->
        data-accent="#c8a96e"   <!-- match their brand -->
        data-theme="dark"       <!-- light | dark -->
        data-fonts="off"        <!-- skip loading Cormorant/DM Mono -->
        ></script>
```

From their own JavaScript, if they want it: `DanishHawk.open('DH-TANDHJULET')` opens the
drawer, `DanishHawk.setCurrency('EUR')` re-renders, and a `danishhawk:order` event fires on
`window` when an order completes — enough for them to hook up their own analytics.

### Why the key can be public

The embed key sits in their page source, so anyone can read it. That is fine: it only
identifies who gets the commission. The control is the **domain allowlist** — set
`studio.dk` and `*.studio.dk` on the partner, and the key stops working anywhere else.
Leave the list empty and it works everywhere, which is convenient while testing and
careless once they are live. Rotating a key invalidates the old one immediately.

---

## Money

All prices are stored as whole øre in DKK, VAT included, exactly as they are quoted to a
Danish customer. Other currencies are a **display** conversion — you are always paid in
kroner, and the checkout says so. Rates live in `src/config.js`; edit them when they drift.

- **VAT.** 25% is already inside every listed price. For a reverse-charge or export order the
  VAT is taken *out* of the price rather than added on top, so a German business sees
  19,680 kr where a Danish consumer sees 24,600 kr for the same console.
- **Deposits.** Set per piece, 50% by default, rounded to whole kroner because it goes on an
  invoice. Services like CNC hours are set to 0.
- **Commission.** A percentage of the ex-VAT order value, so you are never paying a partner a
  share of the tax. Set per partner, and overridable per piece.

## Payments

Out of the box the app takes the order and tells the customer a deposit invoice is coming —
which is how bespoke furniture is normally sold, and needs no payment provider at all.

Set `STRIPE_SECRET_KEY` and card payment appears as an option in the widget. The customer is
sent to Stripe Checkout for the deposit and returned to `/checkout/complete`. Point a Stripe
webhook for `checkout.session.completed` at `/webhooks/stripe`, set `STRIPE_WEBHOOK_SECRET`,
and paid orders update themselves. Signatures are verified, and a replayed old webhook is
rejected.

If Stripe fails while creating a session, the order is **not** lost — it is saved and falls
back to invoicing, with the reason recorded on the order.

## Email

With no relay configured, every message is written to the outbox and readable in full under
**Mail** in the console. Nothing is silently dropped. To actually send, point
`MAIL_WEBHOOK_URL` at anything that accepts `{from, to, subject, text}` as JSON — Postmark,
Resend, Brevo, or a small function of your own.

---

## Putting it on the internet

The app is a single Node process with a SQLite file. Any small VPS or container host runs it.

```bash
docker build -t danishhawk-commerce app/
docker run -d --name danishhawk -p 3000:3000 \
  -v danishhawk-data:/app/data \
  -e PUBLIC_URL=https://shop.danishhawk.com \
  -e ADMIN_PASSWORD='...' -e SESSION_SECRET='...' \
  -e NODE_ENV=production -e SECURE_COOKIES=true \
  danishhawk-commerce
```

Before you go live:

- [ ] `ADMIN_PASSWORD` and `SESSION_SECRET` changed from the defaults
- [ ] `PUBLIC_URL` set to the real https address — the widget and payment redirects use it
- [ ] TLS in front of it (Caddy or nginx). `SECURE_COOKIES=true` needs it
- [ ] `app/data/` on a volume that survives redeploys, and backed up. It is one file
- [ ] The demo partner paused or deleted — its key works on any domain
- [ ] Domains filled in for every real partner

`GET /health` returns the product and partner counts for uptime checks.

### Selling from danishhawk.com itself

The site at `danishhawk.com` is the static `index.html` in the repository root and is
untouched by this app. Once the app is deployed, the same widget turns the site's own
collection section into a working shop: create a partner named "Danish Hawk" with a 0%
commission rate and the domain `danishhawk.com`, then replace the three hand-written product
cards in `index.html` with a single `<div data-danishhawk-collection></div>` and the script
tag. Prices then come from one place instead of two.

---

## Backups

The whole shop is `app/data/danishhawk.db`. Copy it while the app runs:

```bash
sqlite3 app/data/danishhawk.db ".backup '/backups/danishhawk-$(date +%F).db'"
```
