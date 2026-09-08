import { config } from './config.js';
import { db, all, get, run, tx, bindable, setSetting } from './db.js';
import { hashPassword, publicKey, portalKey } from './lib/crypto.js';
import { MIN_DIA, MAX_DIA } from '../../assets/tandhjulet-pricing.js';

const kr = (amount) => Math.round(amount * 100); // kroner -> øre

const WOOD_OPTION = (values) => ({
  key: 'wood',
  label_da: 'Træsort',
  label_en: 'Timber',
  values,
});

const PRODUCTS = [
  {
    sku: 'DH-PAUROSA-CONSOLE',
    slug: 'pau-rosa-vaegkonsol',
    category: 'console',
    name_da: 'Pau Rosa Vægkonsol',
    name_en: 'Pau Rosa Wall Console',
    tagline_da: 'Konsolbord — Sjælden Palisander',
    tagline_en: 'Console — Rare Rosewood',
    description_da:
      'Udført i Pau Rosa — en sjælden og udsøgt palisander med dramatisk åretegning. Svævende profil, vægmonteret, uden synlige beslag. Hvert stykke skæres af én planke, så åretegningen løber ubrudt gennem hele konsollen. Et stykke du ikke finder andre steder.',
    description_en:
      'Crafted in Pau Rosa — a rare and exceptional rosewood with dramatic grain. Floating profile, wall-mounted, with no visible fixings. Each piece is cut from a single board so the grain runs unbroken across the console. A piece you will not find anywhere else.',
    materials_da: 'Massiv Pau Rosa, hårdvoksolie, skjult stålophæng',
    materials_en: 'Solid Pau Rosa, hard wax oil, concealed steel mount',
    dimensions: '120 × 32 × 18 cm (B × D × H)',
    base_price: kr(19000),
    lead_time_days: 42,
    deposit_pct: 0.5,
    shipping_price: kr(1200),
    images: ['/media/pau-rosa-console.jpg'],
    position: 1,
    enquiry_only: true,   // shown to say what can be made; priced on enquiry
    options: [
      WOOD_OPTION([
        { value: 'pau-rosa', label_da: 'Pau Rosa (som vist)', label_en: 'Pau Rosa (as shown)', price_delta: 0 },
        { value: 'valnoed', label_da: 'Amerikansk valnød', label_en: 'American walnut', price_delta: kr(-2500) },
        { value: 'eg', label_da: 'Massiv eg', label_en: 'Solid oak', price_delta: kr(-4000) },
      ]),
      {
        key: 'length',
        label_da: 'Længde',
        label_en: 'Length',
        values: [
          { value: '100', label_da: '100 cm', label_en: '100 cm', price_delta: kr(-2000) },
          { value: '120', label_da: '120 cm (standard)', label_en: '120 cm (standard)', price_delta: 0 },
          { value: '150', label_da: '150 cm', label_en: '150 cm', price_delta: kr(3500) },
          { value: '180', label_da: '180 cm', label_en: '180 cm', price_delta: kr(6500) },
        ],
      },
      {
        key: 'finish',
        label_da: 'Overflade',
        label_en: 'Finish',
        values: [
          { value: 'natur', label_da: 'Naturolie', label_en: 'Natural oil', price_delta: 0 },
          { value: 'moerk', label_da: 'Mørkolieret', label_en: 'Dark oiled', price_delta: kr(900) },
          { value: 'sæbe', label_da: 'Sæbebehandlet', label_en: 'Soap treated', price_delta: kr(900) },
        ],
      },
    ],
  },
  {
    sku: 'DH-HOEGH-TV',
    slug: 'hoegh-tv-bord',
    category: 'sideboard',
    name_da: 'HØGH TV-bord',
    name_en: 'HØGH TV Table',
    tagline_da: 'TV-bord med CNC-fræsede bogstavben',
    tagline_en: 'TV table on CNC-sculpted letter legs',
    description_da:
      'CNC-fræsede egebogstaver udgør benene. Bejdset valnødplade med LED-underlys, der tegner møblet op mod gulvet. Bogstaverne kan udskiftes med dit eget navn eller ord — fire til seks tegn.',
    description_en:
      'CNC-sculpted oak letters form the legs. Stained walnut top with LED underglow that draws the piece against the floor. The letters can be replaced with your own name or word — four to six characters.',
    materials_da: 'Egetræsben, bejdset valnødplade, dæmpbar LED',
    materials_en: 'Oak legs, stained walnut top, dimmable LED',
    dimensions: '160 × 42 × 45 cm (B × D × H)',
    base_price: kr(15000),
    lead_time_days: 35,
    deposit_pct: 0.5,
    shipping_price: kr(1200),
    images: ['/media/hoegh-tv-table.jpg'],
    position: 2,
    enquiry_only: true,   // shown to say what can be made; priced on enquiry
    options: [
      {
        key: 'lettering',
        label_da: 'Bogstavben',
        label_en: 'Letter legs',
        values: [
          { value: 'hoegh', label_da: 'HØGH (som vist)', label_en: 'HØGH (as shown)', price_delta: 0 },
          { value: 'custom', label_da: 'Dine egne bogstaver (4–6 tegn)', label_en: 'Your own letters (4–6 characters)', price_delta: kr(2200) },
        ],
      },
      {
        key: 'led',
        label_da: 'LED-underlys',
        label_en: 'LED underglow',
        values: [
          { value: 'warm', label_da: 'Varm hvid, dæmpbar', label_en: 'Warm white, dimmable', price_delta: 0 },
          { value: 'rgb', label_da: 'RGB med app-styring', label_en: 'RGB with app control', price_delta: kr(1800) },
          { value: 'none', label_da: 'Uden lys', label_en: 'No lighting', price_delta: kr(-1200) },
        ],
      },
      {
        key: 'length',
        label_da: 'Længde',
        label_en: 'Length',
        values: [
          { value: '140', label_da: '140 cm', label_en: '140 cm', price_delta: kr(-1500) },
          { value: '160', label_da: '160 cm (standard)', label_en: '160 cm (standard)', price_delta: 0 },
          { value: '200', label_da: '200 cm', label_en: '200 cm', price_delta: kr(3800) },
        ],
      },
    ],
  },
  {
    sku: 'DH-TANDHJULET',
    slug: 'tandhjulet',
    category: 'dining',
    name_da: 'Tandhjulet',
    name_en: 'Tandhjulet',
    tagline_da: 'Rundt spisebord i eg med drejeskive i midten',
    tagline_en: 'Round oak dining table with a turntable at the centre',
    description_da:
      'Et rundt spisebord i eg, skåret som et tandhjul. Midterpladen er det samme tandhjul i mindre skala, lagt på et kugleleje der er fræset ned i bordpladen, så den drejer hele vejen rundt. Otte flader, otte kuverter, ingen bordende. Hvert bord skæres til målet.',
    description_en:
      'A round oak dining table cut in the shape of a cog. The centre board is the same cog at a smaller scale, on a ball bearing routed into the tabletop itself, so it turns the whole way round. Eight flats, eight places, no head of the table. Every table is cut to size.',
    materials_da: '21 mm MDF med egefiner eller 26 mm massiv eg, laserskåret stelramme',
    materials_en: '21 mm MDF with oak veneer or 26 mm solid oak, laser-cut steel underframe',
    dimensions: 'Ø 1855–2000 mm tand til tand, H 746 mm',
    /* The lowest configuration the formula can produce: 1855 mm, veneered,
       oiled, small bearing. Every real price comes from src/pricing. */
    base_price: kr(17500),
    pricing: 'tandhjulet',
    lead_time_days: 56,
    deposit_pct: 0.5,
    shipping_price: 0,                 // quoted after measuring the way in
    images: ['/assets/tandhjulet-top-and-centre-0e4e9e71.jpg'],
    position: 1,
    options: [
      /* The diameter is not a menu: it is any number between 1855 and 2000 mm in
         steps of 5, so the buyer slides to the size the room takes. The bounds
         come from the pricing module, which is also what checks them. */
      {
        key: 'diameter',
        type: 'range',
        label_da: 'Diameter — tand til tand',
        label_en: 'Diameter — tooth to tooth',
        min: MIN_DIA,
        max: MAX_DIA,
        step: 5,
        unit: 'mm',
      },
      {
        key: 'material',
        label_da: 'Bordplade',
        label_en: 'Tabletop',
        values: [
          { value: 'veneer', label_da: '21 mm MDF med egefiner', label_en: '21 mm MDF with oak veneer', price_delta: 0 },
          { value: 'solid',  label_da: '26 mm massiv eg',        label_en: '26 mm solid oak',           price_delta: 0 },
        ],
      },
      {
        key: 'treatment',
        label_da: 'Behandling',
        label_en: 'Treatment',
        values: [
          { value: 'olie', label_da: 'Olieret — kan pletrepareres', label_en: 'Oiled — repairs in place', price_delta: 0 },
          { value: 'lak',  label_da: 'Lakeret — nærmest vedligeholdelsesfri', label_en: 'Lacquered — next to no upkeep', price_delta: 0 },
        ],
      },
      {
        key: 'finish',
        label_da: 'Farve',
        label_en: 'Colour',
        values: [
          { value: 'natur',  label_da: 'Natur', label_en: 'Natural', price_delta: 0 },
          { value: 'hvid',   label_da: 'Hvid',  label_en: 'White',   price_delta: 0 },
          { value: 'moerk',  label_da: 'Mørk',  label_en: 'Dark',    price_delta: 0 },
          { value: 'roeget', label_da: 'Røget', label_en: 'Smoked',  price_delta: 0 },
        ],
      },
      {
        key: 'bearing',
        label_da: 'Drejeskive — leje',
        label_en: 'Turntable — bearing',
        values: [
          { value: '401.5', label_da: '401,5 mm — lille', label_en: '401.5 mm — small', price_delta: 0 },
          { value: '601.5', label_da: '601,5 mm — stor',  label_en: '601.5 mm — large', price_delta: 0 },
        ],
      },
    ],
  },
  {
    sku: 'DH-CNC-HOUR',
    slug: 'cnc-fraesning',
    category: 'service',
    name_da: 'CNC-fræsning — timepris',
    name_en: 'CNC Machining — hourly',
    tagline_da: 'Maskintid hos vores danske producenter',
    tagline_en: 'Machine time with our Danish producers',
    description_da:
      'Gennem vores netværk af førende danske møbelproducenter tilbyder vi CNC-fræsning til tredjepartsprojekter. Tag dine filer med — eller blot din idé, så laver vi produktionsfilerne. Prisen er pr. maskintime inkl. opsætning.',
    description_en:
      'Through our network of premier Danish furniture producers we offer CNC machining for third-party projects. Bring your files — or just your idea, and we prepare the production files. Priced per machine hour including setup.',
    materials_da: 'Materiale afregnes separat',
    materials_en: 'Material billed separately',
    dimensions: 'Arbejdsområde op til 3000 × 1500 × 200 mm',
    base_price: kr(850),
    lead_time_days: 14,
    deposit_pct: 0,
    shipping_price: 0,
    bespoke: 0,
    images: [],
    position: 4,
    enquiry_only: true,   // shown to say what can be made; priced on enquiry
    options: [
      {
        key: 'files',
        label_da: 'Produktionsfiler',
        label_en: 'Production files',
        values: [
          { value: 'ready', label_da: 'Jeg har CNC-klare filer', label_en: 'I have CNC-ready files', price_delta: 0 },
          { value: 'cad', label_da: 'Lav filerne for mig (CAD + værktøjsbaner)', label_en: 'Prepare the files for me (CAD + toolpaths)', price_delta: kr(1600) },
        ],
      },
    ],
  },
];

