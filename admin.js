// ── ADMIN STATE ──
let adminOrders = [];
let orderFilter = 'all';
let orderSearchQuery = '';
let newOrderCount = 0;
let finPeriod = 'all';
let editingId = null;
let filtersEditing = [];
let editingSlides = [];
let tempSchedule = null;
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
let calSelectedDate = null;
let heroEditFill = '';

// ── ORDERS ──
function openOrders() {
  newOrderCount = 0; updateOrdersBadge();
  document.getElementById('orders-overlay').classList.add('open');
  document.getElementById('orders-search-input').value = orderSearchQuery;
  renderOrders();
}
function closeOrders() { document.getElementById('orders-overlay').classList.remove('open'); }

function setOrderFilter(filter) {
  orderFilter = filter;
  document.querySelectorAll('.orders-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
  renderOrders();
}
function onOrderSearch(val) { orderSearchQuery = val.toLowerCase().trim(); renderOrders(); }

function renderOrders() {
  const list = document.getElementById('orders-list');
  const counts = { all: adminOrders.length, new: 0, ready: 0, 'picked-up': 0, cancelled: 0 };
  adminOrders.forEach(o => { const s = o.status || 'new'; if (counts[s] !== undefined) counts[s]++; });
  ['all','new','ready','picked-up','cancelled'].forEach(k => {
    const el = document.getElementById('tab-count-' + k);
    if (el) el.textContent = counts[k] || '';
  });
  let filtered = orderFilter !== 'all' ? adminOrders.filter(o => (o.status || 'new') === orderFilter) : adminOrders;
  if (orderSearchQuery) {
    filtered = filtered.filter(o => {
      const searchable = [o.vehicle, o.plate, o.dateStr, o.total, o.status, o.createdAt, String(o.id), ...o.items.map(i => i.name)].join(' ').toLowerCase();
      return searchable.includes(orderSearchQuery);
    });
  }
  filtered = [...filtered].sort((a, b) => b.id - a.id);
  if (!filtered.length) {
    const label = orderSearchQuery ? 'matching' : (orderFilter === 'all' ? '' : orderFilter);
    list.innerHTML = `<div class="orders-empty">No ${label} orders found.</div>`;
    return;
  }
  list.innerHTML = filtered.map(o => {
    const status = o.status || 'new';
    const statusLabel = status === 'picked-up' ? 'Picked Up' : status.charAt(0).toUpperCase() + status.slice(1);
    const time = new Date(o.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const items = o.items.map(i => `<div class="item-line"><span>${esc(i.name)} × ${i.qty}</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`).join('');
    let actions = '';
    if (status === 'picked-up') {
      actions = `<button class="order-action-btn" onclick="updateOrderStatus(${o.id}, 'new')" style="font-size:.7rem;color:var(--muted)">Reopen</button>`;
    } else if (status === 'cancelled') {
      actions = `<div style="font-size:.7rem;color:var(--muted);text-align:center;width:100%">Cancelled${o.cancelledAt ? ' · ' + new Date(o.cancelledAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : ''}</div>`;
    } else {
      const stepBtn = status === 'ready'
        ? `<button class="order-action-btn" onclick="updateOrderStatus(${o.id}, 'new')">Back to New</button>`
        : `<button class="order-action-btn primary" onclick="updateOrderStatus(${o.id}, 'ready')">Mark Ready</button>`;
      actions = `${stepBtn}
        <button class="order-action-btn success" onclick="updateOrderStatus(${o.id}, 'picked-up')">Finished</button>
        <button class="order-action-btn danger" onclick="revertOrder(${o.id})">Cancel</button>`;
    }
    return `
      <div class="${status === 'cancelled' ? 'order-card cancelled-card' : 'order-card'}" id="order-${o.id}">
        <div class="order-card-header">
          <span class="order-id">#${String(o.id).slice(-6)}</span>
          <span class="order-status-badge ${esc(status)}">${esc(statusLabel)}</span>
          <span class="order-time">${time}</span>
        </div>
        <div class="order-card-body">
          <div class="order-items-list">${items}</div>
          <div class="order-total-row"><span>Total</span><span>$${esc(o.total)}</span></div>
          <div style="margin-top:.5rem;">
            <div class="order-detail-row"><span class="order-detail-label">Pickup</span><span class="order-detail-val">${esc(o.dateStr)}</span></div>
            <div class="order-detail-row"><span class="order-detail-label">Vehicle</span><span class="order-detail-val">${esc(o.vehicle)}</span></div>
            <div class="order-detail-row"><span class="order-detail-label">Plate</span><span class="order-detail-val">${esc(o.plate).toUpperCase()}</span></div>
          </div>
        </div>
        <div class="order-card-actions">${actions}</div>
      </div>`;
  }).join('');
}

async function updateOrderStatus(id, status) {
  try {
    const res = await fetch(`/api/orders/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status }) });
    if (res.status === 401) return handleAuthFailure();
    if (!res.ok) { const data = await res.json().catch(()=>({})); alert('Failed: ' + (data.error || res.status)); }
  } catch(e) { alert('Network error updating order'); }
}

async function revertOrder(id) {
  if (!confirm('Cancel this order and restore the inventory?')) return;
  try {
    const res = await fetch(`/api/orders/${id}/revert`, { method: 'POST', headers: authHeaders() });
    if (res.status === 401) return handleAuthFailure();
    const data = await res.json().catch(()=>({}));
    if (!res.ok) alert('Failed: ' + (data.error || 'Unknown error'));
  } catch(e) { alert('Network error'); }
}

function updateOrdersBadge() {
  const badge = document.getElementById('orders-badge');
  if (badge) badge.textContent = newOrderCount > 0 ? newOrderCount : '';
}

function handleNewOrder(order) {
  if (!isAdmin) return;
  const itemSummary = order.items.map(i => `${esc(i.name)} ×${i.qty}`).join(', ');
  showToast(`🛍 New Order — $${esc(order.total)}`, `${itemSummary} · ${esc(order.vehicle)} · ${esc(order.plate).toUpperCase()}`);
  playNotificationBeep();
  newOrderCount++; updateOrdersBadge();
  const panel = document.getElementById('orders-overlay');
  if (panel && panel.classList.contains('open')) {
    renderOrders();
    setTimeout(() => { const card = document.getElementById('order-' + order.id); if (card) card.classList.add('highlight'); }, 100);
  }
}

// ── FINANCIALS ──
function openFinancials() { document.getElementById('fin-overlay').classList.add('open'); renderFinancials(); }
function closeFinancials() { document.getElementById('fin-overlay').classList.remove('open'); }

async function resetFinancials() {
  if (!confirm('Reset all financial data? This cannot be undone.')) return;
  if (!confirm('Last chance — erase every order. Continue?')) return;
  try {
    const res = await fetch('/api/orders', { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) { alert('Failed to reset financials.'); return; }
    adminOrders = []; renderFinancials(); renderOrders(); updateOrdersBadge();
    showToast('Reset Complete', 'All order and financial data has been cleared.');
  } catch(e) { alert('Network error — could not reset.'); }
}

function setFinPeriod(period) {
  finPeriod = period;
  document.querySelectorAll('.fin-period-tab').forEach(t => t.classList.toggle('active', t.dataset.period === period));
  renderFinancials();
}

function getFilteredOrders() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return adminOrders.filter(o => {
    if (o.status === 'cancelled') return false;
    if (finPeriod === 'all') return true;
    const d = new Date(o.createdAt);
    if (finPeriod === 'today') return d >= today;
    if (finPeriod === 'week') return d >= weekStart;
    if (finPeriod === 'month') return d >= monthStart;
    return true;
  });
}

function renderFinancials() {
  const body = document.getElementById('fin-body');
  const orders = getFilteredOrders();
  const cancelled = adminOrders.filter(o => o.status === 'cancelled');
  const periodLabel = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month' }[finPeriod];
  const costLookup = {};
  products.forEach(p => { costLookup[p.id] = parseFloat(p.cost) || 0; costLookup[p.name] = parseFloat(p.cost) || 0; });
  function itemCost(i) {
    if (i.cost != null && i.cost !== '') return parseFloat(i.cost) || 0;
    return costLookup[i.id] ?? costLookup[i.name] ?? 0;
  }
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total), 0);
  const totalOrders = orders.length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItems = orders.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.qty, 0), 0);
  const totalCost = orders.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + itemCost(i) * i.qty, 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const cancelledRevenue = cancelled.reduce((s, o) => s + parseFloat(o.total), 0);
  const productMap = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!productMap[i.name]) productMap[i.name] = { name: i.name, qty: 0, revenue: 0, cost: 0 };
      productMap[i.name].qty += i.qty;
      productMap[i.name].revenue += i.price * i.qty;
      productMap[i.name].cost += itemCost(i) * i.qty;
    });
  });
  const productList = Object.values(productMap).map(p => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = productList.length ? productList[0].revenue : 0;
  const statusCounts = { new: 0, ready: 0, 'picked-up': 0 };
  orders.forEach(o => { const s = o.status || 'new'; if (statusCounts[s] !== undefined) statusCounts[s]++; });
  const recent = [...orders].sort((a, b) => b.id - a.id).slice(0, 10);
  const profitColor = totalProfit >= 0 ? 'color:#15803d;' : 'color:#dc2626;';

  body.innerHTML = `
    <div class="fin-stats">
      <div class="fin-stat accent"><div class="fin-stat-label">Revenue</div><div class="fin-stat-value">$${totalRevenue.toFixed(2)}</div><div class="fin-stat-sub">${periodLabel}</div></div>
      <div class="fin-stat"><div class="fin-stat-label">Profit</div><div class="fin-stat-value" style="${profitColor}">$${totalProfit.toFixed(2)}</div><div class="fin-stat-sub">${avgMargin.toFixed(1)}% margin</div></div>
      <div class="fin-stat"><div class="fin-stat-label">Cost (COGS)</div><div class="fin-stat-value">$${totalCost.toFixed(2)}</div></div>
      <div class="fin-stat"><div class="fin-stat-label">Orders</div><div class="fin-stat-value">${totalOrders}</div><div class="fin-stat-sub">${statusCounts.new} new · ${statusCounts.ready} ready · ${statusCounts['picked-up']} done</div></div>
      <div class="fin-stat"><div class="fin-stat-label">Avg Order</div><div class="fin-stat-value">$${avgOrder.toFixed(2)}</div></div>
      <div class="fin-stat"><div class="fin-stat-label">Items Sold</div><div class="fin-stat-value">${totalItems}</div></div>
      ${cancelled.length ? `<div class="fin-stat wide" style="border-color:#fee2e2;"><div class="fin-stat-label" style="color:#dc2626;">Cancelled Orders</div><div class="fin-stat-value" style="color:#dc2626;font-size:1.1rem;">${cancelled.length} orders · $${cancelledRevenue.toFixed(2)} reversed</div></div>` : ''}
    </div>
    ${productList.length ? `
    <div>
      <div class="fin-section-title">Product Breakdown</div>
      <table class="fin-table">
        <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr></thead>
        <tbody>
          ${productList.map(p => `<tr><td class="product-name">${esc(p.name)}</td><td>${p.qty}</td><td><div class="fin-bar-cell"><div class="fin-bar" style="width:${maxRevenue?(p.revenue/maxRevenue*100):0}%"></div><span style="position:relative;">$${p.revenue.toFixed(2)}</span></div></td><td>$${p.cost.toFixed(2)}</td><td style="${p.profit>=0?'color:#15803d;':'color:#dc2626;'}font-weight:600;">$${p.profit.toFixed(2)}<div style="font-size:.65rem;color:var(--muted);font-weight:400;">${p.margin.toFixed(0)}%</div></td></tr>`).join('')}
          <tr style="font-weight:700;border-top:2px solid var(--border);"><td>Total</td><td>${totalItems}</td><td>$${totalRevenue.toFixed(2)}</td><td>$${totalCost.toFixed(2)}</td><td style="${totalProfit>=0?'color:#15803d;':'color:#dc2626;'}">$${totalProfit.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </div>` : ''}
    ${recent.length ? `
    <div>
      <div class="fin-section-title">Recent Orders</div>
      <table class="fin-table">
        <thead><tr><th>Order</th><th>Items</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          ${recent.map(o => {
            const status = o.status || 'new';
            const statusLabel = status === 'picked-up' ? 'Done' : status.charAt(0).toUpperCase() + status.slice(1);
            const time = new Date(o.createdAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
            return `<tr><td style="font-size:.72rem;"><div style="font-weight:600;">#${String(o.id).slice(-6)}</div><div style="color:var(--muted);font-size:.66rem;">${time}</div></td><td style="font-size:.75rem;">${o.items.map(i=>`${i.name} ×${i.qty}`).join(', ')}</td><td><span class="order-status-badge ${status}" style="font-size:.58rem;">${statusLabel}</span></td><td>$${o.total}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<div class="orders-empty">No orders in this period.</div>'}
  `;
}

// ── SCHEDULE ──
function openHoursModal() {
  tempSchedule = JSON.parse(JSON.stringify(schedule));
  calMonth = new Date().getMonth(); calYear = new Date().getFullYear(); calSelectedDate = null;
  renderWeeklyDefaults();
  document.getElementById('sched-slot-mins').value = tempSchedule.slotMins || 0;
  renderCalendar();
  document.getElementById('day-detail').classList.remove('visible');
  openModal('hours-modal');
}

function renderWeeklyDefaults() {
  document.getElementById('weekly-defaults-row').innerHTML = DAY_SHORT.map((d, i) => `
    <div class="weekly-day">
      <span class="weekly-day-label">${d}</span>
      <div class="weekly-day-btn ${tempSchedule.weekly[i].open ? 'open' : ''}" onclick="toggleWeeklyDay(${i})">${d}</div>
    </div>`).join('');
  renderWeeklyHours();
}

function toggleWeeklyDay(i) { tempSchedule.weekly[i].open = !tempSchedule.weekly[i].open; renderWeeklyDefaults(); renderCalendar(); }

function renderWeeklyHours() {
  const editor = document.getElementById('weekly-hours-editor');
  const openDays = Object.entries(tempSchedule.weekly).filter(([_, v]) => v.open);
  if (!openDays.length) { editor.innerHTML = '<div style="font-size:.78rem;color:var(--muted);padding:.3rem 0;">No days are open.</div>'; return; }
  const groups = {};
  openDays.forEach(([i, v]) => {
    const key = `${v.start}-${v.end}`;
    if (!groups[key]) groups[key] = { start: v.start, end: v.end, days: [] };
    groups[key].days.push(parseInt(i));
  });
  editor.innerHTML = Object.values(groups).map(g => `
    <div style="margin-top:.5rem;">
      <div style="font-size:.7rem;color:var(--slate);font-weight:600;margin-bottom:.25rem;">${g.days.map(d => DAY_SHORT[d]).join(', ')}</div>
      <div class="weekly-hours-row">
        <div><label>Opens</label><input type="time" value="${g.start}" onchange="updateWeeklyHours(${JSON.stringify(g.days).replace(/"/g,'&quot;')}, 'start', this.value)" /></div>
        <div><label>Closes</label><input type="time" value="${g.end}" onchange="updateWeeklyHours(${JSON.stringify(g.days).replace(/"/g,'&quot;')}, 'end', this.value)" /></div>
      </div>
    </div>`).join('');
}

function updateWeeklyHours(dayIndices, field, value) {
  dayIndices.forEach(i => { tempSchedule.weekly[i][field] = value; }); renderCalendar();
}

function shiftCalMonth(delta) {
  calMonth += delta;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  calSelectedDate = null;
  document.getElementById('day-detail').classList.remove('visible');
  renderCalendar();
}

function renderCalendar() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent = `${MONTHS[calMonth]} ${calYear}`;
  document.getElementById('cal-weekdays').innerHTML = DAY_SHORT.map(d => `<div class="cal-weekday">${d}</div>`).join('');
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];
  let cells = [];
  for (let i = 0; i < firstDay; i++) { const d = new Date(calYear, calMonth, 0 - (firstDay - 1 - i)); cells.push({ day: d.getDate(), classes: 'other-month', dateStr: '' }); }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(calYear, calMonth, d);
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isPast = dateObj < today;
    const info = getDayInfo(dateStr, tempSchedule);
    const cls = [isPast?'past':'', dateStr===todayStr?'today':'', info.open?'open':'closed', calSelectedDate===dateStr?'selected':''].filter(Boolean).join(' ');
    const hoursLabel = info.open ? `${fmt12(info.start)}–${fmt12(info.end)}` : '';
    cells.push({ day: d, classes: cls, dateStr, hoursLabel, isPast });
  }
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - firstDay - daysInMonth + 1, classes: 'other-month', dateStr: '' });
  document.getElementById('cal-grid').innerHTML = cells.map(c => {
    if (c.classes.includes('other-month') || c.isPast) return `<div class="cal-cell ${c.classes}">${c.day}</div>`;
    return `<div class="cal-cell ${c.classes}" data-date="${c.dateStr}">${c.day}${c.hoursLabel ? `<span class="cal-hours">${c.hoursLabel}</span>` : ''}</div>`;
  }).join('');
  bindCalendarEvents();
}

let calLongPressTimer = null, calLongPressTriggered = false;
function bindCalendarEvents() {
  document.getElementById('cal-grid').querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    const dateStr = cell.dataset.date;
    cell.addEventListener('click', () => { if (calLongPressTriggered) { calLongPressTriggered = false; return; } calClickDay(dateStr); });
    cell.addEventListener('contextmenu', e => { e.preventDefault(); calRightClickDay(dateStr); });
    cell.addEventListener('touchstart', () => { calLongPressTriggered = false; calLongPressTimer = setTimeout(() => { calLongPressTriggered = true; calRightClickDay(dateStr); if (navigator.vibrate) navigator.vibrate(50); }, 500); }, { passive: true });
    cell.addEventListener('touchend', () => clearTimeout(calLongPressTimer));
    cell.addEventListener('touchmove', () => clearTimeout(calLongPressTimer));
  });
}

function calClickDay(dateStr) {
  calSelectedDate = dateStr;
  const info = getDayInfo(dateStr, tempSchedule);
  if (!info.open) {
    const dow = new Date(dateStr + 'T12:00:00').getDay();
    const defaults = tempSchedule.weekly[dow];
    if (!tempSchedule.overrides) tempSchedule.overrides = {};
    tempSchedule.overrides[dateStr] = { open: true, start: defaults.start, end: defaults.end };
  }
  renderCalendar(); showDayDetail(dateStr);
}

function calRightClickDay(dateStr) {
  calSelectedDate = dateStr;
  if (!tempSchedule.overrides) tempSchedule.overrides = {};
  tempSchedule.overrides[dateStr] = { open: false, start: '', end: '' };
  renderCalendar(); showDayDetail(dateStr);
}

function showDayDetail(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  document.getElementById('day-detail-title').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const info = getDayInfo(dateStr, tempSchedule);
  document.getElementById('day-detail-open-btn').className = info.open ? 'active-open' : '';
  document.getElementById('day-detail-closed-btn').className = !info.open ? 'active-closed' : '';
  const hoursDiv = document.getElementById('day-detail-hours');
  hoursDiv.style.display = info.open ? 'grid' : 'none';
  if (info.open) { document.getElementById('day-detail-start').value = info.start; document.getElementById('day-detail-end').value = info.end; }
  document.getElementById('day-detail').classList.add('visible');
}

function setDayOverride(isOpen) {
  if (!calSelectedDate) return;
  if (!tempSchedule.overrides) tempSchedule.overrides = {};
  const dow = new Date(calSelectedDate + 'T12:00:00').getDay();
  const defaults = tempSchedule.weekly[dow];
  tempSchedule.overrides[calSelectedDate] = { open: isOpen, start: isOpen ? (defaults.start || '09:00') : '', end: isOpen ? (defaults.end || '17:00') : '' };
  renderCalendar(); showDayDetail(calSelectedDate);
}

function clearDayOverride() {
  if (!calSelectedDate) return;
  if (tempSchedule.overrides) delete tempSchedule.overrides[calSelectedDate];
  renderCalendar(); showDayDetail(calSelectedDate);
}

function updateDayOverrideHours() {
  if (!calSelectedDate) return;
  if (!tempSchedule.overrides) tempSchedule.overrides = {};
  const existing = tempSchedule.overrides[calSelectedDate] || { open: true };
  existing.start = document.getElementById('day-detail-start').value;
  existing.end = document.getElementById('day-detail-end').value;
  existing.open = true;
  tempSchedule.overrides[calSelectedDate] = existing;
  renderCalendar();
}

function saveSchedule() {
  tempSchedule.slotMins = parseInt(document.getElementById('sched-slot-mins').value) || 0;
  schedule = tempSchedule; tempSchedule = null;
  saveData(); closeModal('hours-modal'); renderHeroSchedule();
}

// ── HERO EDIT ──
async function pickEdgeColorFromImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onerror = () => reject(new Error('image load failed'));
    img.onload = () => {
      try {
        const W = Math.min(img.naturalWidth, 200), H = Math.min(img.naturalHeight, 200);
        if (!W || !H) return reject(new Error('zero-size image'));
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;
        let r=0, g=0, b=0, n=0;
        for (let x=0;x<W;x++){const i=x*4;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
        for (let x=0;x<W;x++){const i=((H-1)*W+x)*4;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
        for (let y=1;y<H-1;y++){const i=(y*W)*4;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
        for (let y=1;y<H-1;y++){const i=(y*W+(W-1))*4;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
        resolve(`rgb(${Math.round(r/n)}, ${Math.round(g/n)}, ${Math.round(b/n)})`);
      } catch(e) { reject(e); }
    };
    img.src = url;
  });
}

async function autoSampleHeroFill(url) {
  if (!url) { heroEditFill = ''; updateHeroBgPreview(); return; }
  try { heroEditFill = await pickEdgeColorFromImage(url); } catch(e) { heroEditFill = ''; }
  updateHeroBgPreview();
}

function updateHeroBgPreview() {
  const size = parseFloat(document.getElementById('edit-hero-bg-size').value);
  const px = parseFloat(document.getElementById('edit-hero-bg-posx').value);
  const py = parseFloat(document.getElementById('edit-hero-bg-posy').value);
  const rot = parseFloat(document.getElementById('edit-hero-bg-rot').value);
  document.getElementById('edit-hero-bg-size-val').textContent = size + '%';
  document.getElementById('edit-hero-bg-posx-val').textContent = px + '%';
  document.getElementById('edit-hero-bg-posy-val').textContent = py + '%';
  document.getElementById('edit-hero-bg-rot-val').textContent = rot + '°';
  applyHeroBg(getDropZoneValue('edit-hero-bg-zone') || '', size, px, py, rot, heroEditFill);
}

function openHeroModal() {
  setupDropZone('edit-hero-bg-zone', 'edit-hero-bg');
  const zone = document.getElementById('edit-hero-bg-zone');
  if (zone && !zone._heroListenerAttached) {
    zone.addEventListener('imageChanged', (e) => autoSampleHeroFill(e.detail && e.detail.url || ''));
    zone._heroListenerAttached = true;
  }
  heroEditFill = heroData.bgFill || '';
  setDropZoneValue('edit-hero-bg-zone', heroData.bg || '');
  document.getElementById('edit-hero-bg-size').value = heroData.bgSize ?? 100;
  document.getElementById('edit-hero-bg-posx').value = heroData.bgPosX ?? 0;
  document.getElementById('edit-hero-bg-posy').value = heroData.bgPosY ?? 0;
  document.getElementById('edit-hero-bg-rot').value = heroData.bgRotation ?? 0;
  updateHeroBgPreview(); openModal('hero-modal');
}
function saveHero() {
  heroData.bg = getDropZoneValue('edit-hero-bg-zone') || '';
  heroData.bgSize = parseFloat(document.getElementById('edit-hero-bg-size').value) || 100;
  heroData.bgPosX = parseFloat(document.getElementById('edit-hero-bg-posx').value) || 0;
  heroData.bgPosY = parseFloat(document.getElementById('edit-hero-bg-posy').value) || 0;
  heroData.bgRotation = parseFloat(document.getElementById('edit-hero-bg-rot').value) || 0;
  heroData.bgFill = heroEditFill || '';
  renderHero(); saveData(); closeModal('hero-modal');
}
function cancelHeroEdit() { closeModal('hero-modal'); renderHero(); }

// ── SLIDER EDITOR ──
function openSliderModal() { editingSlides = JSON.parse(JSON.stringify(sliderSlides || [])); renderSliderEditor(); openModal('slider-modal'); }
function cancelSliderEdit() { closeModal('slider-modal'); }
async function saveSlider() {
  collectEditingSlidesFromDOM();
  sliderSlides = editingSlides;
  const ok = await saveConfig();
  if (ok === false) return;
  renderSlider(); closeModal('slider-modal');
}

function collectEditingSlidesFromDOM() {
  editingSlides.forEach((s, idx) => {
    const card = document.querySelector(`.slide-editor[data-idx="${idx}"]`);
    if (!card) return;
    const content = card.querySelector('.slide-content-edit');
    if (content) s.content = content.innerHTML;
    const bgColor = card.querySelector('.slide-bg-color');
    if (bgColor) s.bgColor = bgColor.value;
    const textColor = card.querySelector('.slide-text-color');
    if (textColor) s.textColor = textColor.value;
  });
}

function addSlide() {
  collectEditingSlidesFromDOM();
  editingSlides.push({ id: 's' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), bg: '', bgColor: '#1a1612', textColor: '#ffffff', content: '<h1>New slide</h1><p>Click here to edit.</p>' });
  renderSliderEditor();
}
function deleteSlide(idx) { if (!confirm('Delete this slide?')) return; collectEditingSlidesFromDOM(); editingSlides.splice(idx, 1); renderSliderEditor(); }
function moveSlide(idx, delta) {
  collectEditingSlidesFromDOM();
  const ni = idx + delta;
  if (ni < 0 || ni >= editingSlides.length) return;
  const tmp = editingSlides[idx]; editingSlides[idx] = editingSlides[ni]; editingSlides[ni] = tmp;
  renderSliderEditor();
}
function rtCommand(cmd, val) { document.execCommand(cmd, false, val || null); }

const RT_FONTS = [
  { v: '', label: 'Default font' }, { v: "'Playfair Display', serif", label: 'Playfair Display' },
  { v: "'DM Sans', sans-serif", label: 'DM Sans' }, { v: 'Georgia, serif', label: 'Georgia' },
  { v: 'Arial, sans-serif', label: 'Arial' }, { v: "'Courier New', monospace", label: 'Courier New' }
];
const RT_BLOCKS = [{ v: 'P', label: 'Paragraph' }, { v: 'H1', label: 'Heading 1' }, { v: 'H2', label: 'Heading 2' }, { v: 'H3', label: 'Heading 3' }];

function renderSliderEditor() {
  const list = document.getElementById('slider-editor-list');
  if (!list) return;
  if (!editingSlides.length) { list.innerHTML = `<div class="slider-editor-empty">No slides yet. Click "+ Add Slide" to create your first one.</div>`; return; }
  const fontOpts = RT_FONTS.map(f => `<option value="${esc(f.v)}">${esc(f.label)}</option>`).join('');
  const blockOpts = RT_BLOCKS.map(b => `<option value="${b.v}">${esc(b.label)}</option>`).join('');
  list.innerHTML = editingSlides.map((s, idx) => `
    <div class="slide-editor" data-idx="${idx}">
      <div class="slide-editor-head">
        <span class="slide-editor-title">Slide ${idx + 1}</span>
        <div class="slide-editor-head-actions">
          <button class="slide-btn" onclick="moveSlide(${idx}, -1)" ${idx===0?'disabled':''}>↑</button>
          <button class="slide-btn" onclick="moveSlide(${idx}, 1)" ${idx===editingSlides.length-1?'disabled':''}>↓</button>
          <button class="slide-btn danger" onclick="deleteSlide(${idx})">Delete</button>
        </div>
      </div>
      <div class="slide-editor-body">
        <div class="slide-editor-row">
          <div>
            <label>Background image</label>
            <div class="img-drop-spec">JPG, PNG, GIF or WebP · <b>Max 4 MB</b></div>
            <div class="img-drop-zone" id="slide-img-zone-${idx}">
              <label class="img-drop-empty" for="slide-img-file-${idx}"><div class="img-drop-icon">🖼</div><div class="img-drop-text">Drag &amp; drop or <strong>tap to browse</strong></div></label>
              <div class="img-drop-preview-wrap" style="display:none"><img class="img-drop-preview" /><button type="button" class="img-drop-remove" title="Remove">✕</button></div>
              <div class="img-drop-loading" style="display:none">Uploading...</div>
              <div class="img-drop-or">— or paste a URL —</div>
              <input type="text" class="img-drop-url" id="slide-img-${idx}" placeholder="https://..." />
              <input type="file" id="slide-img-file-${idx}" class="img-drop-file" accept="image/*" />
            </div>
          </div>
          <div>
            <label>Background color</label>
            <div class="slide-bg-color-picker"><input type="color" class="slide-bg-color" value="${esc(s.bgColor||'#1a1612')}" /></div>
            <div style="margin-top:.8rem"><label>Text color</label>
            <div class="slide-text-color-picker"><input type="color" class="slide-text-color" value="${esc(s.textColor||'#ffffff')}" /></div></div>
          </div>
        </div>
        <div>
          <label>Slide content</label>
          <div class="rt-toolbar">
            <button type="button" class="rt-btn" onmousedown="event.preventDefault()" onclick="rtCommand('bold')"><b>B</b></button>
            <button type="button" class="rt-btn" onmousedown="event.preventDefault()" onclick="rtCommand('italic')"><i>I</i></button>
            <button type="button" class="rt-btn" onmousedown="event.preventDefault()" onclick="rtCommand('underline')"><u>U</u></button>
            <span class="rt-sep"></span>
            <select class="rt-select" onmousedown="event.preventDefault()" onchange="rtCommand('fontName', this.value); this.value=''">${fontOpts}</select>
            <select class="rt-select" onmousedown="event.preventDefault()" onchange="rtCommand('formatBlock', this.value); this.value=''"><option value="">Block…</option>${blockOpts}</select>
            <select class="rt-select" onmousedown="event.preventDefault()" onchange="rtCommand('fontSize', this.value); this.value=''"><option value="">Size…</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Medium</option><option value="5">Large</option><option value="7">XL</option></select>
            <span class="rt-sep"></span>
            <input type="color" class="rt-color" onmousedown="event.preventDefault()" oninput="rtCommand('foreColor', this.value)" value="#000000" />
            <span class="rt-sep"></span>
            <button type="button" class="rt-btn" onmousedown="event.preventDefault()" onclick="rtCommand('justifyLeft')">⯇</button>
            <button type="button" class="rt-btn" onmousedown="event.preventDefault()" onclick="rtCommand('justifyCenter')">≡</button>
            <button type="button" class="rt-btn" onmousedown="event.preventDefault()" onclick="rtCommand('justifyRight')">⯈</button>
            <span class="rt-sep"></span>
            <button type="button" class="rt-btn" onmousedown="event.preventDefault()" onclick="rtCommand('removeFormat')">⌫</button>
          </div>
          <div class="slide-content-edit" contenteditable="true" spellcheck="false">${s.content || ''}</div>
        </div>
      </div>
    </div>`).join('');

  editingSlides.forEach((s, idx) => {
    setupDropZone(`slide-img-zone-${idx}`, `slide-img-${idx}`);
    setDropZoneValue(`slide-img-zone-${idx}`, s.bg || '');
    const zone = document.getElementById(`slide-img-zone-${idx}`);
    if (zone && !zone._slideListener) {
      zone.addEventListener('imageChanged', (e) => {
        const i = parseInt(zone.closest('.slide-editor').dataset.idx);
        if (!isNaN(i) && editingSlides[i]) editingSlides[i].bg = (e.detail && e.detail.url) || '';
      });
      zone._slideListener = true;
    }
  });
}

// ── FILTERS (admin) ──
function openFiltersModal() { filtersEditing = JSON.parse(JSON.stringify(filterDefs || [])); renderFiltersEditor(); openModal('filters-modal'); }

function renderFiltersEditor() {
  const list = document.getElementById('filters-list');
  if (!filtersEditing.length) { list.innerHTML = '<div class="product-filters-empty">No filters yet.</div>'; return; }
  list.innerHTML = filtersEditing.map((f, idx) => `
    <div class="filter-row">
      <div class="filter-row-head">
        <input type="text" placeholder="Filter name" value="${esc(f.name||'')}" oninput="updateFilterName(${idx}, this.value)" />
        <button class="filter-row-del" onclick="deleteFilter(${idx})">Remove</button>
      </div>
      <div class="filter-options">${(f.options||[]).map((opt,oi)=>`<span class="filter-option-chip">${esc(opt)}<button onclick="deleteFilterOption(${idx},${oi})">×</button></span>`).join('')}</div>
      <div class="filter-option-add">
        <input type="text" placeholder="Add option" id="filter-opt-input-${idx}" onkeydown="if(event.key==='Enter'){event.preventDefault();addFilterOption(${idx});}" />
        <button onclick="addFilterOption(${idx})">Add</button>
      </div>
    </div>`).join('');
}

function addFilter() { filtersEditing.push({ id: 'f' + Date.now(), name: '', options: [] }); renderFiltersEditor(); }
function updateFilterName(idx, value) { if (filtersEditing[idx]) filtersEditing[idx].name = value; }
function deleteFilter(idx) { if (!confirm('Delete this filter?')) return; filtersEditing.splice(idx, 1); renderFiltersEditor(); }
function addFilterOption(idx) {
  const input = document.getElementById('filter-opt-input-' + idx);
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (!filtersEditing[idx].options) filtersEditing[idx].options = [];
  if (filtersEditing[idx].options.includes(val)) { input.value = ''; return; }
  filtersEditing[idx].options.push(val); input.value = ''; renderFiltersEditor();
  setTimeout(() => { const nx = document.getElementById('filter-opt-input-' + idx); if (nx) nx.focus(); }, 0);
}
function deleteFilterOption(idx, oi) { filtersEditing[idx].options.splice(oi, 1); renderFiltersEditor(); }

async function saveFilters() {
  const clean = filtersEditing.map(f => ({ id: f.id || ('f' + Date.now()), name: String(f.name||'').trim(), options: (f.options||[]).map(o=>String(o).trim()).filter(Boolean) })).filter(f => f.name);
  const oldById = {}; filterDefs.forEach(f => { if (f.id) oldById[f.id] = f; });
  const renames = [], removedNames = new Set(filterDefs.map(f => f.name).filter(Boolean));
  clean.forEach(f => { const old = oldById[f.id]; if (old && old.name && old.name !== f.name) renames.push({ from: old.name, to: f.name }); removedNames.delete(f.name); });
  filterDefs = clean; await saveConfig();
  if (renames.length || removedNames.size) {
    const validOpts = {}; clean.forEach(f => { validOpts[f.name] = new Set(f.options); });
    const updates = [];
    for (const p of products) {
      const f = p.filters && typeof p.filters === 'object' ? { ...p.filters } : {};
      let changed = false;
      renames.forEach(r => { if (f[r.from] !== undefined) { f[r.to] = f[r.from]; delete f[r.from]; changed = true; } });
      removedNames.forEach(n => { if (f[n] !== undefined) { delete f[n]; changed = true; } });
      for (const k of Object.keys(f)) { if (!validOpts[k] || !validOpts[k].has(f[k])) { delete f[k]; changed = true; } }
      if (changed) updates.push(fetch('/api/products/' + p.id, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ filters: f }) }));
    }
    if (updates.length) await Promise.all(updates);
    const pRes = await fetch('/api/products'); if (pRes.ok) products = await pRes.json();
  }
  renderGrid(); renderShopFilterBar(); closeModal('filters-modal');
}

// ── PRODUCT EDIT ──
function renderProductFilterSelectors(current) {
  const wrap = document.getElementById('product-filters-wrap');
  if (!wrap) return;
  current = current || {};
  if (!filterDefs.length) { wrap.innerHTML = '<div class="product-filters-empty">No filters yet. Create filters via the 🏷 Filters button.</div>'; return; }
  wrap.innerHTML = filterDefs.map(f => `
    <div class="product-filter-group">
      <label>${esc(f.name)}</label>
      <select data-filter-name="${esc(f.name)}">
        <option value="">— Not set —</option>
        ${(f.options||[]).map(o=>`<option value="${esc(o)}" ${current[f.name]===o?'selected':''}>${esc(o)}</option>`).join('')}
      </select>
    </div>`).join('');
}

function collectProductFilters() {
  const out = {};
  document.querySelectorAll('#product-filters-wrap select[data-filter-name]').forEach(sel => { if (sel.value) out[sel.dataset.filterName] = sel.value; });
  return out;
}

function openProductModal(id = null) {
  editingId = id;
  document.getElementById('product-modal-title').textContent = id ? 'Edit Product' : 'Add Product';
  setupDropZone('edit-img-zone', 'edit-img');
  if (id) {
    const p = products.find(x => x.id === id);
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-desc').value = p.desc;
    document.getElementById('edit-price').value = p.price;
    document.getElementById('edit-cost').value = (p.cost != null && p.cost !== '') ? p.cost : '';
    document.getElementById('edit-badge').value = p.badge || '';
    document.getElementById('edit-category').value = p.category || '';
    document.getElementById('edit-qty').value = p.qty !== undefined ? p.qty : '';
    document.getElementById('edit-max-qty').value = p.maxQty !== undefined ? p.maxQty : '';
    setDropZoneValue('edit-img-zone', p.img || '');
    renderProductFilterSelectors(p.filters || {});
  } else {
    ['edit-name','edit-desc','edit-price','edit-cost','edit-badge','edit-category'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('edit-qty').value = '';
    document.getElementById('edit-max-qty').value = '';
    setDropZoneValue('edit-img-zone', '');
    renderProductFilterSelectors({});
  }
  openModal('product-modal');
}

async function saveProduct() {
  const name = document.getElementById('edit-name').value.trim();
  const desc = document.getElementById('edit-desc').value.trim();
  const price = parseFloat(document.getElementById('edit-price').value);
  if (!name || !desc || isNaN(price)) { alert('Please fill in Name, Description, and Price.'); return; }
  const costRaw = document.getElementById('edit-cost').value;
  const updated = {
    name, desc, price, cost: costRaw === '' ? 0 : (parseFloat(costRaw) || 0),
    badge: document.getElementById('edit-badge').value.trim() || null,
    category: document.getElementById('edit-category').value.trim() || '',
    img: getDropZoneValue('edit-img-zone') || 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80',
    qty: parseInt(document.getElementById('edit-qty').value) || 0,
    maxQty: parseInt(document.getElementById('edit-max-qty').value) || null,
    filters: collectProductFilters(),
  };
  try {
    const res = editingId
      ? await fetch(`/api/products/${editingId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(updated) })
      : await fetch('/api/products', { method: 'POST', headers: authHeaders(), body: JSON.stringify(updated) });
    if (res.status === 401) { handleAuthFailure(); return; }
    if (!res.ok) { alert('Failed to save product (' + res.status + ').'); return; }
    const pRes = await fetch('/api/products'); if (pRes.ok) products = await pRes.json();
    renderGrid();
  } catch(e) { alert('Network error saving product.'); return; }
  closeModal('product-modal');
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.status === 401) { handleAuthFailure(); return; }
    if (!res.ok) { alert('Failed to delete product (' + res.status + ').'); return; }
    const pRes = await fetch('/api/products'); if (pRes.ok) products = await pRes.json();
    renderGrid();
  } catch(e) { alert('Network error deleting product.'); }
}

