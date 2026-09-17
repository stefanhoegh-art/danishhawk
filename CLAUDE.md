# Danish Hawk

Furniture drawn to measure and produced in Denmark, plus two pieces of software.
One person runs all of it, mostly from a workshop. Assume their attention is the
scarcest thing in the business and spend it accordingly.

## What the business is

| Door | Where | What it is |
|---|---|---|
| **Tandhjulet** | `/tandhjulet/`, `/lager/` | A round dining table with a turntable cut into it. The only piece with a firm price. |
| **Energy Speed** | `/ev/`, `/ev/en/` | A calculator that measures electric cars in kWh per hour rather than per kilometre. |
| **NaboLarm** | `/NaboLarm/` | Anonymous reporting of unwanted noise and unease in a neighbourhood. |
| **The webshop** | `app/` | Sells the furniture *from other people's websites*. Not deployed yet. |

The public site is plain static HTML in the repository root, served by Netlify
straight from `main`. `app/` is a Node 22 + SQLite server with no dependencies
and no build step; `netlify.toml` deliberately 404s `/app/*` so its source is
never served as files.

## Rules that are not negotiable

- **One price, quoted twice.** `assets/tandhjulet-pricing.js` is imported by the
  browser over HTTP *and* by the server from disk. They must never drift apart.
  A customer shown one number and charged another is a customer lost.
- **Money is checked before it is changed.** Prices, VAT, commission, deposits —
  a person decides, not an agent. See `.claude/agents/bogholder.md`.
- **Amounts are integers in øre.** Never floats. `total = subtotalExVat +
  shippingAmount + vatAmount` holds in every case, including export and reverse
  charge, where the VAT is stripped out of the listed price rather than added on.
- **Nothing that identifies a customer leaves the machine.** No order database,
  no `.env`, no email address in a commit.

## Running it

```bash
node ops/watch.mjs      # the whole business, checked; exits 1 when something needs a person
cd app && npm test      # the commerce suite
cd app && npm start     # the webshop at :3000, admin at /admin/, demo partner at /demo/
```

## How to write here

Comments and commit messages in this repository are plain English sentences that
say *why*, in terms a furniture maker would use — "a customer shown one number
and charged another", not "ensures price consistency". Match that. Danish copy on
the site is written the same way: concrete, unhurried, no marketing voice.