const PARTNERS = [
  {
    name: 'Demo — Interiør Studio',
    slug: 'demo-studio',
    contact_name: 'Demo',
    email: '',
    country: 'DK',
    domains: [],
    commission_rate: 0.15,
    locale: 'da',
    currency: 'DKK',
    notes:
      'Demo account used by /demo/. No domain restriction, so it also works on localhost. Pause or delete before going live.',
  },
];

export function ensureSeed() {
  const hasAdmin = get('SELECT COUNT(*) AS n FROM admins').n > 0;
  if (!hasAdmin) {
    run('INSERT INTO admins (email, name, password_hash) VALUES (:email, :name, :hash)', {
      email: config.adminEmail,
      name: 'Stefan Høgh',
      hash: hashPassword(config.adminPassword),
    });
    console.log(`Created admin ${config.adminEmail}`);
    if (config.adminPassword === 'skift-mig-nu') {
      console.log('  ⚠ Using the default password. Set ADMIN_PASSWORD in .env before deploying.');
    }
  }

  if (get('SELECT COUNT(*) AS n FROM products').n === 0) {
    tx(() => PRODUCTS.forEach(insertProduct));
    console.log(`Seeded ${PRODUCTS.length} products`);
  }

  if (get('SELECT COUNT(*) AS n FROM partners').n === 0) {
    tx(() => PARTNERS.forEach(insertPartner));
    const demo = get(`SELECT public_key, portal_key FROM partners WHERE slug = 'demo-studio'`);
    setSetting('demoKey', demo.public_key);
    console.log(`Seeded demo partner — embed key ${demo.public_key}`);
  }
}

