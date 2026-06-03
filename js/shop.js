// ── PRODUCT GRID ──
function renderGrid() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const visible = products.filter(productMatchesActiveFilters);
  const totalLabel = visible.length === products.length
    ? `${products.length} item${products.length !== 1 ? 's' : ''}`
    : `${visible.length} of ${products.length} items`;
  document.getElementById('item-count').textContent = totalLabel;

  if (!visible.length && products.length) {
    grid.innerHTML = `<div class="shop-filter-empty" style="grid-column:1/-1;text-align:center;padding:2rem;">No items match these filters. <a onclick="clearShopFilters()" style="color:var(--accent);cursor:pointer;text-decoration:underline;">Clear filters</a></div>`;
    return;
  }
  grid.innerHTML = visible.map(p => `
    <div class="card" data-id="${p.id}">
      <div class="card-image-wrap">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80'" />
        ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
        <button class="quick-add" onclick="event.stopPropagation(); addToCart(${p.id}, this)" ${p.qty != null && p.qty <= 0 ? 'disabled style="opacity:0.4;cursor:not-allowed;background:#999"' : ''}>+ Add to Cart</button>
      </div>
      <div class="admin-qty-strip">
        <span class="qty-label">Stock</span>
        <span class="qty-value ${p.maxQty !== null ? (p.qty === 0 ? 'out' : (p.qty / p.maxQty < 0.3 ? 'low' : 'ok')) : 'ok'}">${p.qty !== undefined ? p.qty : '—'}</span>
        ${p.maxQty ? `<span class="qty-divider">/</span><span class="qty-max">max ${p.maxQty}</span>` : ''}
      </div>
      ${p.qty != null ? `<span class="stock-badge ${p.qty === 0 ? 'out' : p.qty <= 2 ? 'low' : ''}">
        ${p.qty === 0 ? 'Out of stock' : 'Stock: ' + p.qty}
      </span>` : ''}
      <div class="card-admin-controls">
        <button class="edit-btn" onclick="event.stopPropagation(); openProductModal(${p.id})">Edit</button>
        <button class="delete-btn" onclick="event.stopPropagation(); deleteProduct(${p.id})">Delete</button>
      </div>
      <div class="card-body">
        <span class="card-category">${esc(p.category)}</span>
        <h3 class="card-name">${esc(p.name)}</h3>
        <p class="card-desc">${esc(p.desc)}</p>
        <div class="card-footer">
          <div class="price">${p.original ? `<span class="original">$${p.original}</span>` : ''}$${p.price}</div>
          ${p.condition ? `<span class="cond-pill">${esc(p.condition)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// ── CART ──
let cart = [];

function saveCart() { try { localStorage.setItem('pouches-cart', JSON.stringify(cart)); } catch(e) {} }

function addToCart(productId, btnEl) {
  const p = products.find(x => x.id === productId);
  if (!p) return;
  if (p.qty !== undefined && p.qty !== null && p.qty <= 0) return;
  const existing = cart.find(c => c.id === productId);
  if (existing) {
    if (p.qty !== undefined && p.qty !== null && existing.qty >= p.qty) return;
    existing.qty++;
  } else {
    cart.push({ id: p.id, name: p.name, price: p.price, img: p.img, qty: 1 });
  }
  saveCart();
  updateCartBtn();
  if (btnEl) { btnEl.classList.remove('added'); void btnEl.offsetWidth; btnEl.classList.add('added'); }
}

function updateCartBtn() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const btn = document.getElementById('cart-btn');
  if (btn) btn.textContent = `Cart (${count})`;
  const mobileBar = document.getElementById('mobile-cart-bar');
  const mobileCount = document.getElementById('mobile-cart-count');
  const mobileTotal = document.getElementById('mobile-cart-total');
  if (mobileCount) mobileCount.textContent = count === 0 ? 'Cart is empty' : `${count} item${count !== 1 ? 's' : ''}`;
  if (mobileTotal) mobileTotal.textContent = `$${total.toFixed(2)}`;
  if (mobileBar) mobileBar.style.display = count > 0 ? 'flex' : '';
}

function changeCartQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  const p = products.find(x => x.id === id);
  if (delta > 0 && p && p.qty !== undefined && p.qty !== null && item.qty >= p.qty) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(c => c.id !== id);
  saveCart();
  updateCartBtn();
  renderCartModal();
}

