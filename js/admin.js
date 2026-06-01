// ── ADMIN STATE ──
let adminOrders = [];
let orderFilter = 'all';
let orderSearchQuery = '';
let newOrderCount = 0;
let finPeriod = 'all';
let editingId = null;
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
  const counts = { all: adminOrders.length, new: 0, 'picked-up': 0, cancelled: 0 };
  adminOrders.forEach(o => { const s = o.status || 'new'; if (counts[s] !== undefined) counts[s]++; });
  ['all','new','picked-up','cancelled'].forEach(k => {
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
    const statusLabel = status === 'picked-up' ? 'Done' : status.charAt(0).toUpperCase() + status.slice(1);
    const time = new Date(o.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const items = o.items.map(i => `<div class="item-line"><span>${esc(i.name)} × ${i.qty}</span><span>$${(i.price * i.qty).toFixed(2)}</span></div>`).join('');
    let actions = '';
    if (status === 'picked-up') {
      actions = `<button class="order-action-btn" onclick="updateOrderStatus(${o.id}, 'new')" style="font-size:.7rem;color:var(--muted)">Reopen</button>`;
    } else if (status === 'cancelled') {
      actions = `<div style="font-size:.7rem;color:var(--muted);text-align:center;width:100%">Cancelled${o.cancelledAt ? ' · ' + new Date(o.cancelledAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : ''}</div>`;
    } else {
      actions = `
        <button class="order-action-btn success" onclick="updateOrderStatus(${o.id}, 'picked-up')">✓ Done</button>
        <button class="order-action-btn danger" onclick="revertOrder(${o.id})">✕ Cancel</button>`;
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

function exportFinancials() {
  const orders = getFilteredOrders();
  const periodLabel = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month' }[finPeriod];
  const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const costLookup = {};
  products.forEach(p => { costLookup[p.id] = parseFloat(p.cost) || 0; costLookup[p.name] = parseFloat(p.cost) || 0; });
  function itemCost(i) {
    if (i.cost != null && i.cost !== '') return parseFloat(i.cost) || 0;
    return costLookup[i.id] ?? costLookup[i.name] ?? 0;
  }

  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total), 0);
  const totalCost = orders.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + itemCost(i) * i.qty, 0), 0);
  const totalProfit = totalRevenue - totalCost;
  const totalItems = orders.reduce((s, o) => s + o.items.reduce((s2, i) => s2 + i.qty, 0), 0);
  const avgOrder = orders.length > 0 ? totalRevenue / orders.length : 0;
  const cancelled = adminOrders.filter(o => o.status === 'cancelled');

  const productMap = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!productMap[i.name]) productMap[i.name] = { name: i.name, qty: 0, revenue: 0, cost: 0 };
      productMap[i.name].qty += i.qty;
      productMap[i.name].revenue += i.price * i.qty;
      productMap[i.name].cost += itemCost(i) * i.qty;
    });
  });
  const productList = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);

  let csv = `The.Pouches — Financial Report\n`;
  csv += `Period: ${periodLabel}\n`;
  csv += `Generated: ${now}\n\n`;
  csv += `SUMMARY\n`;
  csv += `Revenue,$${totalRevenue.toFixed(2)}\n`;
  csv += `Cost (COGS),$${totalCost.toFixed(2)}\n`;
  csv += `Profit,$${totalProfit.toFixed(2)}\n`;
  csv += `Margin,${totalRevenue > 0 ? ((totalProfit/totalRevenue)*100).toFixed(1) : 0}%\n`;
  csv += `Orders,${orders.length}\n`;
  csv += `Items Sold,${totalItems}\n`;
  csv += `Avg Order Value,$${avgOrder.toFixed(2)}\n`;
  csv += `Cancelled Orders,${cancelled.length}\n\n`;
  csv += `PRODUCT BREAKDOWN\n`;
  csv += `Product,Qty,Revenue,Cost,Profit,Margin\n`;
  productList.forEach(p => {
    const profit = p.revenue - p.cost;
    const margin = p.revenue > 0 ? ((profit/p.revenue)*100).toFixed(1) : 0;
    csv += `"${p.name}",${p.qty},$${p.revenue.toFixed(2)},$${p.cost.toFixed(2)},$${profit.toFixed(2)},${margin}%\n`;
  });
  csv += `\nORDER LOG\n`;
  csv += `Order ID,Date,Items,Vehicle,Plate,Total,Status\n`;
  [...orders, ...cancelled].sort((a,b) => b.id - a.id).forEach(o => {
    const time = new Date(o.createdAt).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
    const itemStr = o.items.map(i => `${i.name} x${i.qty}`).join('; ');
    csv += `#${String(o.id).slice(-6)},"${time}","${itemStr}","${o.vehicle}","${o.plate.toUpperCase()}","$${o.total}","${o.status}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pouches-report-${finPeriod}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderFinancials() {
  const body = document.getElementById('fin-body');
  const orders = getFilteredOrders();
  const cancelled = adminOrders.filter(o => o.status === 'cancelled');
  const periodLabel = { all: 'All Time', today: 'Today', week: 'This Week', month: 'This Month' }[finPeriod];
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

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
  const productList = Object.values(productMap)
    .map(p => ({ ...p, profit: p.revenue - p.cost, margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = productList.length ? productList[0].revenue : 0;
  const profitColor = totalProfit >= 0 ? '#15803d' : '#dc2626';

  const allForLog = [...orders, ...cancelled].sort((a, b) => b.id - a.id);

  body.innerHTML = `
    <!-- Report header -->
    <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:1.1rem 1.2rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;">
      <div>
        <div style="font-family:'Playfair Display',serif;font-size:1rem;font-weight:700;color:var(--ink);">Financial Report — ${periodLabel}</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem;">Generated ${now}</div>
      </div>
      <button onclick="exportFinancials()" style="background:var(--ink);color:#fff;border:none;font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:600;padding:.5rem 1rem;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:.4rem;">
        ⬇ Export CSV
      </button>
    </div>

    <!-- KPI cards -->
    <div class="fin-stats">
      <div class="fin-stat accent">
        <div class="fin-stat-label">Total Revenue</div>
        <div class="fin-stat-value">$${totalRevenue.toFixed(2)}</div>
        <div class="fin-stat-sub">${totalOrders} order${totalOrders !== 1 ? 's' : ''} · ${totalItems} items</div>
      </div>
      <div class="fin-stat">
        <div class="fin-stat-label">Gross Profit</div>
        <div class="fin-stat-value" style="color:${profitColor}">$${totalProfit.toFixed(2)}</div>
        <div class="fin-stat-sub">${avgMargin.toFixed(1)}% margin</div>
      </div>
      <div class="fin-stat">
        <div class="fin-stat-label">Cost of Goods</div>
        <div class="fin-stat-value">$${totalCost.toFixed(2)}</div>
        <div class="fin-stat-sub">COGS</div>
      </div>
      <div class="fin-stat">
        <div class="fin-stat-label">Avg Order Value</div>
        <div class="fin-stat-value">$${avgOrder.toFixed(2)}</div>
        <div class="fin-stat-sub">${totalItems} units total</div>
      </div>
      ${cancelled.length ? `
      <div class="fin-stat wide" style="border-color:#fee2e2;">
        <div class="fin-stat-label" style="color:#dc2626;">Cancelled Orders</div>
        <div class="fin-stat-value" style="color:#dc2626;font-size:1.1rem;">${cancelled.length} order${cancelled.length !== 1 ? 's' : ''} · $${cancelledRevenue.toFixed(2)} reversed</div>
      </div>` : ''}
    </div>

    <!-- Product breakdown -->
    ${productList.length ? `
    <div>
      <div class="fin-section-title">Product Breakdown</div>
      <table class="fin-table">
        <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead>
        <tbody>
          ${productList.map(p => `
          <tr>
            <td class="product-name">${esc(p.name)}</td>
            <td>${p.qty}</td>
            <td>
              <div class="fin-bar-cell">
                <div class="fin-bar" style="width:${maxRevenue ? (p.revenue/maxRevenue*100) : 0}%"></div>
                <span style="position:relative;">$${p.revenue.toFixed(2)}</span>
              </div>
            </td>
            <td>$${p.cost.toFixed(2)}</td>
            <td style="color:${p.profit>=0?'#15803d':'#dc2626'};font-weight:600;">$${p.profit.toFixed(2)}</td>
            <td style="color:var(--muted);">${p.margin.toFixed(0)}%</td>
          </tr>`).join('')}
          <tr style="font-weight:700;border-top:2px solid var(--border);background:var(--cream);">
            <td>Total</td><td>${totalItems}</td>
            <td>$${totalRevenue.toFixed(2)}</td>
            <td>$${totalCost.toFixed(2)}</td>
            <td style="color:${profitColor}">$${totalProfit.toFixed(2)}</td>
            <td style="color:var(--muted);">${avgMargin.toFixed(0)}%</td>
          </tr>
        </tbody>
      </table>
    </div>` : ''}

    <!-- Full order log -->
    ${allForLog.length ? `
    <div>
      <div class="fin-section-title">Order Log</div>
      <table class="fin-table">
        <thead><tr><th>Order</th><th>Pickup</th><th>Items</th><th>Vehicle</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>
          ${allForLog.map(o => {
            const status = o.status || 'new';
            const statusLabel = status === 'picked-up' ? 'Done' : status.charAt(0).toUpperCase() + status.slice(1);
            const time = new Date(o.createdAt).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
            return `<tr style="${status==='cancelled'?'opacity:.55;':''}">
              <td style="font-size:.72rem;"><div style="font-weight:600;">#${String(o.id).slice(-6)}</div><div style="color:var(--muted);font-size:.65rem;">${time}</div></td>
              <td style="font-size:.75rem;">${esc(o.dateStr)}</td>
              <td style="font-size:.75rem;">${o.items.map(i=>`${esc(i.name)} ×${i.qty}`).join(', ')}</td>
              <td style="font-size:.75rem;">${esc(o.vehicle)}<br><span style="color:var(--muted);font-size:.65rem;">${esc(o.plate).toUpperCase()}</span></td>
              <td><span class="order-status-badge ${status}" style="font-size:.58rem;">${statusLabel}</span></td>
              <td style="font-weight:600;">$${o.total}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<div class="orders-empty" style="padding:2rem;text-align:center;">No orders in this period.</div>'}
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

// ── HERO / BANNER EDITOR ──
let editingBanners = [];

function openHeroModal() {
  editingBanners = JSON.parse(JSON.stringify(heroBanners.length ? heroBanners : []));
  renderBannerEditor();
  openModal('hero-modal');
}

function cancelHeroEdit() {
  closeModal('hero-modal');
  renderHero();
}

async function saveHero() {
  collectBannersFromDOM();
  heroBanners = editingBanners;
  // also clear legacy heroData bg so it doesn't override
  heroData.bg = '';
  const ok = await saveConfig();
  if (ok === false) return;
  renderHero();
  closeModal('hero-modal');
}

function collectBannersFromDOM() {
  editingBanners.forEach((b, idx) => {
    const card = document.querySelector(`.banner-editor-card[data-idx="${idx}"]`);
    if (!card) return;
    b.bg = toRawUrl(card.querySelector('.banner-img-url').value.trim());
    b.bgColor = card.querySelector('.banner-bg-color').value;
    b.duration = parseFloat(card.querySelector('.banner-duration').value) || 6;
  });
}

function addBanner() {
  collectBannersFromDOM();
  editingBanners.push({ bg: '', bgColor: '#1a1612', duration: 6 });
  renderBannerEditor();
}

function deleteBanner(idx) {
  collectBannersFromDOM();
  editingBanners.splice(idx, 1);
  renderBannerEditor();
}

function moveBanner(idx, delta) {
  collectBannersFromDOM();
  const ni = idx + delta;
  if (ni < 0 || ni >= editingBanners.length) return;
  const tmp = editingBanners[idx]; editingBanners[idx] = editingBanners[ni]; editingBanners[ni] = tmp;
  renderBannerEditor();
}

async function importBannerFolder() {
  const url = document.getElementById('banner-folder-url').value.trim();
  if (!url) { alert('Paste a GitHub folder URL first.'); return; }
  document.getElementById('banner-folder-url').value = '';
  const imgs = await fetchGithubFolder(url);
  if (!imgs || !imgs.length) { alert('No images found in that folder.'); return; }
  collectBannersFromDOM();
  imgs.forEach(imgUrl => {
    editingBanners.push({ bg: imgUrl, bgColor: '#1a1612', duration: 6 });
  });
  renderBannerEditor();
}

function renderBannerEditor() {
  const list = document.getElementById('banner-editor-list');
  if (!list) return;
  if (!editingBanners.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:.88rem;padding:1rem 0;">No banners yet. Add one below.</div>';
    return;
  }
  list.innerHTML = editingBanners.map((b, idx) => `
    <div class="banner-editor-card" data-idx="${idx}" style="background:#fff;border:1px solid var(--border);border-radius:6px;padding:.8rem;margin-bottom:.6rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
        <span style="font-size:.85rem;font-weight:600;color:var(--ink);">Banner ${idx + 1}</span>
        <div style="display:flex;gap:.3rem;">
          <button class="slide-btn" onclick="moveBanner(${idx},-1)" ${idx===0?'disabled':''}>↑</button>
          <button class="slide-btn" onclick="moveBanner(${idx},1)" ${idx===editingBanners.length-1?'disabled':''}>↓</button>
          <button class="slide-btn danger" onclick="deleteBanner(${idx})">Delete</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:.5rem;align-items:end;">
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Image URL</label>
          <input type="text" class="banner-img-url" placeholder="https://... or GitHub folder URL"
            value="${esc(b.bg||'')}"
            style="width:100%;font-family:'DM Sans',sans-serif;font-size:.88rem;border:1px solid var(--border);border-radius:4px;padding:.5rem .7rem;background:var(--warm-white);">
        </div>
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">BG Color</label>
          <input type="color" class="banner-bg-color" value="${esc(b.bgColor||'#1a1612')}"
            style="width:44px;height:36px;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:2px;">
        </div>
        <div>
          <label style="font-size:.75rem;color:var(--muted);display:block;margin-bottom:.25rem;">Secs</label>
          <input type="number" class="banner-duration" value="${b.duration||6}" min="2" max="60"
            style="width:56px;font-family:'DM Sans',sans-serif;font-size:.88rem;border:1px solid var(--border);border-radius:4px;padding:.5rem .4rem;text-align:center;">
        </div>
      </div>
      ${b.bg ? `<img src="${esc(toRawUrl(b.bg))}" style="margin-top:.5rem;width:100%;height:60px;object-fit:cover;border-radius:4px;display:block;" onerror="this.style.display='none'">` : ''}
    </div>`).join('');
}

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

async function importSliderFolder() {
  const url = document.getElementById('slider-folder-url').value.trim();
  if (!url) { alert('Paste a GitHub folder URL first.'); return; }
  document.getElementById('slider-folder-url').value = '';
  await addSlidesFromFolder(url);
}

async function addSlidesFromFolder(folderUrl) {
  const imgs = await fetchGithubFolder(folderUrl);
  if (!imgs || !imgs.length) { alert('No images found in that folder.'); return; }
  collectEditingSlidesFromDOM();
  imgs.forEach(url => {
    editingSlides.push({ id: 's' + Date.now() + '-' + Math.random().toString(36).slice(2,6), bg: url, bgColor: '#1a1612', textColor: '#ffffff', content: '' });
  });
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
            <label>Background image URL</label>
            <input type="text" class="img-drop-url" style="margin-top:.3rem;" placeholder="https://..." value="${esc(s.bg||'')}" oninput="editingSlides[${idx}].bg=this.value" />
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
}

// ── PRODUCT EDIT ──
function renderProductFilterSelectors() {
  const wrap = document.getElementById('product-filters-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
}

function collectProductFilters() { return {}; }

function openProductModal(id = null) {
  editingId = id;
  document.getElementById('product-modal-title').textContent = id ? 'Edit Product' : 'Add Product';
  if (id) {
    const p = products.find(x => x.id === id);
    document.getElementById('edit-name').value     = p.name;
    document.getElementById('edit-desc').value     = p.desc || '';
    document.getElementById('edit-price').value    = p.price;
    document.getElementById('edit-cost').value     = (p.cost != null && p.cost !== '') ? p.cost : '';
    document.getElementById('edit-badge').value    = p.badge || '';
    document.getElementById('edit-category').value = p.category || '';
    document.getElementById('edit-qty').value      = p.qty !== undefined ? p.qty : '';
    document.getElementById('edit-max-qty').value  = p.maxQty !== undefined ? p.maxQty : '';
    document.getElementById('edit-img').value      = p.img || '';
  } else {
    ['edit-name','edit-desc','edit-price','edit-cost','edit-badge','edit-category','edit-qty','edit-max-qty','edit-img'].forEach(i => { const el = document.getElementById(i); if(el) el.value = ''; });
  }
  openModal('product-modal');
  // Wire folder auto-fetch into image URL field
  setTimeout(() => {
    const imgField = document.getElementById('edit-img');
    if (imgField && !imgField._folderWired) {
      imgField._folderWired = true;
      let t;
      imgField.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const val = imgField.value.trim();
          if (isGithubFolderUrl(val)) {
            const imgs = await fetchGithubFolder(val);
            if (imgs && imgs.length) { imgField.value = imgs[0]; }
          } else {
            imgField.value = toRawUrl(val);
          }
        }, 600);
      });
    }
  }, 100);
}

