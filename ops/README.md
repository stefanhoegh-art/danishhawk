# The watchtower

One command that looks over the whole of Danish Hawk and says what is wrong.

```bash
node ops/watch.mjs           # the report
node ops/watch.mjs --quick   # skip the app's test suite
node ops/watch.mjs --json    # the same findings, for a machine
```

It exits 0 when everything holds and 1 when something needs a person, so it can
sit in a scheduled job and only speak up when it matters.

## What it looks at

| Check | What it would catch |
|---|---|
| `links` | An image or a door on the site that points at nothing. |
| `sitemap` | A page promised to Google that is gone, a page that is both listed and `noindex`, a page that can be indexed but nobody is told about. |
| `assets` | Photographs nothing points at — usually the residue of a bad edit. |
| `secrets` | A `.env` or an order database committed. Either is customer data in public. |
| `deploy` | `netlify.toml` no longer hiding `/app/*`, which would serve the webshop's source as files. |
| `app` | The commerce test suite. It is what stands between a pricing bug and a wrong invoice. |
| `money` | A piece priced at or below what it costs to build; a price that runs backwards as the table grows; the page and the checkout quoting from different files; a VAT or commission rate that is not a fraction. |
| `live` | Whether danishhawk.com answers. Skipped honestly when the run has no way out to the internet — an unreachable proxy is not a dead website. |

## The money check, in particular

`assets/tandhjulet-pricing.js` is quoted twice: the browser imports it over HTTP
so the page can show a price, and the Node server imports it from disk before
anyone is charged. They must never drift apart, because a customer who is shown
one number and charged another is a customer lost and possibly a complaint.

The check walks every diameter, timber, treatment and bearing on offer and
compares each price against what that table costs to build. The thinnest margin
in the current range is about 2.250 kr, on the smallest veneered top. If an edit
to `MARKUP` or `WORK_DKK` ever pushes a configuration to or below its cost, the
run fails rather than letting it be discovered a year later in the accounts.
