// ── SHARED STATE ──
let isAdmin = false;
let adminToken = localStorage.getItem('pouches-admin-token') || null;

let products = [];
let pickupInstructions = { title: 'Pickup Instructions', text: '', img: '' };
let sliderSlides = [];
let filterDefs = [];
let activeFilters = {};

let heroData = { bg: '', bgSize: 100, bgPosX: 0, bgPosY: 0, bgRotation: 0, bgFill: '', bgPosVer: 2 };

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
let schedule = {
  weekly: {
    0: { open: false, start: '09:00', end: '17:00' },
    1: { open: true,  start: '09:00', end: '17:00' },
    2: { open: true,  start: '09:00', end: '17:00' },
    3: { open: true,  start: '09:00', end: '17:00' },
    4: { open: true,  start: '09:00', end: '17:00' },
    5: { open: true,  start: '09:00', end: '17:00' },
    6: { open: false, start: '09:00', end: '17:00' },
  },
  overrides: {},
  slotMins: 30
};

// ── AUTH HELPERS ──
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (adminToken) h['Authorization'] = 'Bearer ' + adminToken;
  return h;
}

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── API ──
async function saveConfig() {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ hero: heroData, schedule, pickupInstructions, filters: filterDefs, slides: sliderSlides })
    });
    if (res.status === 401) { handleAuthFailure(); return false; }
    if (!res.ok) { alert('Failed to save changes (' + res.status + ').'); return false; }
    return true;
  } catch(e) { console.error('Failed to save config:', e); alert('Network error saving changes.'); return false; }
}
async function saveData() { return saveConfig(); }

async function loadData() {
  try {
    const pRes = await fetch('/api/products');
    if (pRes.ok) products = await pRes.json();

    const cRes = await fetch('/api/config');
    if (cRes.ok) {
      const config = await cRes.json();
      if (config.hero) {
        heroData = config.hero;
        if (heroData.bgPosVer !== 2) {
          heroData.bgPosX = (typeof heroData.bgPosX === 'number' ? heroData.bgPosX : 50) - 50;
          heroData.bgPosY = (typeof heroData.bgPosY === 'number' ? heroData.bgPosY : 50) - 50;
          heroData.bgPosVer = 2;
        }
      }
      if (config.schedule) schedule = config.schedule;
      if (!config.schedule && config.businessHours) {
        const bh = config.businessHours;
        DAY_NAMES.forEach((_, i) => {
          schedule.weekly[i] = { open: !!bh.days[i], start: bh.open || '09:00', end: bh.close || '17:00' };
        });
        schedule.slotMins = bh.slotMins || 30;
      }
      if (config.pickupInstructions) pickupInstructions = config.pickupInstructions;
      if (Array.isArray(config.filters)) filterDefs = config.filters;
      if (Array.isArray(config.slides)) sliderSlides = config.slides;
    }

    const ct = localStorage.getItem('pouches-cart');
    if (ct) cart = JSON.parse(ct);
  } catch(e) { console.error('Failed to load data:', e); }
}

// ── SSE ──
let currentSSE = null;
async function connectSSE() {
  if (currentSSE) { try { currentSSE.close(); } catch(e) {} currentSSE = null; }
  if (typeof EventSource === 'undefined') {
    setInterval(async () => {
      try {
        const pRes = await fetch('/api/products');
        if (pRes.ok) { products = await pRes.json(); if(typeof renderGrid==='function') renderGrid(); syncCartWithStock(); }
      } catch(e) {}
    }, 5000);
    return;
  }
  let url = '/api/events';
  if (adminToken) {
    try {
      const tRes = await fetch('/api/sse-ticket', { method: 'POST', headers: authHeaders() });
      if (tRes.ok) {
        const { ticket } = await tRes.json();
        if (ticket) url = `/api/events?ticket=${encodeURIComponent(ticket)}`;
      }
    } catch (e) {}
  }
  const es = new EventSource(url);
  currentSSE = es;
  es.addEventListener('products', (e) => {
    try {
      products = JSON.parse(e.data);
      if (typeof renderGrid === 'function') renderGrid();
      syncCartWithStock();
    } catch(err) {}
  });
  es.addEventListener('orders', (e) => {
    try {
      if (typeof adminOrders !== 'undefined') adminOrders = JSON.parse(e.data);
      const panel = document.getElementById('orders-overlay');
      if (panel && panel.classList.contains('open') && typeof renderOrders === 'function') renderOrders();
    } catch(err) {}
  });
  es.addEventListener('new_order', (e) => {
    try {
      const order = JSON.parse(e.data);
      if (typeof handleNewOrder === 'function') handleNewOrder(order);
    } catch(err) {}
  });
  es.onerror = () => {
    es.close(); currentSSE = null;
    setTimeout(connectSSE, 3000);
  };
}

