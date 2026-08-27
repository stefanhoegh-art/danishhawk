/* Danish Hawk — admin console. Plain modules, no build step. */

const app = document.getElementById('app');
const API = '/api/admin';

const state = { admin: null, view: 'dashboard', data: {}, settings: null };

// ------------------------------------------------------------------ helpers
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.admin) { state.admin = null; render(); }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

const kr = (ore, decimals = false) =>
  new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format((ore || 0) / 100) + ' kr';

const pct = (n) => `${(Number(n) * 100).toFixed(n * 100 % 1 === 0 ? 0 : 1)}%`;

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const date = (iso) =>
  new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString('da-DK', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

function toast(message, kind = 'ok') {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  if (kind === 'err') node.style.background = '#b3412e';
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function on(selector, event, handler, root = document) {
  root.querySelectorAll(selector).forEach((node) => node.addEventListener(event, handler));
}

const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment', quote_requested: 'Quote requested', quote_sent: 'Quote sent',
  deposit_paid: 'Deposit paid', paid: 'Paid in full', in_production: 'In production',
  shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled',
};

const statusPill = (status) => {
  const tone = ['paid', 'completed', 'shipped'].includes(status) ? 'ok'
    : ['cancelled'].includes(status) ? 'warn'
    : ['deposit_paid', 'in_production'].includes(status) ? 'gold' : '';
  return `<span class="pill ${tone}">${esc(STATUS_LABELS[status] || status)}</span>`;
};

// -------------------------------------------------------------------- login
function loginView() {
  app.innerHTML = `
    <div class="login"><div class="box">
      <h1>Danish&nbsp;Hawk</h1>
      <div class="tag">Commerce console</div>
      <div id="loginMsg"></div>
      <form id="loginForm">
        <div class="field"><label for="email">Email</label>
          <input id="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" required></div>
        <button class="btn gold" style="width:100%;justify-content:center" type="submit">Sign in</button>
      </form>
    </div></div>`;

  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      const result = await api('/login', {
        method: 'POST',
        body: {
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
        },
      });
      state.admin = result.admin;
      render();
    } catch (err) {
      document.getElementById('loginMsg').innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
      button.disabled = false;
    }
  });
}

// -------------------------------------------------------------------- shell
const VIEWS = [
  ['dashboard', 'Overview'], ['orders', 'Orders'], ['products', 'Pieces'],
  ['partners', 'Partners'], ['payouts', 'Commission'], ['outbox', 'Mail'], ['settings', 'Settings'],
];

function shell(inner) {
  app.innerHTML = `
    <div class="shell">
      <aside>
        <div class="brand"><div class="name">Danish Hawk</div><div class="tag">Commerce</div></div>
        <nav>${VIEWS.map(([id, label]) =>
          `<a href="#${id}" class="${state.view === id ? 'on' : ''}">${label}
             <span class="count" data-count="${id}"></span></a>`).join('')}</nav>
        <footer>
          ${esc(state.admin.email)}
          <button id="logout">Sign out</button>
        </footer>
      </aside>
      <main id="main">${inner}</main>
    </div>`;

  document.getElementById('logout').addEventListener('click', async () => {
    await api('/logout', { method: 'POST' });
    state.admin = null;
    render();
  });
}

function head(title, sub, actions = '') {
  return `<div class="head"><div><div class="sub">${esc(sub)}</div><h1>${esc(title)}</h1></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">${actions}</div></div>`;
}