function insertProduct(product) {
  const result = run(
    `INSERT INTO products (
       sku, slug, category, name_da, name_en, tagline_da, tagline_en,
       description_da, description_en, base_price, lead_time_days, deposit_pct,
       shipping_price, images, materials_da, materials_en, dimensions, bespoke, pricing, enquiry_only, status, position
     ) VALUES (
       :sku, :slug, :category, :name_da, :name_en, :tagline_da, :tagline_en,
       :description_da, :description_en, :base_price, :lead_time_days, :deposit_pct,
       :shipping_price, :images, :materials_da, :materials_en, :dimensions, :bespoke, :pricing, :enquiry_only, 'active', :position
     )`,
    bindable({
      sku: product.sku,
      slug: product.slug,
      category: product.category,
      name_da: product.name_da,
      name_en: product.name_en,
      tagline_da: product.tagline_da,
      tagline_en: product.tagline_en,
      description_da: product.description_da,
      description_en: product.description_en,
      base_price: product.base_price,
      lead_time_days: product.lead_time_days,
      deposit_pct: product.deposit_pct,
      shipping_price: product.shipping_price,
      pricing: product.pricing ?? '',
      enquiry_only: product.enquiry_only ? 1 : 0,
      materials_da: product.materials_da,
      materials_en: product.materials_en,
      dimensions: product.dimensions,
      position: product.position,
      bespoke: product.bespoke ?? 1,
      images: JSON.stringify(product.images || []),
    })
  );
  const productId = Number(result.lastInsertRowid);

  (product.options || []).forEach((option, index) => {
    const optionResult = run(
      `INSERT INTO product_options (
         product_id, key, label_da, label_en, required,
         type, min_value, max_value, step_value, unit, position
       ) VALUES (
         :productId, :key, :label_da, :label_en, 1,
         :type, :min_value, :max_value, :step_value, :unit, :position
       )`,
      bindable({
        productId,
        key: option.key,
        label_da: option.label_da,
        label_en: option.label_en,
        type: option.type ?? 'choice',
        min_value: option.min ?? 0,
        max_value: option.max ?? 0,
        step_value: option.step ?? 1,
        unit: option.unit ?? '',
        position: index,
      })
    );
    const optionId = Number(optionResult.lastInsertRowid);
    (option.values || []).forEach((value, valueIndex) => {
      run(
        `INSERT INTO product_option_values (option_id, value, label_da, label_en, price_delta, position)
         VALUES (:optionId, :value, :label_da, :label_en, :price_delta, :position)`,
        bindable({ optionId, ...value, position: valueIndex })
      );
    });
  });
}

