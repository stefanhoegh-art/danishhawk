/*!
 * Danish Hawk — embeddable storefront
 * danishhawk.com
 *
 * One script tag lets any website sell Danish Hawk furniture. Everything renders
 * inside a shadow root so the host page's CSS cannot reach in and ours cannot leak out.
 *
 *   <div data-danishhawk-collection></div>
 *   <script async src="https://shop.danishhawk.com/embed.js" data-key="dh_pk_..."></script>
 */
(function () {
  'use strict';

  if (window.DanishHawk && window.DanishHawk.__loaded) return;

  var script = document.currentScript || (function () {
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) if (all[i].src.indexOf('embed.js') !== -1) return all[i];
    return null;
  })();

  if (!script) return console.error('[DanishHawk] could not locate its own script tag');

  var KEY = script.getAttribute('data-key') || '';
  var ORIGIN = new URL(script.src, location.href).origin;
  var API = ORIGIN + '/api/v1';

  if (!KEY) {
    console.error('[DanishHawk] missing data-key on the script tag. Ask Danish Hawk for your embed key.');
    return;
  }

  var settings = {
    locale: script.getAttribute('data-locale') || '',
    currency: script.getAttribute('data-currency') || '',
    accent: script.getAttribute('data-accent') || '',
    theme: script.getAttribute('data-theme') || 'light',
    layout: script.getAttribute('data-layout') || 'grid',
    fonts: script.getAttribute('data-fonts') !== 'off',
  };

  var visitor = (function () {
    try {
      var existing = localStorage.getItem('dh_visitor');
      if (existing) return existing;
      var made = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('dh_visitor', made);
      return made;
    } catch (e) {
      return '';
    }
  })();

  // ---------------------------------------------------------------- language
  var STRINGS = {
    da: {
      from: 'Fra', configure: 'Tilpas & bestil', inquire: 'Forespørgsel', quantity: 'Antal',
      madeToOrder: 'Fremstilles på bestilling', leadTime: 'Leveringstid', days: 'dage',
      materials: 'Materialer', dimensions: 'Mål', yourPiece: 'Dit stykke',
      next: 'Videre', back: 'Tilbage', close: 'Luk',
      details: 'Dine oplysninger', name: 'Navn', email: 'E-mail', phone: 'Telefon',
      company: 'Firma (valgfrit)', vatNumber: 'CVR/VAT-nummer (valgfrit)',
      address: 'Adresse', address2: 'Adresse, linje 2', postalCode: 'Postnr.', city: 'By', country: 'Land',
      note: 'Besked til værkstedet (valgfrit)',
      review: 'Gennemse', subtotal: 'Subtotal (ekskl. moms)', vat: 'Moms', shipping: 'Levering',
      shippingQuoted: 'Oplyses efter adresse', total: 'I alt', deposit: 'Depositum nu',
      balance: 'Restbeløb ved levering', reverseCharge: 'Omvendt betalingspligt — moms afregnes af køber',
      exportVat: 'Eksport uden for EU — uden dansk moms',
      placeOrder: 'Afgiv bestilling', payDeposit: 'Betal depositum', requestQuote: 'Bed om tilbud',
      payCard: 'Betal med kort', payInvoice: 'Faktura / bankoverførsel',
      sending: 'Sender…', thankYou: 'Tak.', orderNumber: 'Ordrenummer',
      confirmationSent: 'Vi har sendt en bekræftelse til',
      nextSteps: 'Vi tegner dit stykke i 3D og sender en visualisering til godkendelse, før vi skærer.',
      payNow: 'Gå til betaling', sold: 'Solgt af Danish Hawk', poweredBy: 'Møbler af Danish Hawk',
      required: 'Udfyld venligst dette felt', somethingWrong: 'Noget gik galt. Prøv igen.',
      loading: 'Henter…', empty: 'Ingen møbler tilgængelige lige nu.',
      approx: 'ca.', settledIn: 'Afregnes i DKK', payment: 'Betaling',
    },
    en: {
      from: 'From', configure: 'Configure & order', inquire: 'Inquire', quantity: 'Quantity',
      madeToOrder: 'Made to order', leadTime: 'Lead time', days: 'days',
      materials: 'Materials', dimensions: 'Dimensions', yourPiece: 'Your piece',
      next: 'Continue', back: 'Back', close: 'Close',
      details: 'Your details', name: 'Name', email: 'Email', phone: 'Phone',
      company: 'Company (optional)', vatNumber: 'VAT number (optional)',
      address: 'Address', address2: 'Address line 2', postalCode: 'Postcode', city: 'City', country: 'Country',
      note: 'Message to the workshop (optional)',
      review: 'Review', subtotal: 'Subtotal (excl. VAT)', vat: 'VAT', shipping: 'Delivery',
      shippingQuoted: 'Quoted once we have your address', total: 'Total', deposit: 'Deposit now',
      balance: 'Balance on delivery', reverseCharge: 'Reverse charge — VAT accounted for by the buyer',
      exportVat: 'Export outside the EU — no Danish VAT',
      placeOrder: 'Place order', payDeposit: 'Pay deposit', requestQuote: 'Request a quote',
      payCard: 'Pay by card', payInvoice: 'Invoice / bank transfer',
      sending: 'Sending…', thankYou: 'Thank you.', orderNumber: 'Order number',
      confirmationSent: 'We have sent a confirmation to',
      nextSteps: 'We model your piece in 3D and send a visualisation for approval before we cut.',
      payNow: 'Continue to payment', sold: 'Sold by Danish Hawk', poweredBy: 'Furniture by Danish Hawk',
      required: 'Please fill in this field', somethingWrong: 'Something went wrong. Please try again.',
      loading: 'Loading…', empty: 'No pieces available right now.',
      approx: 'approx.', settledIn: 'Settled in DKK', payment: 'Payment',
    },
  };

  var COUNTRIES = [
    ['DK', 'Danmark / Denmark'], ['SE', 'Sverige / Sweden'], ['NO', 'Norge / Norway'],
    ['DE', 'Deutschland / Germany'], ['NL', 'Nederland / Netherlands'], ['BE', 'België / Belgium'],
    ['FR', 'France'], ['ES', 'España / Spain'], ['IT', 'Italia / Italy'], ['AT', 'Österreich / Austria'],
    ['FI', 'Suomi / Finland'], ['IE', 'Ireland'], ['PL', 'Polska / Poland'], ['PT', 'Portugal'],
    ['LU', 'Luxembourg'], ['CZ', 'Česko / Czechia'], ['GB', 'United Kingdom'], ['CH', 'Schweiz / Switzerland'],
    ['US', 'United States'], ['CA', 'Canada'], ['AU', 'Australia'], ['AE', 'United Arab Emirates'],
    ['SG', 'Singapore'], ['JP', 'Japan'],
  ];

  var state = { config: null, locale: 'da', currency: 'DKK', products: null, ready: false };
  var t = function (key) { return (STRINGS[state.locale] || STRINGS.da)[key] || key; };

  // -------------------------------------------------------------------- http
  function api(path, options) {
    options = options || {};
    var url = API + path + (path.indexOf('?') === -1 ? '?' : '&') + 'key=' + encodeURIComponent(KEY) +
      '&locale=' + encodeURIComponent(state.locale) + '&currency=' + encodeURIComponent(state.currency) +
      (visitor ? '&v=' + encodeURIComponent(visitor) : '');

    return fetch(url, {
      method: options.method || 'GET',
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'omit',
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || 'Request failed');
          err.details = data.details;
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function track(type, sku) {
    try {
      var payload = JSON.stringify({ type: type, sku: sku || '', visitor: visitor, url: location.href });
      var url = API + '/events?key=' + encodeURIComponent(KEY);
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      else fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
    } catch (e) { /* analytics must never break the page */ }
  }

  // ------------------------------------------------------------------- fonts
  function loadFonts() {
    if (!settings.fonts) return;
    if (document.querySelector('link[data-danishhawk-fonts]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-danishhawk-fonts', '');
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=DM+Mono:wght@300;400;500&display=swap';
    document.head.appendChild(link);
  }

  // ------------------------------------------------------------------ styles
  function styles(accent) {
    return [
      ':host{all:initial;display:block;}',
      '*,*::before,*::after{box-sizing:border-box;}',
      ':host{--dh-bg:#f5f2ed;--dh-ink:#0f0e0b;--dh-mid:#4a4643;--dh-line:#d8d2c8;',
      '--dh-accent:' + accent + ';--dh-card:#eeebe5;--dh-shadow:rgba(15,14,11,.16);',
      "--dh-serif:'Cormorant Garamond',Georgia,'Times New Roman',serif;",
      "--dh-mono:'DM Mono',ui-monospace,SFMono-Regular,Menlo,monospace;}",
      ':host([data-dh-theme="dark"]){--dh-bg:#141310;--dh-ink:#f2efe9;--dh-mid:#a8a29a;',
      '--dh-line:#302c26;--dh-card:#1c1a16;--dh-shadow:rgba(0,0,0,.5);}',

      '.dh{font-family:var(--dh-mono);font-weight:300;color:var(--dh-ink);line-height:1.6;',
      '-webkit-font-smoothing:antialiased;font-size:14px;}',
      '.dh button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;}',
      '.dh a{color:inherit;}',
      '.dh img{display:block;max-width:100%;}',

      /* --- grid ------------------------------------------------------- */
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:28px;}',
      '.card{background:var(--dh-card);border:1px solid var(--dh-line);display:flex;flex-direction:column;',
      'transition:border-color .3s ease,transform .3s ease;}',
      '.card:hover{border-color:var(--dh-accent);transform:translateY(-2px);}',
      '.shot{aspect-ratio:4/3;overflow:hidden;background:var(--dh-bg);}',
      '.shot img{width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.8,.2,1);}',
      '.card:hover .shot img{transform:scale(1.04);}',
      '.shot.empty{display:grid;place-items:center;color:var(--dh-line);font-size:32px;font-family:var(--dh-serif);}',
      '.body{padding:22px 22px 24px;display:flex;flex-direction:column;flex:1;gap:10px;}',
      '.tag{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--dh-accent);}',
      '.title{font-family:var(--dh-serif);font-size:26px;font-weight:300;line-height:1.1;margin:0;}',
      '.blurb{font-size:12.5px;color:var(--dh-mid);line-height:1.75;flex:1;}',
      '.foot{display:flex;align-items:baseline;justify-content:space-between;gap:12px;',
      'padding-top:14px;border-top:1px solid var(--dh-line);margin-top:4px;}',
      '.price{font-size:13px;letter-spacing:.04em;}',
      '.cta{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--dh-accent);',
      'border-bottom:1px solid transparent;padding-bottom:3px;transition:border-color .25s;white-space:nowrap;}',
      '.card:hover .cta,.cta:hover{border-bottom-color:var(--dh-accent);}',

      /* --- inline button ---------------------------------------------- */
      '.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 26px;border:1px solid var(--dh-ink);',
      'font-size:11px;letter-spacing:.18em;text-transform:uppercase;transition:.25s;}',
      '.btn:hover{background:var(--dh-ink);color:var(--dh-bg);}',
      '.btn.gold{border-color:var(--dh-accent);background:var(--dh-accent);color:#0f0e0b;}',
      '.btn.gold:hover{filter:brightness(1.08);background:var(--dh-accent);color:#0f0e0b;}',
      '.btn[disabled]{opacity:.45;pointer-events:none;}',
      '.btn .amt{opacity:.7;letter-spacing:.04em;text-transform:none;}',

      /* --- drawer ------------------------------------------------------ */
      '.scrim{position:fixed;inset:0;background:rgba(15,14,11,.55);backdrop-filter:blur(3px);',
      'opacity:0;transition:opacity .35s ease;z-index:2147483000;}',
      '.scrim.on{opacity:1;}',
      '.panel{position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);background:var(--dh-bg);',
      'border-left:1px solid var(--dh-line);box-shadow:-24px 0 60px var(--dh-shadow);',
      'transform:translateX(100%);transition:transform .4s cubic-bezier(.22,.9,.28,1);',
      'z-index:2147483001;display:flex;flex-direction:column;overflow:hidden;}',
      '.panel.on{transform:translateX(0);}',
      '@media(max-width:600px){.panel{width:100vw;}}',
      '@media(prefers-reduced-motion:reduce){.panel,.scrim,.shot img{transition:none;}}',

      '.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 26px;',
      'border-bottom:1px solid var(--dh-line);flex:none;}',
      '.brand{font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:var(--dh-accent);}',
      '.steps{display:flex;gap:8px;align-items:center;font-size:10px;letter-spacing:.14em;',
      'text-transform:uppercase;color:var(--dh-mid);}',
      '.steps i{width:18px;height:1px;background:var(--dh-line);display:block;}',
      '.steps b{font-weight:400;color:var(--dh-ink);}',
      '.x{width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--dh-line);',
      'font-size:15px;transition:.2s;flex:none;}',
      '.x:hover{border-color:var(--dh-accent);color:var(--dh-accent);}',

      '.scroll{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:26px;}',
      '.hero{aspect-ratio:16/10;overflow:hidden;background:var(--dh-card);margin:-26px -26px 24px;}',
      '.hero img{width:100%;height:100%;object-fit:cover;}',
      '.h1{font-family:var(--dh-serif);font-size:34px;font-weight:300;line-height:1.08;margin:0 0 8px;}',
      '.sub{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dh-accent);margin-bottom:18px;}',
      '.para{font-size:13px;color:var(--dh-mid);line-height:1.85;margin:0 0 22px;}',
      '.spec{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;font-size:12px;color:var(--dh-mid);',
      'padding:16px 0;border-top:1px solid var(--dh-line);border-bottom:1px solid var(--dh-line);margin-bottom:26px;}',
      '.spec dt{color:var(--dh-ink);opacity:.55;}',
      '.spec dd{margin:0;}',

      '.field{margin-bottom:22px;}',
      '.lab{display:block;font-size:10px;letter-spacing:.2em;text-transform:uppercase;',
      'color:var(--dh-mid);margin-bottom:10px;}',
      '.opts{display:flex;flex-wrap:wrap;gap:8px;}',
      '.opt{border:1px solid var(--dh-line);padding:11px 16px;font-size:12px;transition:.2s;',
      'display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;background:var(--dh-card);}',
      '.opt:hover{border-color:var(--dh-accent);}',
      '.opt[aria-pressed="true"]{border-color:var(--dh-ink);background:var(--dh-ink);color:var(--dh-bg);}',
      '.opt small{font-size:10px;opacity:.6;letter-spacing:.04em;}',

      '.row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}',
      '.row.third{grid-template-columns:110px 1fr;}',
      'input,select,textarea{width:100%;background:var(--dh-card);border:1px solid var(--dh-line);',
      'padding:12px 14px;font-family:var(--dh-mono);font-size:13px;font-weight:300;color:var(--dh-ink);',
      'border-radius:0;transition:border-color .2s;}',
      'input:focus,select:focus,textarea:focus{outline:none;border-color:var(--dh-accent);}',
      'input[aria-invalid="true"]{border-color:#b3412e;}',
      'textarea{resize:vertical;min-height:84px;}',
      'select{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--dh-mid) 50%),',
      'linear-gradient(135deg,var(--dh-mid) 50%,transparent 50%);',
      'background-position:calc(100% - 18px) 50%,calc(100% - 13px) 50%;',
      'background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:38px;}',
      '.qty{display:inline-flex;border:1px solid var(--dh-line);}',
      '.qty button{width:40px;height:42px;display:grid;place-items:center;font-size:16px;}',
      '.qty button:hover{color:var(--dh-accent);}',
      '.qty span{width:48px;display:grid;place-items:center;border-left:1px solid var(--dh-line);',
      'border-right:1px solid var(--dh-line);font-size:13px;}',

      '.lines{border-top:1px solid var(--dh-line);padding-top:18px;margin-bottom:8px;}',
      '.line{display:flex;justify-content:space-between;gap:16px;font-size:12.5px;color:var(--dh-mid);padding:5px 0;}',
      '.line.big{color:var(--dh-ink);font-size:15px;padding-top:14px;margin-top:10px;border-top:1px solid var(--dh-line);}',
      '.line.gold{color:var(--dh-accent);}',
      '.line .muted{opacity:.6;font-size:11px;}',
      '.summary{background:var(--dh-card);border:1px solid var(--dh-line);padding:20px;margin-bottom:24px;}',
      '.summary h4{font-family:var(--dh-serif);font-size:22px;font-weight:300;margin:0 0 4px;}',
      '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}',
      '.chip{font-size:10.5px;letter-spacing:.08em;border:1px solid var(--dh-line);padding:4px 9px;color:var(--dh-mid);}',

      '.pay{display:flex;gap:10px;margin-bottom:22px;}',
      '.pay button{flex:1;border:1px solid var(--dh-line);padding:14px;font-size:11px;letter-spacing:.14em;',
      'text-transform:uppercase;background:var(--dh-card);transition:.2s;}',
      '.pay button[aria-pressed="true"]{border-color:var(--dh-ink);background:var(--dh-ink);color:var(--dh-bg);}',

      '.dock{flex:none;border-top:1px solid var(--dh-line);padding:18px 26px;background:var(--dh-card);',
      'display:flex;align-items:center;gap:14px;}',
      '.dock .total{flex:1;font-size:12px;color:var(--dh-mid);}',
      '.dock .total b{display:block;color:var(--dh-ink);font-size:17px;font-weight:400;letter-spacing:.02em;}',
      '.dock .btn{flex:none;}',
      '.ghost{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dh-mid);',
      'border-bottom:1px solid transparent;padding-bottom:2px;}',
      '.ghost:hover{color:var(--dh-ink);border-bottom-color:var(--dh-accent);}',

      '.err{background:rgba(179,65,46,.1);border:1px solid rgba(179,65,46,.4);color:#b3412e;',
      'padding:12px 14px;font-size:12px;margin-bottom:18px;}',
      '.note{font-size:11px;color:var(--dh-mid);line-height:1.7;opacity:.85;}',
      '.done{text-align:center;padding:36px 8px;}',
      '.done .mark{font-size:44px;font-family:var(--dh-serif);color:var(--dh-accent);margin-bottom:18px;}',
      '.done h3{font-family:var(--dh-serif);font-size:32px;font-weight:300;margin:0 0 14px;}',
      '.ono{font-size:13px;letter-spacing:.16em;border:1px solid var(--dh-line);padding:12px;margin:20px 0;}',
      '.credit{text-align:center;font-size:10px;letter-spacing:.18em;text-transform:uppercase;',
      'color:var(--dh-mid);opacity:.6;padding:16px 0 4px;}',
      '.credit a{border-bottom:1px solid var(--dh-line);padding-bottom:2px;text-decoration:none;}',
      '.skel{background:var(--dh-card);border:1px solid var(--dh-line);height:360px;',
      'animation:dhpulse 1.6s ease-in-out infinite;}',
      '@keyframes dhpulse{0%,100%{opacity:.5}50%{opacity:.85}}',
      '.spin{display:inline-block;width:12px;height:12px;border:1.5px solid currentColor;',
      'border-top-color:transparent;border-radius:50%;animation:dhspin .7s linear infinite;}',
      '@keyframes dhspin{to{transform:rotate(360deg)}}',
    ].join('');
  }

  // ----------------------------------------------------------------- helpers
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function mountShadow(host) {
    var root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = '';
    if (settings.theme === 'dark') host.setAttribute('data-dh-theme', 'dark');
    var style = document.createElement('style');
    style.textContent = styles(settings.accent || '#c8a96e');
    root.appendChild(style);
    var wrap = el('div', { class: 'dh' });
    root.appendChild(wrap);
    return wrap;
  }

  // ------------------------------------------------------------ product card
  function productCard(product) {
    var shot = product.images && product.images.length
      ? el('div', { class: 'shot' }, [el('img', { src: absolute(product.images[0]), alt: product.name, loading: 'lazy' })])
      : el('div', { class: 'shot empty', text: 'DH' });

    return el('div', { class: 'card' }, [
      shot,
      el('div', { class: 'body' }, [
        product.tagline ? el('div', { class: 'tag', text: product.tagline }) : null,
        el('h3', { class: 'title', text: product.name }),
        el('p', { class: 'blurb', text: truncate(product.description, 150) }),
        el('div', { class: 'foot' }, [
          el('span', { class: 'price', text: product.bespoke ? product.fromLabel : product.basePriceLabel }),
          el('button', {
            class: 'cta',
            type: 'button',
            text: t('configure'),
            onclick: function () { openDrawer(product.sku); },
          }),
        ]),
      ]),
    ]);
  }

  function absolute(path) {
    return /^https?:\/\//.test(path) ? path : ORIGIN + path;
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.slice(0, text.lastIndexOf(' ', max)) + '…';
  }

  // ------------------------------------------------------------------ drawer
  var drawer = null;

  function Drawer() {
    var host = document.createElement('div');
    host.setAttribute('data-danishhawk-drawer', '');
    document.body.appendChild(host);
    var wrap = mountShadow(host);

    var scrim = el('div', { class: 'scrim', onclick: close });
    var panel = el('div', {
      class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Danish Hawk',
    });
    wrap.appendChild(scrim);
    wrap.appendChild(panel);

    var cardAvailable = state.config && state.config.payments.indexOf('card') !== -1;

    var ctx = {
      product: null, step: 'configure', selection: {}, quantity: 1,
      pricing: null, payment: cardAvailable ? 'card' : 'invoice',
      busy: false, error: '', result: null,
      customer: { country: 'DK' },
    };
    var lastFocus = null;
    var priceTimer = null;

    function onKey(event) {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') trapFocus(event);
    }

    function trapFocus(event) {
      var focusables = panel.querySelectorAll('button,input,select,textarea,a[href]');
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      var active = panel.getRootNode().activeElement;
      if (event.shiftKey && active === first) { last.focus(); event.preventDefault(); }
      else if (!event.shiftKey && active === last) { first.focus(); event.preventDefault(); }
    }

    function open(sku) {
      lastFocus = document.activeElement;
      ctx.step = 'configure'; ctx.error = ''; ctx.result = null;
      ctx.selection = {}; ctx.quantity = 1; ctx.pricing = null;
      ctx.product = null; ctx.payment = cardAvailable ? 'card' : 'invoice';
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      requestAnimationFrame(function () { scrim.classList.add('on'); panel.classList.add('on'); });
      render();
      track('open', sku);

      api('/products/' + encodeURIComponent(sku))
        .then(function (data) {
          ctx.product = data.product;
          // Preselect the first value of every option so a price shows immediately.
          data.product.options.forEach(function (option) {
            if (option.values.length) ctx.selection[option.key] = option.values[0].value;
          });
          render();
          repriceSoon(0);
        })
        .catch(function (err) { ctx.error = err.message; render(); });
    }

    function close() {
      scrim.classList.remove('on');
      panel.classList.remove('on');
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { panel.innerHTML = ''; }, 400);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function repriceSoon(delay) {
      clearTimeout(priceTimer);
      priceTimer = setTimeout(reprice, delay === undefined ? 220 : delay);
    }

    function reprice() {
      if (!ctx.product) return;
      return api('/price', {
        method: 'POST',
        body: {
          cart: [{ sku: ctx.product.sku, quantity: ctx.quantity, options: ctx.selection }],
          country: ctx.customer.country,
          vatNumber: ctx.customer.vatNumber,
          locale: state.locale,
          currency: state.currency,
        },
      })
        .then(function (data) { ctx.pricing = data; ctx.error = ''; render(); })
        .catch(function (err) { ctx.error = err.message; render(); });
    }

    function set(field, value) { ctx.customer[field] = value; }

    function render() {
      panel.innerHTML = '';
      panel.appendChild(bar());
      var scroll = el('div', { class: 'scroll' });
      panel.appendChild(scroll);

      if (ctx.step === 'done') { scroll.appendChild(doneView()); return; }
      if (!ctx.product) {
        scroll.appendChild(el('div', { class: 'note', text: ctx.error || t('loading') }));
        return;
      }
      if (ctx.error) scroll.appendChild(el('div', { class: 'err', text: ctx.error }));

      if (ctx.step === 'configure') scroll.appendChild(configureView());
      if (ctx.step === 'details') scroll.appendChild(detailsView());
      if (ctx.step === 'review') scroll.appendChild(reviewView());

      panel.appendChild(dock());
      var firstInput = panel.querySelector('input,select,button.opt');
      if (firstInput && ctx.step === 'details') firstInput.focus();
    }

    function bar() {
      var order = ['configure', 'details', 'review'];
      var labels = [t('yourPiece'), t('details'), t('review')];
      var steps = el('div', { class: 'steps' });
      order.forEach(function (name, index) {
        if (index) steps.appendChild(el('i'));
        steps.appendChild(
          ctx.step === name || (ctx.step === 'done' && index === 2)
            ? el('b', { text: labels[index] })
            : el('span', { text: labels[index] })
        );
      });
      return el('div', { class: 'bar' }, [
        el('div', { class: 'brand', text: 'Danish Hawk' }),
        ctx.step === 'done' ? el('div', { class: 'steps' }) : steps,
        el('button', { class: 'x', type: 'button', 'aria-label': t('close'), text: '✕', onclick: close }),
      ]);
    }

    function configureView() {
      var product = ctx.product;
      var frag = document.createDocumentFragment();

      if (product.images && product.images.length) {
        frag.appendChild(el('div', { class: 'hero' }, [
          el('img', { src: absolute(product.images[0]), alt: product.name }),
        ]));
      }
      if (product.tagline) frag.appendChild(el('div', { class: 'sub', text: product.tagline }));
      frag.appendChild(el('h2', { class: 'h1', text: product.name }));
      frag.appendChild(el('p', { class: 'para', text: product.description }));

      var spec = el('dl', { class: 'spec' });
      if (product.materials) {
        spec.appendChild(el('dt', { text: t('materials') }));
        spec.appendChild(el('dd', { text: product.materials }));
      }
      if (product.dimensions) {
        spec.appendChild(el('dt', { text: t('dimensions') }));
        spec.appendChild(el('dd', { text: product.dimensions }));
      }
      spec.appendChild(el('dt', { text: t('leadTime') }));
      spec.appendChild(el('dd', { text: product.leadTimeDays + ' ' + t('days') + (product.bespoke ? ' · ' + t('madeToOrder') : '') }));
      if (spec.childNodes.length) frag.appendChild(spec);

      product.options.forEach(function (option) {
        var field = el('div', { class: 'field' }, [el('span', { class: 'lab', text: option.label })]);
        var opts = el('div', { class: 'opts' });
        option.values.forEach(function (value) {
          opts.appendChild(el('button', {
            class: 'opt', type: 'button',
            'aria-pressed': ctx.selection[option.key] === value.value ? 'true' : 'false',
            onclick: function () {
              ctx.selection[option.key] = value.value;
              track('configure', product.sku);
              render();
              repriceSoon();
            },
          }, [
            el('span', { text: value.label }),
            value.priceDeltaLabel ? el('small', { text: value.priceDeltaLabel }) : null,
          ]));
        });
        field.appendChild(opts);
        frag.appendChild(field);
      });

      var qty = el('div', { class: 'field' }, [
        el('span', { class: 'lab', text: t('quantity') }),
        el('div', { class: 'qty' }, [
          el('button', {
            type: 'button', text: '−', 'aria-label': '-',
            onclick: function () { if (ctx.quantity > 1) { ctx.quantity--; render(); repriceSoon(); } },
          }),
          el('span', { text: String(ctx.quantity) }),
          el('button', {
            type: 'button', text: '+', 'aria-label': '+',
            onclick: function () { if (ctx.quantity < 20) { ctx.quantity++; render(); repriceSoon(); } },
          }),
        ]),
      ]);
      frag.appendChild(qty);
      frag.appendChild(credit());
      return frag;
    }

    function detailsView() {
      var frag = document.createDocumentFragment();
      frag.appendChild(el('h2', { class: 'h1', text: t('details') }));
      frag.appendChild(el('p', { class: 'para', text: t('nextSteps') }));

      function input(name, label, attrs) {
        attrs = attrs || {};
        var node = el('input', Object.assign({
          type: attrs.type || 'text',
          value: ctx.customer[name] || '',
          placeholder: label,
          'aria-label': label,
          autocomplete: attrs.autocomplete || 'on',
          oninput: function (event) {
            set(name, event.target.value);
            if (name === 'vatNumber') repriceSoon(500);
          },
        }, attrs.extra || {}));
        return el('div', { class: 'field' }, [el('span', { class: 'lab', text: label }), node]);
      }

      frag.appendChild(input('name', t('name'), { autocomplete: 'name' }));
      var contact = el('div', { class: 'row' });
      contact.appendChild(input('email', t('email'), { type: 'email', autocomplete: 'email' }));
      contact.appendChild(input('phone', t('phone'), { type: 'tel', autocomplete: 'tel' }));
      frag.appendChild(contact);

      var biz = el('div', { class: 'row' });
      biz.appendChild(input('company', t('company'), { autocomplete: 'organization' }));
      biz.appendChild(input('vatNumber', t('vatNumber')));
      frag.appendChild(biz);

      frag.appendChild(input('address1', t('address'), { autocomplete: 'address-line1' }));
      frag.appendChild(input('address2', t('address2'), { autocomplete: 'address-line2' }));

      var place = el('div', { class: 'row third' });
      place.appendChild(input('postalCode', t('postalCode'), { autocomplete: 'postal-code' }));
      place.appendChild(input('city', t('city'), { autocomplete: 'address-level2' }));
      frag.appendChild(place);

      var select = el('select', {
        'aria-label': t('country'),
        onchange: function (event) { set('country', event.target.value); repriceSoon(0); },
      });
      COUNTRIES.forEach(function (pair) {
        select.appendChild(el('option', {
          value: pair[0], text: pair[1], selected: ctx.customer.country === pair[0] ? 'selected' : null,
        }));
      });
      frag.appendChild(el('div', { class: 'field' }, [el('span', { class: 'lab', text: t('country') }), select]));

      frag.appendChild(el('div', { class: 'field' }, [
        el('span', { class: 'lab', text: t('note') }),
        el('textarea', {
          placeholder: t('note'), 'aria-label': t('note'),
          oninput: function (event) { set('note', event.target.value); },
        }),
      ]));

      // Honeypot — hidden from people, tempting to bots.
      frag.appendChild(el('input', {
        type: 'text', tabindex: '-1', 'aria-hidden': 'true', autocomplete: 'off',
        style: 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0',
        oninput: function (event) { ctx.customer.website = event.target.value; },
      }));

      return frag;
    }

    function reviewView() {
      var frag = document.createDocumentFragment();
      var pricing = ctx.pricing;
      frag.appendChild(el('h2', { class: 'h1', text: t('review') }));

      var chips = el('div', { class: 'chips' });
      Object.keys(ctx.selection).forEach(function (key) {
        var option = ctx.product.options.filter(function (o) { return o.key === key; })[0];
        if (!option) return;
        var value = option.values.filter(function (v) { return v.value === ctx.selection[key]; })[0];
        if (value) chips.appendChild(el('span', { class: 'chip', text: option.label + ': ' + value.label }));
      });

      frag.appendChild(el('div', { class: 'summary' }, [
        el('h4', { text: ctx.product.name }),
        el('div', { class: 'note', text: ctx.quantity + ' × ' + (pricing ? pricing.lines[0].unitPriceLabel : '') }),
        chips,
      ]));

      if (pricing) {
        var lines = el('div', { class: 'lines' }, [
          row(t('subtotal'), pricing.subtotal.label),
          row(t('shipping'), pricing.shipping.quoted ? t('shippingQuoted') : pricing.shipping.label),
          row(t('vat') + (pricing.vat.charged ? ' (25%)' : ''), pricing.vatAmount.label),
        ]);
        lines.appendChild(row(t('total'), pricing.total.label, 'big'));
        if (pricing.deposit.amount > 0 && pricing.deposit.amount < pricing.total.amount) {
          lines.appendChild(row(t('deposit'), pricing.deposit.label, 'gold'));
          lines.appendChild(row(t('balance'), pricing.balance.label));
        }
        frag.appendChild(lines);

        if (!pricing.vat.charged) {
          frag.appendChild(el('p', {
            class: 'note',
            text: pricing.vat.reason === 'reverse_charge' ? t('reverseCharge') : t('exportVat'),
          }));
        }
        if (state.currency !== 'DKK') {
          frag.appendChild(el('p', {
            class: 'note',
            text: t('settledIn') + ': ' + pricing.settlement.label + ' (' + t('approx') + ' ' + pricing.total.label + ')',
          }));
        }
      }

      if (state.config && state.config.payments.indexOf('card') !== -1) {
        var pay = el('div', { class: 'pay' });
        [['card', t('payCard')], ['invoice', t('payInvoice')]].forEach(function (pair) {
          pay.appendChild(el('button', {
            type: 'button', text: pair[1],
            'aria-pressed': ctx.payment === pair[0] ? 'true' : 'false',
            onclick: function () { ctx.payment = pair[0]; render(); },
          }));
        });
        frag.appendChild(el('div', { class: 'field' }, [el('span', { class: 'lab', text: t('payment') }), pay]));
      }

      frag.appendChild(el('p', { class: 'note', text: t('nextSteps') }));
      frag.appendChild(credit());
      return frag;
    }

    function row(label, value, variant) {
      return el('div', { class: 'line' + (variant ? ' ' + variant : '') }, [
        el('span', { text: label }),
        el('span', { text: value }),
      ]);
    }

    function doneView() {
      var result = ctx.result || {};
      var frag = document.createDocumentFragment();
      frag.appendChild(el('div', { class: 'done' }, [
        el('div', { class: 'mark', text: '✦' }),
        el('h3', { text: t('thankYou') }),
        el('p', { class: 'para', text: t('confirmationSent') + ' ' + (ctx.customer.email || '') }),
        el('div', { class: 'ono', text: t('orderNumber') + ' · ' + (result.orderNo || '') }),
        el('p', { class: 'note', text: t('nextSteps') }),
        result.paymentUrl
          ? el('a', {
              class: 'btn gold', href: result.paymentUrl, text: t('payNow'),
              style: 'margin-top:24px;text-decoration:none',
            })
          : null,
      ]));
      frag.appendChild(credit());
      return frag;
    }

    function credit() {
      return el('div', { class: 'credit' }, [
        el('a', { href: 'https://danishhawk.com', target: '_blank', rel: 'noopener', text: t('poweredBy') }),
      ]);
    }

    function dock() {
      var pricing = ctx.pricing;
      var node = el('div', { class: 'dock' });

      if (ctx.step !== 'configure') {
        node.appendChild(el('button', {
          class: 'ghost', type: 'button', text: t('back'),
          onclick: function () { ctx.step = ctx.step === 'review' ? 'details' : 'configure'; ctx.error = ''; render(); },
        }));
      }

      node.appendChild(el('div', { class: 'total' }, [
        el('span', { text: t('total') }),
        el('b', { text: pricing ? pricing.total.label : '—' }),
      ]));

      if (ctx.step === 'configure') {
        node.appendChild(el('button', {
          class: 'btn gold', type: 'button', text: t('next'),
          onclick: function () { ctx.step = 'details'; track('checkout_start', ctx.product.sku); render(); },
        }));
      } else if (ctx.step === 'details') {
        node.appendChild(el('button', {
          class: 'btn gold', type: 'button', text: t('next'),
          onclick: function () {
            var missing = validateDetails();
            if (missing) { ctx.error = missing; render(); return; }
            ctx.step = 'review'; ctx.error = ''; render(); reprice();
          },
        }));
      } else if (ctx.step === 'review') {
        var label = ctx.payment === 'card' && ctx.pricing && ctx.pricing.deposit.amount
          ? t('payDeposit') : t('placeOrder');
        node.appendChild(el('button', {
          class: 'btn gold', type: 'button', disabled: ctx.busy ? 'disabled' : null,
          onclick: submit,
        }, [
          ctx.busy ? el('span', { class: 'spin' }) : null,
          el('span', { text: ctx.busy ? t('sending') : label }),
        ]));
      }
      return node;
    }

    function validateDetails() {
      if (!ctx.customer.name) return t('name') + ': ' + t('required');
      if (!ctx.customer.email || ctx.customer.email.indexOf('@') === -1) return t('email') + ': ' + t('required');
      if (!ctx.customer.address1) return t('address') + ': ' + t('required');
      if (!ctx.customer.postalCode) return t('postalCode') + ': ' + t('required');
      if (!ctx.customer.city) return t('city') + ': ' + t('required');
      return '';
    }

    function submit() {
      if (ctx.busy) return;
      ctx.busy = true; ctx.error = ''; render();

      api('/orders', {
        method: 'POST',
        body: Object.assign({}, ctx.customer, {
          cart: [{ sku: ctx.product.sku, quantity: ctx.quantity, options: ctx.selection }],
          locale: state.locale,
          currency: state.currency,
          payment: ctx.payment,
          kind: 'order',
        }),
      })
        .then(function (result) {
          ctx.result = result;
          ctx.busy = false;
          ctx.step = 'done';
          render();
          if (result.paymentUrl) setTimeout(function () { location.href = result.paymentUrl; }, 1200);
          emit('order', result);
        })
        .catch(function (err) {
          ctx.busy = false;
          ctx.error = err.message || t('somethingWrong');
          render();
        });
    }

    return { open: open, close: close };
  }

  function openDrawer(sku) {
    if (!drawer) drawer = Drawer();
    drawer.open(sku);
  }

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent('danishhawk:' + name, { detail: detail }));
    } catch (e) { /* older browsers */ }
  }

  // ------------------------------------------------------------------ mounts
  function renderCollection(host) {
    var wrap = mountShadow(host);
    var grid = el('div', { class: 'grid' });
    wrap.appendChild(grid);

    var category = host.getAttribute('data-category') || '';
    var skus = host.getAttribute('data-sku') || '';
    var limit = parseInt(host.getAttribute('data-limit') || '0', 10);

    for (var i = 0; i < 3; i++) grid.appendChild(el('div', { class: 'skel' }));

    var query = '/products' + (category || skus
      ? '?' + (category ? 'category=' + encodeURIComponent(category) : '') +
        (skus ? (category ? '&' : '') + 'sku=' + encodeURIComponent(skus) : '')
      : '');

    api(query)
      .then(function (data) {
        grid.innerHTML = '';
        var products = limit > 0 ? data.products.slice(0, limit) : data.products;
        if (!products.length) {
          grid.appendChild(el('p', { class: 'note', text: t('empty') }));
          return;
        }
        products.forEach(function (product) { grid.appendChild(productCard(product)); });
        wrap.appendChild(el('div', { class: 'credit' }, [
          el('a', { href: 'https://danishhawk.com', target: '_blank', rel: 'noopener', text: t('sold') }),
        ]));
        products.forEach(function (product) { track('view', product.sku); });
      })
      .catch(function (err) {
        grid.innerHTML = '';
        grid.appendChild(el('div', { class: 'err', text: err.message }));
      });
  }

  function renderSingle(host, sku) {
    var wrap = mountShadow(host);
    var slot = el('div', { class: 'skel', style: 'max-width:420px' });
    wrap.appendChild(slot);
    api('/products/' + encodeURIComponent(sku))
      .then(function (data) {
        wrap.innerHTML = '';
        var card = productCard(data.product);
        card.style.maxWidth = '420px';
        wrap.appendChild(card);
        track('view', sku);
      })
      .catch(function (err) {
        wrap.innerHTML = '';
        wrap.appendChild(el('div', { class: 'err', text: err.message }));
      });
  }

  function renderButton(host, sku) {
    var wrap = mountShadow(host);
    var label = host.getAttribute('data-label') || t('configure');
    var style = host.getAttribute('data-style') === 'outline' ? 'btn' : 'btn gold';
    var button = el('button', { class: style, type: 'button' }, [el('span', { text: label })]);
    button.addEventListener('click', function () { openDrawer(sku); });
    wrap.appendChild(button);

    if (host.getAttribute('data-price') !== 'off') {
      api('/products/' + encodeURIComponent(sku))
        .then(function (data) {
          button.appendChild(el('span', {
            class: 'amt',
            text: '· ' + (data.product.bespoke ? data.product.fromLabel : data.product.basePriceLabel),
          }));
        })
        .catch(function () { /* the button still works without a price */ });
    }
  }

  function scan() {
    document.querySelectorAll('[data-danishhawk-collection]:not([data-dh-ready])').forEach(function (host) {
      host.setAttribute('data-dh-ready', '');
      renderCollection(host);
    });
    document.querySelectorAll('[data-danishhawk-product]:not([data-dh-ready])').forEach(function (host) {
      host.setAttribute('data-dh-ready', '');
      renderSingle(host, host.getAttribute('data-danishhawk-product'));
    });
    document.querySelectorAll('[data-danishhawk-button]:not([data-dh-ready])').forEach(function (host) {
      host.setAttribute('data-dh-ready', '');
      renderButton(host, host.getAttribute('data-danishhawk-button'));
    });
  }

  // ------------------------------------------------------------------- boot
  function boot() {
    loadFonts();
    api('/config')
      .then(function (data) {
        state.config = data;
        state.locale = settings.locale || data.locale;
        state.currency = settings.currency || data.currency;
        if (data.partner.theme && data.partner.theme.accent && !settings.accent) {
          settings.accent = data.partner.theme.accent;
        }
        state.ready = true;
        scan();
        // Partner pages may add mount points later (tabs, infinite scroll, a CMS preview).
        // Debounced so a busy page cannot turn this into a hot loop.
        var pending = null;
        new MutationObserver(function () {
          clearTimeout(pending);
          pending = setTimeout(scan, 120);
        }).observe(document.documentElement, { childList: true, subtree: true });
        emit('ready', { partner: data.partner.name, products: data.productCount });
      })
      .catch(function (err) {
        console.error('[DanishHawk]', err.message);
        document.querySelectorAll('[data-danishhawk-collection],[data-danishhawk-product]')
          .forEach(function (host) {
            var wrap = mountShadow(host);
            wrap.appendChild(el('div', { class: 'err', text: 'Danish Hawk: ' + err.message }));
          });
      });
  }

  window.DanishHawk = {
    __loaded: true,
    open: function (sku) { openDrawer(sku); },
    refresh: scan,
    setLocale: function (locale) { state.locale = locale; document.querySelectorAll('[data-dh-ready]').forEach(function (h) { h.removeAttribute('data-dh-ready'); h.shadowRoot && (h.shadowRoot.innerHTML = ''); }); scan(); },
    setCurrency: function (currency) { state.currency = currency; this.setLocale(state.locale); },
    get config() { return state.config; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