// ---------------------------------------------------------------- dashboard
async function dashboard() {
  const stats = await api('/stats');
  const funnel = stats.funnel || {};
  const views = funnel.view || 0;
  const orders = stats.totals.orders || 0;
  const conversion = views ? ((orders / views) * 100).toFixed(1) + '%' : '—';

  const months = [...stats.monthly].reverse();
  const peak = Math.max(1, ...months.map((m) => m.revenue));

  shell(`
    ${head('Overview', 'Danish Hawk')}
    <div class="cards">
      <div class="stat"><div class="k">Order value</div><div class="v">${kr(stats.totals.revenue)}</div>
        <div class="n">${orders} order${orders === 1 ? '' : 's'} · ${stats.totals.openOrders} open</div></div>
      <div class="stat"><div class="k">Collected</div><div class="v">${kr(stats.totals.collected)}</div>
        <div class="n">Deposits and settled invoices</div></div>
      <div class="stat"><div class="k">Commission owed</div><div class="v gold">${kr(stats.totals.commission_due)}</div>
        <div class="n">${kr(stats.totals.commission)} earned by partners in total</div></div>
      <div class="stat"><div class="k">Widget views</div><div class="v">${views}</div>
        <div class="n">30 days · ${conversion} converted</div></div>
    </div>

    ${months.length > 1 ? `<div class="panel"><h3>Order value by month</h3><div class="body">
      <div class="bars">${months.map((m) =>
        `<div style="height:${Math.max(2, (m.revenue / peak) * 100)}%" title="${m.month}: ${kr(m.revenue)}"></div>`).join('')}</div>
      <div class="barlabels">${months.map((m) => `<span>${m.month.slice(5)}</span>`).join('')}</div>
    </div></div>` : ''}

    <div class="panel"><h3>Selling sites</h3><div class="wrap">
      ${stats.byPartner.length ? `<table>
        <thead><tr><th>Partner</th><th class="num">Orders</th><th class="num">Order value</th><th class="num">Commission</th></tr></thead>
        <tbody>${stats.byPartner.map((p) => `<tr>
          <td><a href="#partners">${esc(p.name)}</a></td>
          <td class="num">${p.orders}</td>
          <td class="num">${kr(p.revenue)}</td>
          <td class="num">${kr(p.commission)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No partner sites yet. Add one under Partners to get an embed snippet.</div>'}
    </div></div>

    <div class="panel"><h3>Latest orders</h3><div class="wrap">
      ${stats.recent.length ? `<table>
        <thead><tr><th>Order</th><th>Customer</th><th>Sold via</th><th class="num">Total</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${stats.recent.map((o) => `<tr>
          <td><a href="#orders/${esc(o.order_no)}"><code>${esc(o.order_no)}</code></a></td>
          <td>${esc(o.customer_name)}</td>
          <td>${esc(o.partner_name || 'Direct')}</td>
          <td class="num">${kr(o.total)}</td>
          <td>${statusPill(o.status)}</td>
          <td>${date(o.created_at)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No orders yet.</div>'}
    </div></div>`);

  setCount('products', stats.products);
  setCount('partners', stats.partners);
  setCount('orders', stats.totals.openOrders || '');
}

function setCount(view, value) {
  const node = document.querySelector(`[data-count="${view}"]`);
  if (node) node.textContent = value || '';
}

// ------------------------------------------------------------------- orders
async function ordersView(orderNo) {
  if (orderNo) return orderDetail(orderNo);

  const { orders } = await api('/orders');
  shell(`
    ${head('Orders', `${orders.length} in the ledger`)}
    <div class="panel"><div class="wrap">
      ${orders.length ? `<table>
        <thead><tr><th>Order</th><th>Customer</th><th>Sold via</th><th class="num">Total</th>
          <th class="num">Commission</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${orders.map((o) => `<tr>
          <td><a href="#orders/${esc(o.order_no)}"><code>${esc(o.order_no)}</code></a>
              ${o.kind === 'quote' ? '<span class="pill">Quote</span>' : ''}</td>
          <td>${esc(o.customer_name)}<div class="hint">${esc(o.customer_email)}</div></td>
          <td>${esc(o.partner_name || 'Direct')}</td>
          <td class="num">${kr(o.total)}${o.amount_paid ? `<div class="hint">${kr(o.amount_paid)} paid</div>` : ''}</td>
          <td class="num">${o.commission_amount ? kr(o.commission_amount) : '—'}</td>
          <td>${statusPill(o.status)}</td>
          <td>${date(o.created_at)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No orders yet. Orders placed through any partner site land here.</div>'}
    </div></div>`);
}

async function orderDetail(orderNo) {
  const { order } = await api(`/orders/${encodeURIComponent(orderNo)}`);
  const nextStatuses = Object.keys(STATUS_LABELS);

  shell(`
    ${head(order.order_no, order.kind === 'quote' ? 'Quote request' : 'Order',
      `<a class="btn small" href="#orders">All orders</a>`)}

    <div class="cards">
      <div class="stat"><div class="k">Total</div><div class="v">${kr(order.total)}</div>
        <div class="n">${kr(order.subtotal_ex_vat)} ex VAT · ${kr(order.vat_amount)} VAT</div></div>
      <div class="stat"><div class="k">Deposit</div><div class="v">${kr(order.deposit_amount)}</div>
        <div class="n">${kr(order.amount_paid)} received</div></div>
      <div class="stat"><div class="k">Commission</div><div class="v gold">${kr(order.commission_amount)}</div>
        <div class="n">${order.partner ? `${esc(order.partner.name)} · ${pct(order.commission_rate)}` : 'Direct sale'}</div></div>
      <div class="stat"><div class="k">Status</div><div class="v" style="font-size:22px;padding-top:8px">${STATUS_LABELS[order.status] || order.status}</div>
        <div class="n">Placed ${date(order.created_at)}</div></div>
    </div>

    <div class="panel"><h3>The piece</h3><div class="wrap"><table>
      <thead><tr><th>Item</th><th>Configuration</th><th class="num">Unit</th><th class="num">Qty</th><th class="num">Line</th></tr></thead>
      <tbody>${order.items.map((item) => `<tr>
        <td><strong>${esc(item.name)}</strong><div class="hint"><code>${esc(item.sku)}</code></div></td>
        <td>${item.options.map((o) => `${esc(o.label)}: <strong>${esc(o.value)}</strong>`).join('<br>') || '—'}</td>
        <td class="num">${kr(item.unit_price)}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${kr(item.line_total)}</td></tr>`).join('')}</tbody></table></div></div>

    <div class="grid2">
      <div class="panel"><h3>Customer</h3><div class="body">
        <p style="margin:0 0 14px"><strong>${esc(order.customer_name)}</strong><br>
        <a href="mailto:${esc(order.customer_email)}">${esc(order.customer_email)}</a><br>
        ${esc(order.customer_phone || '')}</p>
        ${order.company ? `<p class="hint">${esc(order.company)} ${esc(order.vat_number)}</p>` : ''}
        <p style="margin:14px 0 0">${esc(order.address_line1)}<br>
        ${order.address_line2 ? esc(order.address_line2) + '<br>' : ''}
        ${esc(order.postal_code)} ${esc(order.city)}<br>${esc(order.country)}</p>
        ${order.customer_note ? `<p class="hint" style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
          “${esc(order.customer_note)}”</p>` : ''}
        ${order.source_url ? `<p class="hint" style="margin-top:14px">Ordered from <a href="${esc(order.source_url)}" target="_blank" rel="noopener">${esc(order.source_url)}</a></p>` : ''}
      </div></div>

      <div class="panel"><h3>Move it along</h3><div class="body">
        <div class="field"><label for="status">Status</label>
          <select id="status">${nextStatuses.map((s) =>
            `<option value="${s}"${s === order.status ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}</select></div>
        <div class="field"><label for="paid">Amount received (kr)</label>
          <input id="paid" type="number" step="0.01" value="${(order.amount_paid / 100).toFixed(2)}"></div>
        <div class="field"><label for="note">Internal note</label>
          <textarea id="note">${esc(order.internal_note)}</textarea></div>
        <div class="field"><label for="commission">Commission</label>
          <select id="commission">${['pending', 'payable', 'paid', 'void'].map((s) =>
            `<option value="${s}"${s === order.commission_status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <button class="btn gold" id="saveOrder">Save</button>
      </div></div>
    </div>

    ${order.mail.length ? `<div class="panel"><h3>Mail sent</h3><div class="wrap"><table>
      <thead><tr><th>To</th><th>Subject</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${order.mail.map((m) => `<tr><td>${esc(m.to_email)}</td><td>${esc(m.subject)}</td>
        <td><span class="pill ${m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'warn' : ''}">${m.status}</span></td>
        <td>${date(m.created_at)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`);

  document.getElementById('saveOrder').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      await api(`/orders/${encodeURIComponent(order.order_no)}`, {
        method: 'PATCH',
        body: {
          status: document.getElementById('status').value,
          amount_paid: Math.round(Number(document.getElementById('paid').value) * 100),
          internal_note: document.getElementById('note').value,
          commission_status: document.getElementById('commission').value,
        },
      });
      toast('Order updated');
      orderDetail(order.order_no);
    } catch (err) {
      toast(err.message, 'err');
      event.target.disabled = false;
    }
  });
}

// ----------------------------------------------------------------- products
async function productsView() {
  const { products } = await api('/products');
  shell(`
    ${head('Pieces', 'The catalogue partners can sell',
      '<button class="btn gold" id="newProduct">New piece</button>')}
    <div class="panel"><div class="wrap">
      ${products.length ? `<table>
        <thead><tr><th>Piece</th><th>SKU</th><th class="num">From</th><th class="num">Deposit</th>
          <th class="num">Options</th><th>Status</th><th></th></tr></thead>
        <tbody>${products.map((p) => `<tr>
          <td><strong>${esc(p.name_da)}</strong><div class="hint">${esc(p.name_en)}</div></td>
          <td><code>${esc(p.sku)}</code></td>
          <td class="num">${kr(p.base_price)}</td>
          <td class="num">${pct(p.deposit_pct)}</td>
          <td class="num">${p.options.length}</td>
          <td><span class="pill ${p.status === 'active' ? 'ok' : ''}">${p.status}</span></td>
          <td class="num"><button class="btn small" data-edit="${p.id}">Edit</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">No pieces yet.</div>'}
    </div></div>`);

  document.getElementById('newProduct').addEventListener('click', () => productModal(null));
  on('[data-edit]', 'click', (event) =>
    productModal(products.find((p) => p.id === Number(event.target.dataset.edit))));
}

function productModal(product) {
  const isNew = !product;
  const p = product || {
    sku: '', slug: '', category: '', name_da: '', name_en: '', tagline_da: '', tagline_en: '',
    description_da: '', description_en: '', base_price: 0, lead_time_days: 42, deposit_pct: 0.5,
    shipping_price: 0, images: [], materials_da: '', materials_en: '', dimensions: '',
    status: 'active', position: 0, options: [], bespoke: 1,
  };
  let options = JSON.parse(JSON.stringify(p.options || []));

  const modal = openModal(isNew ? 'New piece' : p.name_da, `
    <div class="grid2">
      <div class="field"><label>Name (Danish)</label><input id="f_name_da" value="${esc(p.name_da)}"></div>
      <div class="field"><label>Name (English)</label><input id="f_name_en" value="${esc(p.name_en)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Tagline (DA)</label><input id="f_tagline_da" value="${esc(p.tagline_da)}"></div>
      <div class="field"><label>Tagline (EN)</label><input id="f_tagline_en" value="${esc(p.tagline_en)}"></div>
    </div>
    <div class="field"><label>Description (Danish)</label><textarea id="f_description_da">${esc(p.description_da)}</textarea></div>
    <div class="field"><label>Description (English)</label><textarea id="f_description_en">${esc(p.description_en)}</textarea></div>
    <div class="grid3">
      <div class="field"><label>Base price (kr, incl. VAT)</label>
        <input id="f_base_price" type="number" step="1" value="${(p.base_price / 100) || ''}"></div>
      <div class="field"><label>Delivery (kr, 0 = quote later)</label>
        <input id="f_shipping_price" type="number" step="1" value="${p.shipping_price / 100}"></div>
      <div class="field"><label>Deposit %</label>
        <input id="f_deposit_pct" type="number" step="5" min="0" max="100" value="${Math.round(p.deposit_pct * 100)}"></div>
    </div>
    <div class="grid3">
      <div class="field"><label>SKU</label><input id="f_sku" value="${esc(p.sku)}" placeholder="auto"></div>
      <div class="field"><label>Category</label><input id="f_category" value="${esc(p.category)}"></div>
      <div class="field"><label>Lead time (days)</label>
        <input id="f_lead_time_days" type="number" value="${p.lead_time_days}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Materials (DA)</label><input id="f_materials_da" value="${esc(p.materials_da)}"></div>
      <div class="field"><label>Materials (EN)</label><input id="f_materials_en" value="${esc(p.materials_en)}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Dimensions</label><input id="f_dimensions" value="${esc(p.dimensions)}"></div>
      <div class="field"><label>Status</label><select id="f_status">
        ${['active', 'draft', 'archived'].map((s) =>
          `<option${s === p.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Image URLs (one per line)</label>
      <textarea id="f_images">${esc((p.images || []).join('\n'))}</textarea>
      <div class="hint">Upload files to <code>app/public/media/</code> and reference them as <code>/media/name.jpg</code>, or paste any absolute URL.</div></div>

    <div class="field"><label>Options buyers configure</label><div id="optsEditor"></div>
      <button class="btn small" id="addOption" type="button">Add option</button></div>
  `, async () => {
    const body = {
      sku: value('f_sku'), category: value('f_category'),
      name_da: value('f_name_da'), name_en: value('f_name_en'),
      tagline_da: value('f_tagline_da'), tagline_en: value('f_tagline_en'),
      description_da: value('f_description_da'), description_en: value('f_description_en'),
      base_price: Math.round(Number(value('f_base_price')) * 100),
      shipping_price: Math.round(Number(value('f_shipping_price')) * 100),
      deposit_pct: Number(value('f_deposit_pct')) / 100,
      lead_time_days: Number(value('f_lead_time_days')),
      materials_da: value('f_materials_da'), materials_en: value('f_materials_en'),
      dimensions: value('f_dimensions'), status: value('f_status'),
      images: value('f_images').split('\n').map((s) => s.trim()).filter(Boolean),
      options,
    };
    if (isNew) await api('/products', { method: 'POST', body });
    else await api(`/products/${p.id}`, { method: 'PATCH', body });
    toast(isNew ? 'Piece created' : 'Piece saved');
    productsView();
  });

  const editor = modal.querySelector('#optsEditor');

  function drawOptions() {
    editor.innerHTML = options.map((option, oi) => `
      <div class="opts-editor">
        <div class="row">
          <div><label>Option (DA)</label><input data-o="${oi}" data-k="label_da" value="${esc(option.label_da || '')}"></div>
          <div><label>Option (EN)</label><input data-o="${oi}" data-k="label_en" value="${esc(option.label_en || '')}"></div>
          <div><label>Key</label><input data-o="${oi}" data-k="key" value="${esc(option.key || '')}"></div>
          <button class="btn small danger" data-rmo="${oi}" type="button">✕</button>
        </div>
        ${(option.values || []).map((value, vi) => `
          <div class="row">
            <div><input data-o="${oi}" data-v="${vi}" data-k="label_da" placeholder="Choice (DA)" value="${esc(value.label_da || '')}"></div>
            <div><input data-o="${oi}" data-v="${vi}" data-k="label_en" placeholder="Choice (EN)" value="${esc(value.label_en || '')}"></div>
            <div><input data-o="${oi}" data-v="${vi}" data-k="price_delta" type="number" step="1"
                 placeholder="± kr" value="${(value.price_delta || 0) / 100}"></div>
            <button class="btn small danger" data-rmv="${oi}.${vi}" type="button">✕</button>
          </div>`).join('')}
        <button class="btn small" data-addv="${oi}" type="button">Add choice</button>
      </div>`).join('') || '<div class="hint">No options — buyers order the piece exactly as listed.</div>';

    on('[data-o]', 'input', (event) => {
      const { o, v, k } = event.target.dataset;
      const target = v === undefined ? options[o] : options[o].values[v];
      target[k] = k === 'price_delta' ? Math.round(Number(event.target.value) * 100) : event.target.value;
      if (k === 'label_en' && v !== undefined) target.value = slug(event.target.value);
      if (k === 'label_da' && v !== undefined && !target.value) target.value = slug(event.target.value);
    }, editor);

    on('[data-rmo]', 'click', (event) => {
      options.splice(Number(event.target.dataset.rmo), 1); drawOptions();
    }, editor);
    on('[data-rmv]', 'click', (event) => {
      const [oi, vi] = event.target.dataset.rmv.split('.').map(Number);
      options[oi].values.splice(vi, 1); drawOptions();
    }, editor);
    on('[data-addv]', 'click', (event) => {
      const oi = Number(event.target.dataset.addv);
      options[oi].values = options[oi].values || [];
      options[oi].values.push({ label_da: '', label_en: '', value: '', price_delta: 0 });
      drawOptions();
    }, editor);
  }

  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

  modal.querySelector('#addOption').addEventListener('click', () => {
    options.push({ key: '', label_da: '', label_en: '', values: [] });
    drawOptions();
  });
  drawOptions();
}

const value = (id) => document.getElementById(id).value.trim();

// ----------------------------------------------------------------- partners
async function partnersView() {
  const { partners } = await api('/partners');
  shell(`
    ${head('Partners', 'Websites that sell your furniture',
      '<button class="btn gold" id="newPartner">Add a site</button>')}

    ${partners.length ? partners.map((p) => `
      <div class="panel">
        <h3 style="display:flex;justify-content:space-between;align-items:center;gap:14px">
          <span>${esc(p.name)}
            <span class="pill ${p.status === 'active' ? 'ok' : 'warn'}" style="vertical-align:middle;margin-left:8px">${p.status}</span></span>
          <span style="display:flex;gap:8px">
            <button class="btn small" data-edit="${p.id}">Edit</button>
            <button class="btn small" data-rotate="${p.id}" title="Issue a new key and invalidate the old one">Rotate key</button>
          </span>
        </h3>
        <div class="body">
          <div class="cards" style="margin-bottom:22px">
            <div class="stat"><div class="k">Orders</div><div class="v">${p.stats.orders}</div></div>
            <div class="stat"><div class="k">Order value</div><div class="v">${kr(p.stats.revenue)}</div></div>
            <div class="stat"><div class="k">Commission</div><div class="v gold">${kr(p.stats.commission)}</div>
              <div class="n">${pct(p.commission_rate)} of the ex-VAT value</div></div>
            <div class="stat"><div class="k">Owed now</div><div class="v">${kr(p.stats.commission_due)}</div></div>
          </div>

          <label>Paste this into their page</label>
          <div class="snippet">
            <pre>${esc(p.embedSnippet)}</pre>
            <button class="copy" data-copy="${esc(p.embedSnippet)}">Copy</button>
          </div>
          <div class="hint">
            Allowed domains: ${p.domains.length ? p.domains.map((d) => `<code>${esc(d)}</code>`).join(' ') :
              '<strong>any site</strong> — add domains to lock the key down'}<br>
            Their commission dashboard: <a href="/partner/?key=${esc(p.portal_key)}" target="_blank" rel="noopener">open</a>
            · Catalogue: ${p.catalogue === 'all' ? 'everything' : `${p.catalogue.length} selected pieces`}
          </div>
        </div>
      </div>`).join('')
      : `<div class="panel"><div class="empty">
           No partner sites yet. Add one and you get a snippet they paste into their page —
           their visitors then buy your furniture without leaving their site.
         </div></div>`}`);

  document.getElementById('newPartner').addEventListener('click', () => partnerModal(null));
  on('[data-edit]', 'click', (event) =>
    partnerModal(partners.find((p) => p.id === Number(event.target.dataset.edit))));
  on('[data-rotate]', 'click', async (event) => {
    if (!confirm('Issue a new embed key? Their current snippet stops working until they update it.')) return;
    await api(`/partners/${event.target.dataset.rotate}/rotate-key`, { method: 'POST' });
    toast('New key issued — send them the new snippet');
    partnersView();
  });
  on('[data-copy]', 'click', (event) => {
    navigator.clipboard.writeText(event.target.dataset.copy).then(() => toast('Snippet copied'));
  });
}

async function partnerModal(partner) {
  const isNew = !partner;
  const { products } = await api('/products');
  const p = partner || {
    name: '', contact_name: '', email: '', phone: '', country: 'DK', domains: [],
    commission_rate: 0.15, catalogue: 'all', locale: 'da', currency: 'DKK', status: 'active', notes: '',
    theme: '{}',
  };
  const theme = (() => { try { return JSON.parse(p.theme || '{}'); } catch { return {}; } })();
  const chosen = p.catalogue === 'all' ? null : p.catalogue.map(Number);

  openModal(isNew ? 'Add a partner site' : p.name, `
    <div class="grid2">
      <div class="field"><label>Site / company name</label><input id="p_name" value="${esc(p.name)}"></div>
      <div class="field"><label>Contact person</label><input id="p_contact_name" value="${esc(p.contact_name)}"></div>
    </div>
    <div class="grid3">
      <div class="field"><label>Email</label><input id="p_email" type="email" value="${esc(p.email)}"></div>
      <div class="field"><label>Phone</label><input id="p_phone" value="${esc(p.phone)}"></div>
      <div class="field"><label>Country</label><input id="p_country" maxlength="2" value="${esc(p.country)}"></div>
    </div>
    <div class="field"><label>Allowed domains (one per line)</label>
      <textarea id="p_domains" placeholder="studio.dk&#10;*.studio.dk">${esc(p.domains.join('\n'))}</textarea>
      <div class="hint">The embed key only works on these domains. Use <code>*.example.com</code> to cover subdomains.
        Leave empty and the key works anywhere — fine while testing, risky in the wild.</div></div>
    <div class="grid3">
      <div class="field"><label>Commission %</label>
        <input id="p_commission" type="number" step="0.5" value="${(p.commission_rate * 100).toFixed(1)}"></div>
      <div class="field"><label>Language</label><select id="p_locale">
        ${['da', 'en'].map((l) => `<option value="${l}"${l === p.locale ? ' selected' : ''}>${l === 'da' ? 'Dansk' : 'English'}</option>`).join('')}</select></div>
      <div class="field"><label>Shown currency</label><select id="p_currency">
        ${['DKK', 'EUR', 'GBP', 'USD', 'SEK', 'NOK'].map((c) =>
          `<option${c === p.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Accent colour on their site</label>
        <input id="p_accent" value="${esc(theme.accent || '')}" placeholder="#c8a96e"></div>
      <div class="field"><label>Status</label><select id="p_status">
        ${['active', 'paused', 'archived'].map((s) =>
          `<option${s === p.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>What they may sell</label>
      <label style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink);display:flex;gap:9px;align-items:center;margin-bottom:12px">
        <input type="checkbox" id="p_all" ${chosen ? '' : 'checked'} style="width:auto"> Everything in the catalogue</label>
      <div id="p_pieces" style="display:${chosen ? 'block' : 'none'}">
        ${products.map((prod) => `
          <label style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink);display:flex;gap:9px;align-items:center;margin-bottom:7px">
            <input type="checkbox" class="p_piece" value="${prod.id}"
              ${chosen && chosen.includes(prod.id) ? 'checked' : ''} style="width:auto">
            ${esc(prod.name_da)} <span class="hint" style="margin:0">${kr(prod.base_price)}</span></label>`).join('')}
      </div></div>
    <div class="field"><label>Notes</label><textarea id="p_notes">${esc(p.notes)}</textarea></div>
  `, async () => {
    const all = document.getElementById('p_all').checked;
    const body = {
      name: value('p_name'), contact_name: value('p_contact_name'), email: value('p_email'),
      phone: value('p_phone'), country: value('p_country').toUpperCase() || 'DK',
      domains: value('p_domains'),
      commission_rate: Number(value('p_commission')) / 100,
      locale: value('p_locale'), currency: value('p_currency'), status: value('p_status'),
      notes: value('p_notes'),
      theme: value('p_accent') ? { accent: value('p_accent') } : {},
      catalogue: all ? 'all' : [...document.querySelectorAll('.p_piece:checked')].map((n) => Number(n.value)),
    };
    if (isNew) await api('/partners', { method: 'POST', body });
    else await api(`/partners/${p.id}`, { method: 'PATCH', body });
    toast(isNew ? 'Partner added — send them the snippet' : 'Partner saved');
    partnersView();
  });

  document.getElementById('p_all').addEventListener('change', (event) => {
    document.getElementById('p_pieces').style.display = event.target.checked ? 'none' : 'block';
  });
}

// ------------------------------------------------------------------ payouts
async function payoutsView() {
  const { payouts } = await api('/payouts');
  const due = payouts.reduce((sum, p) => sum + p.due, 0);
  shell(`
    ${head('Commission', 'What your partners have earned')}
    <div class="cards">
      <div class="stat"><div class="k">Owed right now</div><div class="v gold">${kr(due)}</div>
        <div class="n">Across ${payouts.filter((p) => p.due > 0).length} partner(s)</div></div>
      <div class="stat"><div class="k">Already settled</div>
        <div class="v">${kr(payouts.reduce((sum, p) => sum + p.paid, 0))}</div></div>
    </div>
    <div class="panel"><div class="wrap">
      ${payouts.length ? `<table>
        <thead><tr><th>Partner</th><th>Email</th><th class="num">Orders owed</th>
          <th class="num">Owed</th><th class="num">Settled</th><th></th></tr></thead>
        <tbody>${payouts.map((p) => `<tr>
          <td>${esc(p.name)}</td><td>${esc(p.email || '—')}</td>
          <td class="num">${p.due_orders}</td>
          <td class="num"><strong>${kr(p.due)}</strong></td>
          <td class="num">${kr(p.paid)}</td>
          <td class="num">${p.due > 0 ? `<button class="btn small" data-settle="${p.id}">Mark paid</button>` : ''}</td>
        </tr>`).join('')}</tbody></table>`
        : `<div class="empty">Nothing owed yet. Commission becomes payable once a customer's deposit clears.</div>`}
    </div></div>
    <p class="hint">Commission is calculated on the ex-VAT order value and turns payable the moment
      an order reaches deposit paid. Marking it paid here only records that you have transferred the money.</p>`);

  on('[data-settle]', 'click', async (event) => {
    if (!confirm('Record this commission as transferred?')) return;
    await api('/payouts/settle', { method: 'POST', body: { partnerId: Number(event.target.dataset.settle) } });
    toast('Recorded as paid');
    payoutsView();
  });
}

// ------------------------------------------------------------------- outbox
async function outboxView() {
  const { mail, relayConfigured } = await api('/outbox');
  shell(`
    ${head('Mail', relayConfigured ? 'Relayed through your provider' : 'Queued in the app',
      relayConfigured ? '<button class="btn small" id="retry">Retry failed</button>' : '')}
    ${relayConfigured ? '' : `<div class="msg ok">No mail relay configured, so nothing is actually sent yet —
      every message is kept here in full. Set <code>MAIL_WEBHOOK_URL</code> in <code>.env</code> to start delivering.</div>`}
    <div class="panel"><div class="wrap">
      ${mail.length ? `<table>
        <thead><tr><th>To</th><th>Subject</th><th>Status</th><th>Date</th><th></th></tr></thead>
        <tbody>${mail.map((m) => `<tr>
          <td>${esc(m.to_email)}</td><td>${esc(m.subject)}</td>
          <td><span class="pill ${m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'warn' : ''}">${m.status}</span>
            ${m.error ? `<div class="hint">${esc(m.error)}</div>` : ''}</td>
          <td>${date(m.created_at)}</td>
          <td class="num"><button class="btn small" data-mail="${m.id}">Read</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No mail yet.</div>'}
    </div></div>`);

  on('[data-mail]', 'click', (event) => {
    const message = mail.find((m) => m.id === Number(event.target.dataset.mail));
    openModal(message.subject, `<p class="hint">To ${esc(message.to_email)}</p><pre>${esc(message.body)}</pre>`);
  });
  const retry = document.getElementById('retry');
  if (retry) retry.addEventListener('click', async () => {
    await api('/outbox/retry', { method: 'POST' });
    toast('Retrying');
    setTimeout(outboxView, 700);
  });
}

// ----------------------------------------------------------------- settings
async function settingsView() {
  const { settings } = await api('/settings');
  shell(`
    ${head('Settings', 'How the shop behaves')}
    <div class="panel"><h3>Commerce</h3><div class="body">
      <table>
        <tbody>
          <tr><td>Public URL</td><td><code>${esc(settings.publicUrl)}</code></td></tr>
          <tr><td>Danish VAT</td><td>${pct(settings.vatRate)} — included in every listed price</td></tr>
          <tr><td>Default commission</td><td>${pct(settings.defaultCommissionRate)} of the ex-VAT order value</td></tr>
          <tr><td>Default deposit</td><td>${pct(settings.defaultDepositPct)} up front</td></tr>
          <tr><td>Card payments</td><td>${settings.stripeConfigured
            ? '<span class="pill ok">Stripe connected</span>'
            : '<span class="pill">Invoice only — set STRIPE_SECRET_KEY to take cards</span>'}</td></tr>
          <tr><td>Mail delivery</td><td>${settings.mailRelayConfigured
            ? '<span class="pill ok">Relay configured</span>'
            : '<span class="pill">Queued in-app — set MAIL_WEBHOOK_URL to send</span>'}</td></tr>
        </tbody>
      </table>
      <p class="hint" style="margin-top:18px">These come from <code>app/.env</code>. Restart the app after editing it.</p>
    </div></div>

    <div class="panel"><h3>Change your password</h3><div class="body">
      <div class="grid2">
        <div class="field"><label>Current password</label><input id="s_current" type="password"></div>
        <div class="field"><label>New password (10+ characters)</label><input id="s_next" type="password"></div>
      </div>
      <button class="btn gold" id="changePw">Change password</button>
      <p class="hint">Changing it signs you out everywhere.</p>
    </div></div>`);

  document.getElementById('changePw').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      await api('/password', {
        method: 'POST',
        body: { current: value('s_current'), next: value('s_next') },
      });
      toast('Password changed — sign in again');
      state.admin = null;
      setTimeout(render, 900);
    } catch (err) {
      toast(err.message, 'err');
      event.target.disabled = false;
    }
  });
}

// ------------------------------------------------------------------- modals
function openModal(title, bodyHtml, onSave) {
  document.querySelectorAll('.scrim').forEach((n) => n.remove());
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `
    <div class="modal">
      <header><h3>${esc(title)}</h3><button class="x" data-close>✕</button></header>
      <div class="body">${bodyHtml}</div>
      ${onSave ? `<footer>
        <button class="btn" data-close>Cancel</button>
        <button class="btn gold" data-save>Save</button></footer>` : ''}
    </div>`;
  document.body.appendChild(scrim);
  document.documentElement.style.overflow = 'hidden';

  const close = () => {
    scrim.remove();
    document.documentElement.style.overflow = '';
  };
  on('[data-close]', 'click', close, scrim);
  scrim.addEventListener('click', (event) => { if (event.target === scrim) close(); });
  document.addEventListener('keydown', function esc(event) {
    if (event.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  if (onSave) {
    scrim.querySelector('[data-save]').addEventListener('click', async (event) => {
      event.target.disabled = true;
      try {
        await onSave();
        close();
      } catch (err) {
        toast(err.message, 'err');
        event.target.disabled = false;
      }
    });
  }
  return scrim;
}

// -------------------------------------------------------------------- route
const ROUTES = {
  dashboard, orders: ordersView, products: productsView,
  partners: partnersView, payouts: payoutsView, outbox: outboxView, settings: settingsView,
};

async function render() {
  if (!state.admin) {
    try {
      const { admin } = await api('/me');
      state.admin = admin;
    } catch { /* not signed in */ }
  }
  if (!state.admin) return loginView();

  const [view, param] = (location.hash.slice(1) || 'dashboard').split('/');
  state.view = ROUTES[view] ? view : 'dashboard';
  try {
    await ROUTES[state.view](param ? decodeURIComponent(param) : undefined);
  } catch (err) {
    shell(`${head('Something broke', 'Error')}<div class="msg err">${esc(err.message)}</div>`);
  }
}

window.addEventListener('hashchange', render);
render();