function syncCartWithStock() {
  if (!cart.length) return;
  const removed = [], adjusted = [];
  cart = cart.filter(item => {
    const product = products.find(p => p.id === item.id);
    if (!product) { removed.push(item.name); return false; }
    if (product.qty != null && product.qty <= 0) { removed.push(item.name); return false; }
    if (product.qty != null && item.qty > product.qty) {
      adjusted.push({ name: item.name, was: item.qty, now: product.qty });
      item.qty = product.qty;
    }
    return true;
  });
  if (!removed.length && !adjusted.length) return;
  saveCart(); updateCartBtn();
  const cartModal = document.getElementById('cart-modal');
  if (cartModal && cartModal.classList.contains('open')) renderCartModal();
  const msgs = [];
  if (removed.length) msgs.push(removed.join(', ') + (removed.length === 1 ? ' sold out and was' : ' sold out and were') + ' removed from your cart');
  if (adjusted.length) msgs.push(adjusted.map(a => `${a.name} reduced to ${a.now} (only ${a.now} left)`).join(', '));
  showCartNotice(msgs.join('. ') + '.');
}

function showCartNotice(msg) {
  const existing = document.getElementById('cart-notice');
  if (existing) existing.remove();
  const notice = document.createElement('div');
  notice.id = 'cart-notice';
  notice.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:900;background:#1a1612;color:#faf8f4;padding:0.75rem 1.2rem;border-radius:8px;font-family:"DM Sans",sans-serif;font-size:0.88rem;max-width:380px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,0.3);border-left:4px solid #ef4444;animation:toastIn 0.3s ease;line-height:1.5;';
  notice.textContent = msg;
  document.body.appendChild(notice);
  setTimeout(() => { notice.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => notice.remove(), 300); }, 5000);
}

function openCartModal() {
  syncCartWithStock();
  renderCartModal();
  openModal('cart-modal');
}