// ── PICKUP INSTRUCTIONS ──
function openPickupInstructionsModal() {
  document.getElementById('pi-title').value = pickupInstructions.title || '';
  document.getElementById('pi-text').value = pickupInstructions.text || '';
  setupDropZone('pi-img-zone', 'pi-img');
  setDropZoneValue('pi-img-zone', pickupInstructions.img || '');
  openModal('pickup-instructions-modal');
}
function savePickupInstructions() {
  pickupInstructions.title = document.getElementById('pi-title').value.trim() || 'Pickup Instructions';
  pickupInstructions.text = document.getElementById('pi-text').value.trim();
  pickupInstructions.img = getDropZoneValue('pi-img-zone');
  saveData(); closeModal('pickup-instructions-modal');
}

// ── ADMIN INIT ──
async function initAdmin() {
  await loadData();

  // Fetch orders (admin only)
  try {
    const oRes = await fetch('/api/orders', { headers: authHeaders() });
    if (oRes.ok) adminOrders = await oRes.json();
  } catch(e) {}

  renderHero(); renderShopFilterBar(); renderGrid(); renderSlider(); updateCartBtn(); connectSSE();

  if (adminToken) {
    try {
      const res = await fetch('/api/session', { headers: authHeaders() });
      const data = await res.json();
      if (data.valid) completeLogin();
      else { adminToken = null; localStorage.removeItem('pouches-admin-token'); }
    } catch(e) { adminToken = null; localStorage.removeItem('pouches-admin-token'); }
  }
}

document.addEventListener('DOMContentLoaded', initAdmin);