function insertPartner(partner) {
  run(
    `INSERT INTO partners (
       name, slug, contact_name, email, country, domains, public_key, portal_key,
       commission_rate, catalogue, locale, currency, notes
     ) VALUES (
       :name, :slug, :contact_name, :email, :country, :domains, :public_key, :portal_key,
       :commission_rate, 'all', :locale, :currency, :notes
     )`,
    bindable({
      name: partner.name,
      slug: partner.slug,
      contact_name: partner.contact_name || '',
      email: partner.email || '',
      country: partner.country || 'DK',
      commission_rate: partner.commission_rate,
      locale: partner.locale,
      currency: partner.currency,
      domains: JSON.stringify(partner.domains || []),
      public_key: publicKey(),
      portal_key: portalKey(),
      notes: partner.notes || '',
    })
  );
}

// `npm run seed` / `npm run reset`
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  if (process.argv.includes('--reset')) {
    db.exec(`
      DELETE FROM order_items; DELETE FROM orders; DELETE FROM events; DELETE FROM outbox;
      DELETE FROM product_option_values; DELETE FROM product_options;
      DELETE FROM products; DELETE FROM partners; DELETE FROM sessions; DELETE FROM admins;
    `);
    console.log('Cleared all data.');
  }
  ensureSeed();
  const partners = all('SELECT name, public_key, portal_key FROM partners');
  console.log('\nEmbed keys:');
  for (const p of partners) console.log(`  ${p.name}: ${p.public_key}`);
}