async function saveProduct() {
  const name  = document.getElementById('edit-name').value.trim();
  const desc  = document.getElementById('edit-desc').value.trim();
  const price = parseFloat(document.getElementById('edit-price').value);
  if (!name || !desc || isNaN(price)) { alert('Please fill in Name, Description, and Price.'); return; }
  const updated = {
    name, desc, price,
    cost:     parseFloat(document.getElementById('edit-cost').value)  || 0,
    badge:    document.getElementById('edit-badge').value.trim()      || null,
    category: document.getElementById('edit-category').value.trim()   || '',
    img: toRawUrl(document.getElementById('edit-img').value.trim())        || 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&q=80',
    qty:      parseInt(document.getElementById('edit-qty').value)     || 0,
    maxQty:   parseInt(document.getElementById('edit-max-qty').value) || null,
    filters:  {},
  };
  try {
    const res = editingId
      ? await fetch(`/api/products/${editingId}`, { method: 'PUT',  headers: authHeaders(), body: JSON.stringify(updated) })
      : await fetch('/api/products',               { method: 'POST', headers: authHeaders(), body: JSON.stringify(updated) });
    if (res.status === 401) { handleAuthFailure(); return; }
    if (!res.ok) { const d = await res.json().catch(()=>({})); alert('Failed to save: ' + (d.error || res.status)); return; }
    const pRes = await fetch('/api/products'); if (pRes.ok) products = await pRes.json();
    if (typeof renderGrid === 'function') renderGrid();
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
    if (typeof renderGrid === 'function') renderGrid();
  } catch(e) { alert('Network error deleting product.'); }
}

// ── PICKUP INSTRUCTIONS ──
function openPickupInstructionsModal() {
  document.getElementById('pi-title').value = pickupInstructions.title || '';
  document.getElementById('pi-text').value  = pickupInstructions.text  || '';
  const piImg = document.getElementById('pi-img');
  if (piImg) piImg.value = pickupInstructions.img || '';
  openModal('pickup-instructions-modal');
}
function savePickupInstructions() {
  pickupInstructions.title = document.getElementById('pi-title').value.trim() || 'Pickup Instructions';
  pickupInstructions.text  = document.getElementById('pi-text').value.trim();
  const piImg = document.getElementById('pi-img');
  pickupInstructions.img   = piImg ? piImg.value.trim() : '';
  saveData(); closeModal('pickup-instructions-modal');
}

// ── ADMIN INIT ──
async function initAdmin() {
  await loadData();
  try {
    const oRes = await fetch('/api/orders', { headers: authHeaders() });
    if (oRes.ok) adminOrders = await oRes.json();
  } catch(e) {}
  renderHero(); renderGrid(); renderSlider(); updateCartBtn(); connectSSE();
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