function fmt12Short(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function formatFreeTime(val) {
  if (!val) return '';
  const [h, m] = val.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function renderCartModal() {
  const body = document.getElementById('cart-modal-body');
  if (!body) return;
  if (cart.length === 0) {
    body.innerHTML = `<div class="cart-section"><div class="cart-empty">Your cart is empty.<br>Add some items to get started.</div></div>`;
    return;
  }
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0).toFixed(2);
  const today = new Date().toISOString().split('T')[0];
  const todayInfo = getDayInfo(today);
  const isOpenToday = todayInfo.open;
  const hoursNote = isOpenToday ? `Today's hours: ${fmt12Short(todayInfo.start)} – ${fmt12Short(todayInfo.end)}` : 'Closed today';

  body.innerHTML = `
    <div class="cart-section">
      <div class="cart-section-title">Order Summary</div>
      <div class="cart-items">
        ${cart.map(c => `
          <div class="cart-item">
            <img class="cart-item-img" src="${esc(c.img)}" onerror="this.src='https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=60&q=60'" />
            <div class="cart-item-info">
              <div class="cart-item-name">${esc(c.name)}</div>
              <div class="cart-item-meta">$${c.price.toFixed(2)} each</div>
            </div>
            <div class="cart-item-qty">
              <button class="qty-btn" onclick="changeCartQty(${c.id}, -1)">−</button>
              <span class="qty-num">${c.qty}</span>
              <button class="qty-btn" onclick="changeCartQty(${c.id}, 1)">+</button>
            </div>
            <div class="cart-item-price">$${(c.price * c.qty).toFixed(2)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="cart-section">
      <div class="cart-total-row">
        <span class="cart-total-label">Total</span>
        <span class="cart-total-price">$${total}</span>
      </div>
    </div>
    <div class="cart-section">
      <div class="cart-section-title">Pickup Details</div>
      <div class="pickup-grid">
        <div class="cart-field full">
          <label>Vehicle Make &amp; Model</label>
          <input type="text" id="pickup-vehicle" placeholder="e.g. Toyota Camry" oninput="clearErr(this)" />
          <span class="field-error-msg">Please enter your vehicle make & model</span>
        </div>
        <div class="cart-field full">
          <label>License Plate</label>
          <input type="text" id="pickup-plate" placeholder="e.g. ABC 123" style="text-transform:uppercase" oninput="clearErr(this)" />
          <span class="field-error-msg">Please enter your license plate</span>
        </div>
        <div class="cart-field full">
          <label>Pickup Time</label>
          <div class="time-hours-note">${hoursNote}</div>
          ${isOpenToday ? `
          <div class="slot-grid" id="time-slot-grid">
            <div class="slot-chip pickup-now-btn" onclick="selectPickupNow()" id="pickup-now-chip">🕐 Pick Up Now</div>
            <div class="slot-chip choose-time-btn" onclick="toggleCustomTime()" id="choose-time-chip">🕑 Choose a Time</div>
            <div class="custom-time-wrap" id="custom-time-wrap" style="display:none; grid-column:1/-1;">
              <input type="time" id="free-time-input" min="${todayInfo.start}" max="${todayInfo.end}"
                oninput="handleCustomTime(this.value, '${todayInfo.start}', '${todayInfo.end}')" />
              <div class="custom-time-error" id="custom-time-error"></div>
            </div>
          </div>
          <span class="field-error-msg" id="time-error-msg" style="display:none;color:#dc2626;font-size:.72rem;">Please select a pickup time</span>
          ` : `<div class="no-slots-msg">We're closed today — check back during open hours.</div>`}
        </div>
      </div>
    </div>
    ${isOpenToday ? `
    <div class="cart-section">
      <button class="btn-primary" style="width:100%;padding:.8rem;font-size:.9rem" onclick="placeOrder()">Place Order</button>
    </div>` : ''}`;
  selectedTime = null;
}

let selectedTime = null;

function selectPickupNow() {
  const today = new Date().toISOString().split('T')[0];
  const info = getDayInfo(today);
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = parseHHMM(info.start);
  const closeMins = parseHHMM(info.end);
  if (nowMins < openMins || nowMins >= closeMins) {
    selectedTime = fmt12Short(info.start);
  } else {
    const h = now.getHours(), m = now.getMinutes();
    selectedTime = `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  const errMsg = document.getElementById('time-error-msg');
  if (errMsg) errMsg.style.display = 'none';
  document.getElementById('pickup-now-chip').classList.add('selected');
  const chooseBtn = document.getElementById('choose-time-chip');
  if (chooseBtn) chooseBtn.classList.remove('selected');
  const customWrap = document.getElementById('custom-time-wrap');
  if (customWrap) customWrap.style.display = 'none';
}

function toggleCustomTime() {
  const wrap = document.getElementById('custom-time-wrap');
  const btn = document.getElementById('choose-time-chip');
  const isOpen = wrap.style.display !== 'none';
  wrap.style.display = isOpen ? 'none' : 'block';
  btn.classList.toggle('selected', !isOpen);
  if (!isOpen) {
    document.getElementById('pickup-now-chip').classList.remove('selected');
    selectedTime = null;
    document.getElementById('free-time-input').focus();
  }
}

function handleCustomTime(val, openTime, closeTime) {
  const errEl = document.getElementById('custom-time-error');
  if (!val) { errEl.textContent = ''; selectedTime = null; return; }
  const [h, m] = val.split(':').map(Number);
  const mins = h * 60 + m;
  if (mins < parseHHMM(openTime) || mins >= parseHHMM(closeTime)) {
    errEl.textContent = `Must be between ${fmt12Short(openTime)} and ${fmt12Short(closeTime)}`;
    selectedTime = null; return;
  }
  errEl.textContent = '';
  selectedTime = formatFreeTime(val);
  const errMsg = document.getElementById('time-error-msg');
  if (errMsg) errMsg.style.display = 'none';
  document.getElementById('pickup-now-chip').classList.remove('selected');
}

function markErr(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('field-error');
  if (el.previousElementSibling && el.previousElementSibling.tagName === 'LABEL') el.previousElementSibling.classList.add('field-error');
}
function clearErr(el) {
  el.classList.remove('field-error');
  if (el.previousElementSibling) el.previousElementSibling.classList.remove('field-error');
}

async function placeOrder() {
  const vehicle = document.getElementById('pickup-vehicle').value.trim();
  const plate = document.getElementById('pickup-plate').value.trim();
  const date = new Date().toISOString().split('T')[0];
  const time = selectedTime;
  let hasError = false;
  if (!vehicle) { markErr('pickup-vehicle'); hasError = true; }
  if (!plate)   { markErr('pickup-plate');   hasError = true; }
  if (!time)    { const el = document.getElementById('time-error-msg'); if (el) el.style.display = 'block'; hasError = true; }
  if (hasError) return;

  const [yr, mo, dy] = date.split('-').map(Number);
  const pickupDateObj = new Date(yr, mo - 1, dy);
  const datePart = pickupDateObj.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
  const dateStr = datePart + ' at ' + time;
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0).toFixed(2);
  const orderItems = [...cart];

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: orderItems, vehicle, plate, dateStr })
    });
    const data = await res.json();
    if (!res.ok) { alert('Could not place order:\n' + (data.details ? data.details.join('\n') : (data.error || 'Order failed'))); return; }
  } catch(e) { alert('Network error — please try again.'); return; }

  closeModal('cart-modal');
  cart = []; saveCart(); updateCartBtn();

  document.getElementById('confirm-left-body').innerHTML = `
    <div class="confirm-check">✅</div>
    <div class="confirm-title">Order Placed!</div>
    <div class="confirm-subtitle">We'll have everything ready for your pickup.</div>
    <div class="confirm-detail-box">
      <div class="confirm-detail-row"><span class="confirm-detail-label">Date & Time</span><span class="confirm-detail-val">${esc(dateStr)}</span></div>
      <div class="confirm-detail-row"><span class="confirm-detail-label">Vehicle</span><span class="confirm-detail-val">${esc(vehicle)}</span></div>
      <div class="confirm-detail-row"><span class="confirm-detail-label">Plate</span><span class="confirm-detail-val">${esc(plate).toUpperCase()}</span></div>
    </div>
    <div class="confirm-detail-box">
      <div class="confirm-items-list">
        ${orderItems.map(c => `<div class="confirm-item-row"><span><strong>${esc(c.name)}</strong> × ${c.qty}</span><span>$${(c.price * c.qty).toFixed(2)}</span></div>`).join('')}
        <div class="confirm-total-row"><span>Total</span><span>$${total}</span></div>
      </div>
    </div>
    <button class="btn-primary" style="width:100%;margin-top:auto" onclick="closeConfirm()">Done</button>
  `;

  document.getElementById('confirm-right-title').textContent = pickupInstructions.title || 'Pickup Instructions';
  const pi = pickupInstructions;
  document.getElementById('confirm-right-body').innerHTML = pi.text || pi.img
    ? `${pi.img ? `<img class="instr-panel-img" src="${esc(pi.img)}" onerror="this.style.display='none'" />` : ''}
       ${pi.text ? `<div class="instr-panel-text">${esc(pi.text)}</div>` : ''}`
    : `<div class="instr-placeholder">No pickup instructions set yet.</div>`;

  document.getElementById('confirm-overlay').classList.add('open');
}

function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); }

// ── PAGE INIT ──
async function initShop() {
  // index.html is customer-only — never activate admin mode here
  adminToken = null;
  isAdmin = false;

  renderHero(); renderGrid(); renderSlider();
  await loadData();
  applySiteSettings(); renderHero(); renderGrid(); renderSlider();
  updateCartBtn(); connectSSE();

  const confirmOverlay = document.getElementById('confirm-overlay');
  if (confirmOverlay) {
    confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) closeConfirm(); });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.admin-gate')) return;
  initShop();
});
