# Promotion — what is in place, and what only you can do

The site is now findable and shareable. What follows is the part a machine can
prepare and the part that needs you.

## Done, and checked from now on

- **Energy Speed can be found.** It carried `noindex, nofollow` while sitting in
  the sitemap — told to be found and then to be forgotten. Both languages are
  now indexable and both are in the sitemap, with `hreflang` already correct.
- **`/lager/` is in the sitemap.** It sells a table that already exists and
  nothing was pointing search at it.
- **Every page renders as something when shared.** Previously a link to Energy
  Speed posted anywhere came out as a grey box with no picture.
- **Energy Speed carries `WebApplication` structured data**, marked free, in
  Danish and English.

`node ops/watch.mjs` fails if any of that regresses.

## The one thing markup cannot fix

A wide preview card crops to about **1.91:1**. Every furniture photograph in
`assets/` is portrait, so a wide card would show a strip through the middle of a
table. Those pages therefore ask for the small card for now — a whole thumbnail
rather than a cut wide one.

**Five pages want one landscape photograph each, about 1200×630:**

| Page | What it should show |
|---|---|
| `/` | The workshop, or a finished piece in a room. |
| `/tandhjulet/` | The whole table, from the side, turntable visible. |
| `/lager/` | The table that is actually in stock, ready to go. |
| `/NaboLarm/` | The app on a phone, held, in a real street. |
| `/handelsbetingelser/` | Anything of yours. It is the least important. |

Drop them in `assets/` with a content hash in the filename, point the `og:image`
tags at them, and the watchtower will upgrade those pages to the large card.
That one afternoon is worth more than any copy below.

## Copy you can paste

Written in the site's voice — plain, concrete, no selling. Adjust freely.

### Energy Speed, for a Danish EV group or forum

> Jeg har bygget en beregner, der måler elbiler i **kWh i timen** i stedet for
> kilometer. En bil, der kører 120 på motorvejen, bruger omtrent det samme som
> ti elkedler. Det siger mere om, hvad der faktisk sker, end tallet i brochuren.
>
> Alle biler på markedet er med, og du kan sætte dine egne forhold ind: fart,
> temperatur, hvad strømmen koster hos dig.
>
> https://danishhawk.com/ev/ — gratis, ingen log-ind, ingen reklamer.

Post it where people are already arguing about range: Danish EV Facebook groups,
r/elbiler, Bilbasen's forums. It answers a question they are having rather than
advertising at them. Do not post it to a furniture audience; it is a different
business.

### Tandhjulet, for Instagram

> Rundt bord. Drejeskive fræset ned i midten, så fadet kommer hen til den, der
> skal bruge det, i stedet for at vandre hele vejen rundt.
>
> Udskæringen i kanten er til en stols armlæn.
>
> Skæres til dit mål. 1855–2000 mm.

Carousel: the whole table, then the turntable, then the notch, then the
underframe. The detail shots are what people stop for.

### The in-stock table

> Der står et Tandhjulet færdigt på værkstedet lige nu. Fast pris, kort
> leveringstid, ingen ventetid på produktion.
>
> danishhawk.com/lager

## What I cannot do, and what it would take

I have no access to Instagram, Facebook, an ad account, an email list or any
analytics. I can write and I can make the site ready; **I cannot post, send or
measure anything.** Nobody's agent can, without being handed the keys.

If you want that handed over, the pieces are:

- **A connector for the account you want posted to**, granted by you in Claude's
  settings. Then a scheduled routine can draft a post and hold it for your yes.
- **Analytics on the site** — there is none today, so nothing above can be
  measured. A privacy-light counter (Plausible, GoatCounter, or a Netlify
  function writing to a file) would tell you whether Energy Speed brings anyone
  to the furniture at all. **This is the one I would do first.** Promotion
  without it is guessing, and you would be guessing for months.
