import { config } from './config.js';
import { db, all, get, run, tx, bindable, setSetting } from './db.js';
import { hashPassword, publicKey, portalKey } from './lib/crypto.js';

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
    slug: 'tandhjulet-spisebord',
    category: 'dining',
    name_da: 'Tandhjulet',
    name_en: 'Tandhjulet Dining Table',
    tagline_da: 'Spisebord — flerarmet plade på træformet base',
    tagline_en: 'Dining table — multi-arm top on a tree-form base',
    description_da:
      'Flerarmet bordplade i mørktolieret eg med CNC-fræset birkebase i træform. Pladen tegnes i CAD omkring dit rum, så armene lander præcis der, hvor stolene skal stå. Plads til 6–8 personer. Fuldt skræddersyet.',
    description_en:
      'Multi-arm tabletop in dark-oiled oak on a tree-form CNC birch base. The top is drawn in CAD around your room so the arms land exactly where the chairs go. Seats 6–8. Fully bespoke.',
    materials_da: 'Mørktolieret eg, lamineret birkefinér-base',
    materials_en: 'Dark-oiled oak, laminated birch ply base',
    dimensions: 'Ø 160–220 cm, H 74 cm',
    base_price: kr(25000),
    lead_time_days: 56,
    deposit_pct: 0.5,
    shipping_price: kr(2400),
    images: ['/media/tandhjulet-dining-table.jpg'],
    position: 3,
    options: [
      {
        key: 'seats',
        label_da: 'Størrelse',
        label_en: 'Size',
        values: [
          { value: '6', label_da: 'Ø160 cm — 6 personer', label_en: 'Ø160 cm — seats 6', price_delta: 0 },
          { value: '8', label_da: 'Ø190 cm — 8 personer', label_en: 'Ø190 cm — seats 8', price_delta: kr(4500) },
          { value: '10', label_da: 'Ø220 cm — 10 personer', label_en: 'Ø220 cm — seats 10', price_delta: kr(9000) },
        ],
      },
      WOOD_OPTION([
        { value: 'eg-moerk', label_da: 'Mørktolieret eg (som vist)', label_en: 'Dark-oiled oak (as shown)', price_delta: 0 },
        { value: 'eg-natur', label_da: 'Naturolieret eg', label_en: 'Natural-oiled oak', price_delta: 0 },
        { value: 'valnoed', label_da: 'Amerikansk valnød', label_en: 'American walnut', price_delta: kr(5500) },
        { value: 'ask', label_da: 'Massiv ask', label_en: 'Solid ash', price_delta: kr(-1500) },
      ]),
      {
        key: 'base',
        label_da: 'Base',
        label_en: 'Base',
        values: [
          { value: 'birk', label_da: 'Birkefinér, naturolie', label_en: 'Birch ply, natural oil', price_delta: 0 },
          { value: 'sort', label_da: 'Sortmalet birk', label_en: 'Black-painted birch', price_delta: kr(1400) },
          { value: 'stål', label_da: 'Pulverlakeret stål', label_en: 'Powder-coated steel', price_delta: kr(4200) },
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
       shipping_price, images, materials_da, materials_en, dimensions, bespoke, status, position
     ) VALUES (
       :sku, :slug, :category, :name_da, :name_en, :tagline_da, :tagline_en,
       :description_da, :description_en, :base_price, :lead_time_days, :deposit_pct,
       :shipping_price, :images, :materials_da, :materials_en, :dimensions, :bespoke, 'active', :position
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
      `INSERT INTO product_options (product_id, key, label_da, label_en, required, position)
       VALUES (:productId, :key, :label_da, :label_en, 1, :position)`,
      bindable({ productId, key: option.key, label_da: option.label_da, label_en: option.label_en, position: index })
    );
    const optionId = Number(optionResult.lastInsertRowid);
    option.values.forEach((value, valueIndex) => {
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