// ── SCHEDULE HELPERS ──
function getDayInfo(dateStr, sched) {
  sched = sched || schedule;
  if (sched.overrides && sched.overrides[dateStr]) {
    const ov = sched.overrides[dateStr];
    return { open: ov.open, start: ov.start || '09:00', end: ov.end || '17:00', isOverride: true };
  }
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  const w = sched.weekly[dow];
  return { open: w.open, start: w.start, end: w.end, isOverride: false };
}

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'p' : 'a';
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2,'0') : ''}${ampm}`;
}

function fmtHeroTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
}

function parseHHMM(s) {
  const parts = String(s || '').split(':');
  return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
}

function getOpenDates(daysAhead = 90) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const info = getDayInfo(dateStr);
    if (info.open) dates.push(dateStr);
  }
  return dates;
}

// ── HERO ──
let _currentBgArgs = null;
function applyHeroBg(url, size, px, py, rot, fill) {
  _currentBgArgs = { url, size, px, py, rot, fill };
  renderHeroBg();
}
function renderHeroBg() {
  if (!_currentBgArgs) return;
  const { url, size, px, py, rot, fill } = _currentBgArgs;
  const heroEl = document.querySelector('.hero');
  if (heroEl) heroEl.style.backgroundColor = fill || '';
  const heroBg = document.getElementById('hero-bg');
  const heroImg = document.getElementById('hero-bg-img');
  if (!heroBg || !heroImg) return;
  if (!url) { heroBg.classList.remove('active'); heroImg.removeAttribute('src'); heroImg.style.cssText = ''; return; }
  heroBg.classList.add('active');
  if (heroImg.getAttribute('src') !== url) heroImg.src = url;
  if (!heroImg.complete || !heroImg.naturalWidth) { heroImg.onload = () => { heroImg.onload = null; renderHeroBg(); }; return; }
  const rect = heroEl.getBoundingClientRect();
  const iw = heroImg.naturalWidth, ih = heroImg.naturalHeight;
  if (!iw || !ih || !rect.width || !rect.height) return;
  const coverScale = Math.max(rect.width / iw, rect.height / ih);
  const factor = (size || 100) / 100;
  const w = iw * coverScale * factor;
  const h = ih * coverScale * factor;
  heroImg.style.width = w + 'px';
  heroImg.style.height = h + 'px';
  heroImg.style.left = ((rect.width - w) / 2 + (rect.width * (px || 0) / 100)) + 'px';
  heroImg.style.top = ((rect.height - h) / 2 + (rect.height * (py || 0) / 100)) + 'px';
  heroImg.style.transform = `rotate(${rot || 0}deg)`;
}
window.addEventListener('resize', renderHeroBg);
window.addEventListener('orientationchange', renderHeroBg);
if (typeof ResizeObserver !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const heroEl = document.querySelector('.hero');
    if (heroEl) new ResizeObserver(() => renderHeroBg()).observe(heroEl);
  });
}

function renderHero() {
  applyHeroBg(heroData.bg || '', heroData.bgSize ?? 100, heroData.bgPosX ?? 0, heroData.bgPosY ?? 0, heroData.bgRotation ?? 0, heroData.bgFill || '');
  renderHeroSchedule();
}

function renderHeroSchedule() {
  const el = document.getElementById('hero-schedule');
  if (!el) return;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const info = getDayInfo(dateStr);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateLine = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const liveOpen = !!info.open && nowMin >= parseHHMM(info.start) && nowMin < parseHHMM(info.end);
  const dotClass = liveOpen ? 'open' : 'closed';
  const statusLabel = liveOpen ? 'Open Today' : 'Closed Today';
  const hoursLine = info.open ? `${fmtHeroTime(info.start)} – ${fmtHeroTime(info.end)}` : '';
  el.innerHTML = `
    <div class="hero-sched-date">${dateLine}</div>
    <div class="hero-sched-status">
      <span class="hero-sched-dot ${dotClass}"></span>
      <span class="hero-sched-label">${statusLabel}</span>
    </div>
    ${hoursLine ? `<div class="hero-sched-hours">${hoursLine}</div>` : ''}
  `;
}

function scheduleNextHeroScheduleRefresh() {
  const now = new Date();
  const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => { renderHeroSchedule(); scheduleNextHeroScheduleRefresh(); }, Math.max(1000, ms));
}
scheduleNextHeroScheduleRefresh();

// ── SLIDER ──
const SLIDER_INTERVAL_MS = 10000;
let sliderIndex = 0;
let sliderTimer = null;

function renderSlider() {
  const sec = document.getElementById('slider');
  const track = document.getElementById('slider-track');
  const dots = document.getElementById('slider-dots');
  if (!sec || !track || !dots) return;
  if (!sliderSlides.length) {
    track.innerHTML = ''; dots.innerHTML = '';
    if (isAdmin) {
      sec.style.display = ''; sec.classList.add('empty');
      if (!sec.querySelector('.slider-empty-msg')) {
        const msg = document.createElement('div');
        msg.className = 'slider-empty-msg';
        msg.textContent = 'No slides yet. Click "Edit Slider" to add one.';
        sec.appendChild(msg);
      }
    } else { sec.style.display = 'none'; }
    stopSliderAutoplay(); return;
  }
  sec.classList.remove('empty');
  const stale = sec.querySelector('.slider-empty-msg');
  if (stale) stale.remove();
  sec.style.display = '';
  track.innerHTML = sliderSlides.map(s => {
    const safeUrl = s.bg ? String(s.bg).replace(/'/g, '%27') : '';
    const bgImg = safeUrl ? `background-image:url('${safeUrl}');` : '';
    return `<div class="slider-slide" style="background:${s.bgColor||'#1a1612'};color:${s.textColor||'#ffffff'}">
      ${s.bg ? `<div class="slider-slide-bg" style="${bgImg}"></div>` : ''}
      <div class="slider-slide-content">${s.content || ''}</div>
    </div>`;
  }).join('');
  dots.innerHTML = sliderSlides.map((_, i) =>
    `<button class="slider-dot${i===0?' active':''}" onclick="setSlide(${i})" aria-label="Slide ${i+1}"></button>`
  ).join('');
  const showNav = sliderSlides.length > 1;
  document.getElementById('slider-prev').style.display = showNav ? '' : 'none';
  document.getElementById('slider-next').style.display = showNav ? '' : 'none';
  dots.style.display = showNav ? '' : 'none';
  sliderIndex = Math.min(sliderIndex, sliderSlides.length - 1);
  applySliderPosition();
  if (showNav) startSliderAutoplay(); else stopSliderAutoplay();
}

function applySliderPosition() {
  const track = document.getElementById('slider-track');
  if (!track) return;
  track.style.transform = `translateX(-${sliderIndex * 100}%)`;
  document.querySelectorAll('.slider-dot').forEach((d, i) => d.classList.toggle('active', i === sliderIndex));
}

function setSlide(i) {
  if (!sliderSlides.length) return;
  sliderIndex = ((i % sliderSlides.length) + sliderSlides.length) % sliderSlides.length;
  applySliderPosition();
  startSliderAutoplay();
}
function nextSlide() { setSlide(sliderIndex + 1); }
function prevSlide() { setSlide(sliderIndex - 1); }
function startSliderAutoplay() {
  stopSliderAutoplay();
  if (sliderSlides.length < 2) return;
  sliderTimer = setInterval(nextSlide, SLIDER_INTERVAL_MS);
}
function stopSliderAutoplay() {
  if (sliderTimer) { clearInterval(sliderTimer); sliderTimer = null; }
}

// ── IMAGE DROP ZONE ──
function setupDropZone(zoneId, urlInputId) {
  const zone = document.getElementById(zoneId);
  if (!zone || zone._dropInitialized) return;
  zone._dropInitialized = true;
  const emptyState = zone.querySelector('.img-drop-empty');
  const previewWrap = zone.querySelector('.img-drop-preview-wrap');
  const previewImg = zone.querySelector('.img-drop-preview');
  const loadingEl = zone.querySelector('.img-drop-loading');
  const removeBtn = zone.querySelector('.img-drop-remove');
  const urlInput = zone.querySelector('.img-drop-url');
  const fileInput = zone.querySelector('.img-drop-file');
  const orText = zone.querySelector('.img-drop-or');

  function showState(state) {
    emptyState.style.display = state === 'empty' ? '' : 'none';
    previewWrap.style.display = state === 'preview' ? '' : 'none';
    loadingEl.style.display = state === 'loading' ? '' : 'none';
    orText.style.display = state === 'loading' ? 'none' : '';
    urlInput.style.display = state === 'loading' ? 'none' : '';
  }
  function showPreview(url) {
    previewImg.src = url; urlInput.value = url; showState('preview');
    zone.dispatchEvent(new CustomEvent('imageChanged', { detail: { url } }));
  }
  function clearPreview() {
    previewImg.src = ''; urlInput.value = ''; showState('empty');
    zone.dispatchEvent(new CustomEvent('imageChanged', { detail: { url: '' } }));
  }

  fileInput.addEventListener('click', (e) => e.stopPropagation());
  removeBtn.addEventListener('click', (e) => { e.stopPropagation(); clearPreview(); });
  urlInput.addEventListener('click', (e) => e.stopPropagation());
  let urlDebounce = null;
  urlInput.addEventListener('input', () => {
    clearTimeout(urlDebounce);
    urlDebounce = setTimeout(() => {
      const url = urlInput.value.trim();
      if (url && (url.startsWith('http') || url.startsWith('/uploads'))) showPreview(url);
      else if (!url) showState('empty');
    }, 400);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file && file.type.startsWith('image/')) uploadFile(file);
    fileInput.value = '';
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) uploadFile(file);
  });

  async function uploadFile(file) {
    showState('loading');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ image: base64 }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Upload failed'); clearPreview(); return; }
      showPreview(data.url);
    } catch(e) { alert('Upload failed — please try again.'); clearPreview(); }
  }

  zone._setValue = (url) => { if (url) showPreview(url); else clearPreview(); };
  zone._getValue = () => urlInput.value.trim();
}

function setDropZoneValue(zoneId, url) {
  const zone = document.getElementById(zoneId);
  if (zone && zone._setValue) zone._setValue(url);
}
function getDropZoneValue(zoneId) {
  const zone = document.getElementById(zoneId);
  return zone && zone._getValue ? zone._getValue() : '';
}

// ── MODAL HELPERS ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── TOAST ──
function showToast(title, body, duration = 5000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
  toast.onclick = () => { if(typeof openOrders==='function') openOrders(); toast.remove(); };
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, duration);
}

function playNotificationBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

// ── AUTH ──
function openLoginModal() {
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.remove('show');
  openModal('login-modal');
  setTimeout(() => document.getElementById('login-password').focus(), 100);
}

async function doLogin() {
  const pw = document.getElementById('login-password').value;
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('login-error').textContent = data.error || 'Login failed';
      document.getElementById('login-error').classList.add('show');
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
      return;
    }
    adminToken = data.token;
    localStorage.setItem('pouches-admin-token', adminToken);
    closeModal('login-modal');
    completeLogin();
  } catch(e) {
    document.getElementById('login-error').textContent = 'Network error';
    document.getElementById('login-error').classList.add('show');
  }
}

function completeLogin() {
  isAdmin = true;
  document.body.classList.add('admin-mode');
  if (typeof renderGrid === 'function') renderGrid();
  renderSlider();
  connectSSE();
}

async function handleAuthFailure() {
  adminToken = null;
  localStorage.removeItem('pouches-admin-token');
  isAdmin = false;
  document.body.classList.remove('admin-mode');
  if (typeof adminOrders !== 'undefined') adminOrders = [];
  if (typeof closeOrders === 'function') closeOrders();
  connectSSE();
  alert('Your admin session expired. Please log in again.');
  openLoginModal();
}

async function logout() {
  try { await fetch('/api/logout', { method: 'POST', headers: authHeaders() }); } catch(e) {}
  adminToken = null;
  localStorage.removeItem('pouches-admin-token');
  isAdmin = false;
  document.body.classList.remove('admin-mode');
  if (typeof adminOrders !== 'undefined') adminOrders = [];
  if (typeof renderGrid === 'function') renderGrid();
  renderSlider();
  connectSSE();
}

// ── SHOP FILTERS (customer) ──
function renderShopFilterBar() {
  const bar = document.getElementById('shop-filter-bar');
  const panel = document.getElementById('shop-filter-panel');
  const hasAny = filterDefs && filterDefs.some(f => (f.options || []).length > 0);
  if (!bar || !panel) return;
  if (!hasAny) { bar.style.display = 'none'; panel.classList.remove('open'); panel.innerHTML = ''; return; }
  bar.style.display = 'flex';
  panel.innerHTML = filterDefs.filter(f => (f.options || []).length > 0).map(f => {
    const selected = activeFilters[f.name] || new Set();
    return `<div class="shop-filter-group">
      <div class="shop-filter-group-title">${esc(f.name)}</div>
      <div class="shop-filter-options">
        ${f.options.map(o => `<span class="shop-filter-chip ${selected.has(o) ? 'active' : ''}" onclick="toggleShopFilter('${esc(f.name).replace(/'/g,"\\'")}','${esc(o).replace(/'/g,"\\'")}'">${esc(o)}</span>`).join('')}
      </div>
    </div>`;
  }).join('');
  const total = Object.values(activeFilters).reduce((s, set) => s + set.size, 0);
  const count = document.getElementById('shop-filter-count');
  const clear = document.getElementById('shop-filter-clear');
  if (count) { count.textContent = total; count.style.display = total > 0 ? '' : 'none'; }
  if (clear) clear.style.display = total > 0 ? '' : 'none';
}

function toggleShopFilterPanel() {
  document.getElementById('shop-filter-panel').classList.toggle('open');
}

function toggleShopFilter(name, option) {
  if (!activeFilters[name]) activeFilters[name] = new Set();
  if (activeFilters[name].has(option)) activeFilters[name].delete(option);
  else activeFilters[name].add(option);
  if (!activeFilters[name].size) delete activeFilters[name];
  renderShopFilterBar();
  if (typeof renderGrid === 'function') renderGrid();
}

function clearShopFilters() {
  activeFilters = {};
  renderShopFilterBar();
  if (typeof renderGrid === 'function') renderGrid();
}

function productMatchesActiveFilters(p) {
  const keys = Object.keys(activeFilters);
  if (!keys.length) return true;
  const pf = (p.filters && typeof p.filters === 'object') ? p.filters : {};
  for (const k of keys) {
    const set = activeFilters[k];
    if (!set || !set.size) continue;
    if (!set.has(pf[k])) return false;
  }
  return true;
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  // Wire slider arrows
  const prev = document.getElementById('slider-prev');
  const next = document.getElementById('slider-next');
  if (prev) prev.addEventListener('click', prevSlide);
  if (next) next.addEventListener('click', nextSlide);

  // Wire modal overlays to close on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });

});
