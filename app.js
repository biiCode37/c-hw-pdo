// Jadwal Keberangkatan - Engine Multi-Rute Simultan
(function(){
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'jadwalApp_multi_v5';
  const LEGACY_STORAGE_KEY = 'jadwalApp_v4';

  const ROUTE_PALETTE = ['#FFB020', '#6FB4FF', '#50E3C2', '#E066FF', '#FF7A45', '#FFE066', '#FF5370', '#82AAFF'];
  const DEFAULT_UNITS_JAK115 = [1000, 1001, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 756, 88, 92, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 36, 2, 4, 79, 97, 3];
  const DEFAULT_UNITS_JAK88 = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 112, 114];

  function createRouteObject(id, name, overrides = {}){
    const unitsSource = overrides.masterUnits || (name === 'JAK.88' ? DEFAULT_UNITS_JAK88 : DEFAULT_UNITS_JAK115);
    const seenIds = new Set();
    const masterUnits = unitsSource.map((n, i) => {
      let num = '';
      let active = true;
      let existingId = null;

      if (typeof n === 'object' && n !== null){
        num = String(n.number !== undefined ? n.number : (n.num !== undefined ? n.num : i + 1));
        active = n.active !== false;
        if (n.id && String(n.id).trim() && String(n.id) !== 'undefined' && String(n.id) !== 'null'){
          existingId = String(n.id).trim();
        }
      } else {
        num = String(n);
        active = true;
      }

      // Ensure every unit has a non-empty, strictly unique ID
      let finalId = existingId;
      if (!finalId || seenIds.has(finalId)){
        finalId = 'u_' + num.replace(/[^a-zA-Z0-9]/g, '_') + '_' + i + '_' + Math.random().toString(36).slice(2, 7);
      }
      seenIds.add(finalId);

      return { id: finalId, number: num, active };
    });

    const cleanOverrides = Object.assign({}, overrides);
    delete cleanOverrides.masterUnits;
    delete cleanOverrides.departureOrder;

    let departureOrder = [];
    if (Array.isArray(overrides.departureOrder) && overrides.departureOrder.length > 0){
      departureOrder = overrides.departureOrder.map(ord => {
        const found = masterUnits.find(u => String(u.id) === String(ord) || String(u.number) === String(ord));
        return found ? found.id : null;
      }).filter(Boolean);
    }
    masterUnits.forEach(u => {
      if (u.active && !departureOrder.includes(u.id)){
        departureOrder.push(u.id);
      }
    });

    const route = Object.assign({
      id: id || ('route_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      name: name || 'Rute Baru',
      color: overrides.color || ROUTE_PALETTE[0],
      jamMulai: '05:00',
      jamSelesai: '22:00',
      ritase: 8,
      groupOrder: 'fast-first',
      peakEnabled: false,
      peak1Start: '05:00',
      peak1End: '08:00',
      peak1Interval: 2,
      peak2Start: '17:00',
      peak2End: '19:00',
      peak2Interval: 3,
      alarmEnabled: true,
      alarmDuration: 8,
      alarmPrepSeconds: cleanOverrides.alarmPrepSeconds !== undefined ? Number(cleanOverrides.alarmPrepSeconds) : 10,
      committedSchedule: null,
      scheduleDirty: false,
      lastShift: '1 (Pagi)',
      lastRitaseFrom: 1,
      activeInSchedule: cleanOverrides.activeInSchedule !== undefined ? !!cleanOverrides.activeInSchedule : true
    }, cleanOverrides, {
      masterUnits: masterUnits,
      departureOrder: departureOrder
    });

    return route;
  }

  function defaultState(){
    const r1 = createRouteObject('r_jak115', 'JAK.115', {
      color: '#FFB020',
      jamMulai: '05:00',
      jamSelesai: '22:00',
      ritase: 8,
      peakEnabled: false
    });
    const r2 = createRouteObject('r_jak88', 'JAK.88', {
      color: '#6FB4FF',
      jamMulai: '05:30',
      jamSelesai: '21:30',
      ritase: 6,
      masterUnits: DEFAULT_UNITS_JAK88,
      peakEnabled: true,
      peak1Start: '06:00',
      peak1End: '08:30',
      peak1Interval: 4,
      peak2Start: '16:30',
      peak2End: '19:00',
      peak2Interval: 5
    });
    return {
      activeRouteId: r1.id,
      routes: [r1, r2],
      papanMode: 'active'
    };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw){
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.routes) && parsed.routes.length > 0){
          parsed.routes = parsed.routes.map((r, idx) => {
            const color = r.color || ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
            return createRouteObject(r.id, r.name, Object.assign({}, r, { color }));
          });
          if (!parsed.activeRouteId || !parsed.routes.some(r => r.id === parsed.activeRouteId)){
            parsed.activeRouteId = parsed.routes[0].id;
          }
          if (!parsed.papanMode) parsed.papanMode = 'active';
          return parsed;
        }
      }

      // Legacy migration from v4 (single route)
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw){
        const legacy = JSON.parse(legacyRaw);
        const r1Name = legacy.activeRouteName || legacy.lastKodeRute || 'JAK.115';
        const r1 = createRouteObject('r_migrated_1', r1Name, {
          color: '#FFB020',
          jamMulai: legacy.jamMulai || '05:00',
          jamSelesai: legacy.jamSelesai || '22:00',
          ritase: legacy.ritase || 8,
          groupOrder: legacy.groupOrder || 'fast-first',
          peakEnabled: !!legacy.peakEnabled,
          peak1Start: legacy.peak1Start || '05:00',
          peak1End: legacy.peak1End || '08:00',
          peak1Interval: legacy.peak1Interval || 2,
          peak2Start: legacy.peak2Start || '17:00',
          peak2End: legacy.peak2End || '19:00',
          peak2Interval: legacy.peak2Interval || 3,
          alarmEnabled: legacy.alarmEnabled !== false,
          alarmDuration: legacy.alarmDuration || 8,
          alarmPrepSeconds: legacy.alarmPrepSeconds !== undefined ? Number(legacy.alarmPrepSeconds) : 10,
          masterUnits: Array.isArray(legacy.masterUnits) ? legacy.masterUnits : undefined,
          departureOrder: Array.isArray(legacy.departureOrder) ? legacy.departureOrder : undefined,
          committedSchedule: legacy.committedSchedule || null,
          scheduleDirty: !!legacy.scheduleDirty,
          lastShift: legacy.lastShift || '1 (Pagi)'
        });

        const routes = [r1];
        if (Array.isArray(legacy.routes)){
          legacy.routes.forEach((preset, pIdx) => {
            if (preset.name && preset.name.toLowerCase() !== r1Name.toLowerCase()){
              const color = ROUTE_PALETTE[(pIdx + 1) % ROUTE_PALETTE.length];
              const pUnits = Array.isArray(preset.units) ? preset.units.map(u => ({ number: String(u.number), active: u.active })) : [];
              const pr = createRouteObject('r_migrated_' + (pIdx + 2), preset.name, {
                color,
                masterUnits: pUnits,
                jamMulai: '05:30',
                jamSelesai: '21:30',
                ritase: 6
              });
              routes.push(pr);
            }
          });
        }
        return {
          activeRouteId: r1.id,
          routes: routes,
          papanMode: 'active'
        };
      }

      return defaultState();
    }catch(e){
      console.warn('Gagal memuat state, menggunakan default:', e);
      return defaultState();
    }
  }

  function saveState(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){}
  }

  let state = loadState();

  function getActiveRoute(){
    if (!state.routes || state.routes.length === 0){
      const def = defaultState();
      state.routes = def.routes;
      state.activeRouteId = def.activeRouteId;
    }
    let cur = state.routes.find(r => r.id === state.activeRouteId && r.activeInSchedule !== false);
    if (!cur){
      cur = state.routes.find(r => r.activeInSchedule !== false);
      if (!cur){
        state.routes[0].activeInSchedule = true;
        cur = state.routes[0];
      }
      state.activeRouteId = cur.id;
    }
    return cur;
  }

  function showToast(msg, type){
    const isError = type === 'error';
    if (typeof Swal === 'undefined'){ window.alert(msg); return; }
    Swal.fire({
      toast: true,
      position: 'top',
      text: msg,
      showConfirmButton: false,
      timer: isError ? 3200 : 2000,
      timerProgressBar: true,
      background: isError ? '#2A1512' : '#1D222A',
      color: isError ? '#FFD6D1' : '#FFB020',
      iconColor: '#FF6B5E',
      icon: isError ? 'error' : undefined,
      customClass: { popup: 'jb-toast' + (isError ? ' jb-toast-error' : '') }
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function hexToRgba(hex, alpha = 0.2){
    if (!hex || hex[0] !== '#') return 'rgba(255,176,32,' + alpha + ')';
    let c = hex.slice(1);
    if (c.length === 3) c = c.split('').map(x => x+x).join('');
    const num = parseInt(c, 16);
    return 'rgba(' + ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + alpha + ')';
  }

  function markDirtyIfCommitted(route = getActiveRoute()){
    if (route && route.committedSchedule && route.committedSchedule.rows && route.committedSchedule.rows.length){
      route.scheduleDirty = true;
      saveState();
      renderDirtyBanner();
      renderRouteBar();
    }
  }

  function renderDirtyBanner(){
    const cur = getActiveRoute();
    $('dirtyBanner').classList.toggle('show', !!cur.scheduleDirty);
  }

  // ===== UNIVERSAL FLOATING TOOLTIP & PRESS-AND-HOLD SYSTEM =====
  const tipEl = document.createElement('div');
  tipEl.className = 'floating-tip';
  tipEl.id = 'floatingTip';
  document.body.appendChild(tipEl);
  let hideTipTimer = null;

  function showFloatingTip(text, targetEl){
    if (!text || !targetEl) return;
    clearTimeout(hideTipTimer);
    tipEl.textContent = text;
    tipEl.classList.add('show');
    const rect = targetEl.getBoundingClientRect();
    const tipWidth = tipEl.offsetWidth || 160;
    let left = rect.left + (rect.width / 2) - (tipWidth / 2);
    left = Math.max(8, Math.min(window.innerWidth - tipWidth - 8, left));
    let top = rect.top - (tipEl.offsetHeight || 28) - 6;
    if (top < 10) top = rect.bottom + 6;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
    hideTipTimer = setTimeout(() => { tipEl.classList.remove('show'); }, 2200);
  }

  function hideFloatingTip(){
    clearTimeout(hideTipTimer);
    tipEl.classList.remove('show');
  }

  // Tap on info button (.tip-btn)
  document.addEventListener('click', (e) => {
    const tipBtn = e.target.closest('.tip-btn');
    if (tipBtn){
      e.preventDefault();
      e.stopPropagation();
      showFloatingTip(tipBtn.getAttribute('data-tip'), tipBtn);
      return;
    }
    hideFloatingTip();
  });

  // Long-press / hold (280ms) on any icon with data-tooltip
  let holdTimer = null;
  let holdTarget = null;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (!el) return;
    holdTarget = el;
    holdTimer = setTimeout(() => {
      if (holdTarget === el){
        showFloatingTip(el.getAttribute('data-tooltip'), el);
      }
    }, 280);
  }, { passive: true });

  document.addEventListener('pointerup', () => { clearTimeout(holdTimer); holdTarget = null; }, { passive: true });
  document.addEventListener('pointercancel', () => { clearTimeout(holdTimer); holdTarget = null; hideFloatingTip(); }, { passive: true });
  document.addEventListener('pointermove', () => { clearTimeout(holdTimer); }, { passive: true });

  // ===== TAB SWITCHING (MOBILE BOTTOM NAV & TOP TABS) =====
  const tabJadwalBtn = $('tabJadwalBtn'), tabUnitBtn = $('tabUnitBtn'), tabOrderBtn = $('tabOrderBtn'), tabRouteBtn = $('tabRouteBtn');
  const panelJadwal = $('panelJadwal'), panelUnit = $('panelUnit'), panelOrder = $('panelOrder'), panelRoute = $('panelRoute');
  const bnavJadwal = $('bnavJadwal'), bnavUnit = $('bnavUnit'), bnavOrder = $('bnavOrder'), bnavRoute = $('bnavRoute');

  function switchTab(tab){
    if (tabJadwalBtn) tabJadwalBtn.classList.toggle('active', tab==='jadwal');
    if (tabUnitBtn) tabUnitBtn.classList.toggle('active', tab==='unit');
    if (tabOrderBtn) tabOrderBtn.classList.toggle('active', tab==='order');
    if (tabRouteBtn) tabRouteBtn.classList.toggle('active', tab==='route');

    if (bnavJadwal) bnavJadwal.classList.toggle('active', tab==='jadwal');
    if (bnavUnit) bnavUnit.classList.toggle('active', tab==='unit');
    if (bnavOrder) bnavOrder.classList.toggle('active', tab==='order');
    if (bnavRoute) bnavRoute.classList.toggle('active', tab==='route');

    if (panelJadwal) panelJadwal.classList.toggle('active', tab==='jadwal');
    if (panelUnit) panelUnit.classList.toggle('active', tab==='unit');
    if (panelOrder) panelOrder.classList.toggle('active', tab==='order');
    if (panelRoute) panelRoute.classList.toggle('active', tab==='route');

    if (tab==='order') renderOrderList();
    if (tab==='unit') renderUnitList();
    if (tab==='route') renderRouteList();
    window.scrollTo({top:0, behavior:'instant'});
  }

  if (tabJadwalBtn) tabJadwalBtn.addEventListener('click', () => switchTab('jadwal'));
  if (tabUnitBtn) tabUnitBtn.addEventListener('click', () => switchTab('unit'));
  if (tabOrderBtn) tabOrderBtn.addEventListener('click', () => switchTab('order'));
  if (tabRouteBtn) tabRouteBtn.addEventListener('click', () => switchTab('route'));

  if (bnavJadwal) bnavJadwal.addEventListener('click', () => switchTab('jadwal'));
  if (bnavUnit) bnavUnit.addEventListener('click', () => switchTab('unit'));
  if (bnavOrder) bnavOrder.addEventListener('click', () => switchTab('order'));
  if (bnavRoute) bnavRoute.addEventListener('click', () => switchTab('route'));

  const goToUnitTabBtn = $('goToUnitTab');
  if (goToUnitTabBtn) goToUnitTabBtn.addEventListener('click', () => switchTab('unit'));

  // ===== ROUTE NAVIGATION BAR & ACTIONS =====
  const routeTabsContainer = $('routeTabsContainer');
  const arsBadge = $('arsBadge');
  const arsColorDot = $('arsColorDot');
  const arsNameText = $('arsNameText');
  const arsMetaText = $('arsMetaText');
  const addRouteTopBtn = $('addRouteTopBtn');
  const renameRouteBtn = $('renameRouteBtn');
  const dupRouteBtn = $('dupRouteBtn');
  const delRouteBtn = $('delRouteBtn');
  const unitCardTitle = $('unitCardTitle');

  function removeRouteFromSchedule(routeId){
    const schedRoutes = state.routes.filter(r => r.activeInSchedule !== false);
    if (schedRoutes.length <= 1){
      showToast('Minimal 1 rute harus tetap tampil di jadwal. Silakan tambah/aktifkan rute lain terlebih dahulu.', 'error');
      return;
    }
    const target = state.routes.find(r => r.id === routeId);
    if (!target) return;
    target.activeInSchedule = false;
    saveState();

    if (state.activeRouteId === routeId){
      const remaining = state.routes.find(r => r.activeInSchedule !== false);
      if (remaining){
        switchActiveRoute(remaining.id);
      }
    } else {
      renderRouteBar();
    }
    showToast('Rute "' + target.name + '" dikeluarkan dari jadwal (tetap tersimpan di tab Rute)');
  }

  function openScheduleRoutePicker(){
    const hiddenRoutes = state.routes.filter(r => r.activeInSchedule === false);
    if (hiddenRoutes.length === 0){
      promptAddNewRoute();
      return;
    }

    let html = '<div style="text-align:left; font-size:13px; color:#ECEAE4;">';
    html += '<p style="margin-bottom:12px; color:#8E9AA8; font-size:12px;">Pilih rute tersimpan untuk ditampilkan kembali di jadwal keberangkatan:</p>';
    html += '<div style="display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; margin-bottom:14px;">';

    hiddenRoutes.forEach(r => {
      const uCount = r.masterUnits.filter(u => u.active).length;
      html += '<div style="display:flex; align-items:center; justify-content:space-between; background:#14171C; padding:9px 12px; border-radius:8px; border:1px solid #282E38;">' +
        '<div style="display:flex; align-items:center; gap:8px;">' +
          '<span style="width:10px; height:10px; border-radius:50%; background:' + (r.color || '#FFB020') + ';"></span>' +
          '<div>' +
            '<div style="font-weight:700; font-family:\'Space Mono\', monospace; font-size:13px;">' + escapeHtml(r.name) + '</div>' +
            '<div style="font-size:11px; color:#8E9AA8;">' + r.jamMulai + '-' + r.jamSelesai + ' &middot; ' + r.ritase + ' Rit &middot; ' + uCount + ' unit</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn-picker-add" data-id="' + r.id + '" style="padding:6px 12px; border-radius:6px; background:#FFB020; color:#14171C; font-weight:700; font-size:11.5px; border:none; cursor:pointer;">+ Tampilkan</button>' +
      '</div>';
    });
    html += '</div>';

    html += '<div style="display:flex; gap:8px; border-top:1px solid #282E38; padding-top:12px;">' +
      '<button type="button" id="pickerShowAllBtn" style="flex:1; padding:9px 8px; border-radius:7px; background:#222832; border:1px solid #333A46; color:#ECEAE4; font-size:12px; font-weight:600; cursor:pointer;">&#127760; Tampilkan Semua</button>' +
      '<button type="button" id="pickerCreateNewBtn" style="flex:1; padding:9px 8px; border-radius:7px; background:#FFB020; border:none; color:#14171C; font-size:12px; font-weight:700; cursor:pointer;">+ Rute Baru</button>' +
    '</div>';
    html += '</div>';

    Swal.fire({
      title: 'Kelola Rute di Jadwal',
      html: html,
      showConfirmButton: false,
      showCloseButton: true,
      background: '#1D222A',
      color: '#ECEAE4',
      didOpen: () => {
        const modal = Swal.getPopup();
        modal.querySelectorAll('.btn-picker-add').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const target = state.routes.find(r => r.id === id);
            if (target){
              target.activeInSchedule = true;
              saveState();
              switchActiveRoute(target.id);
              Swal.close();
              showToast('Rute "' + target.name + '" ditampilkan di jadwal');
            }
          });
        });
        const showAllBtn = modal.querySelector('#pickerShowAllBtn');
        if (showAllBtn){
          showAllBtn.addEventListener('click', () => {
            state.routes.forEach(r => { r.activeInSchedule = true; });
            saveState();
            renderRouteBar();
            Swal.close();
            showToast('Semua rute sekarang aktif di jadwal (Multi-Rute Terminal)');
          });
        }
        const createNewBtn = modal.querySelector('#pickerCreateNewBtn');
        if (createNewBtn){
          createNewBtn.addEventListener('click', () => {
            Swal.close();
            promptAddNewRoute();
          });
        }
      }
    });
  }

  function renderRouteBar(){
    const cur = getActiveRoute();
    routeTabsContainer.innerHTML = '';

    const schedRoutes = state.routes.filter(r => r.activeInSchedule !== false);
    const hiddenRoutes = state.routes.filter(r => r.activeInSchedule === false);

    schedRoutes.forEach(r => {
      const activeCount = r.masterUnits.filter(u => u.active).length;
      const pill = document.createElement('div');
      pill.className = 'route-tab-pill' + (r.id === cur.id ? ' active' : '');
      pill.setAttribute('data-id', r.id);

      let statusClass = 'none';
      if (r.committedSchedule && r.committedSchedule.rows && r.committedSchedule.rows.length){
        statusClass = r.scheduleDirty ? 'dirty' : 'ready';
      }

      const closeBtnHtml = schedRoutes.length > 1
        ? '<button type="button" class="rtp-close" data-id="' + r.id + '" data-tooltip="Keluarkan rute ' + escapeHtml(r.name) + ' dari jadwal" aria-label="Keluarkan rute">&times;</button>'
        : '';

      pill.innerHTML =
        '<span class="rtp-color" style="background:' + (r.color || '#FFB020') + '"></span>' +
        '<span class="rtp-name">' + escapeHtml(r.name) + '</span>' +
        '<span class="rtp-badge">' + activeCount + 'u &middot; ' + r.ritase + 'r</span>' +
        '<span class="rtp-status ' + statusClass + '" title="' + (statusClass === 'ready' ? 'Jadwal Siap' : (statusClass === 'dirty' ? 'Perlu Dihitung Ulang' : 'Belum Ada Jadwal')) + '"></span>' +
        closeBtnHtml;

      pill.addEventListener('click', (e) => {
        if (e.target.closest('.rtp-close')) return;
        if (state.activeRouteId !== r.id){
          switchActiveRoute(r.id);
        }
      });

      const closeBtn = pill.querySelector('.rtp-close');
      if (closeBtn){
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          removeRouteFromSchedule(r.id);
        });
      }

      routeTabsContainer.appendChild(pill);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'route-tab-add';
    addBtn.textContent = '+';
    addBtn.setAttribute('data-tooltip', hiddenRoutes.length > 0 ? 'Kelola rute di jadwal (' + hiddenRoutes.length + ' tersimpan)' : 'Tambah rute baru');
    addBtn.setAttribute('aria-label', 'Tambah rute ke jadwal');
    addBtn.addEventListener('click', openScheduleRoutePicker);
    routeTabsContainer.appendChild(addBtn);

    // Active strip details
    arsColorDot.style.background = cur.color || '#FFB020';
    arsNameText.textContent = cur.name;
    const activeUnits = cur.masterUnits.filter(u => u.active).length;
    arsMetaText.innerHTML = cur.jamMulai + '&ndash;' + cur.jamSelesai + ' &middot; ' + cur.ritase + 'R &middot; ' + activeUnits + 'u';

    if (unitCardTitle) unitCardTitle.textContent = 'Armada: ' + cur.name;
    renderSubRouteBars();
    renderRouteList();
  }

  function renderSubRouteBars(){
    const unitBar = $('unitRouteBar');
    const orderBar = $('orderRouteBar');
    const cur = getActiveRoute();
    const schedRoutes = state.routes.filter(r => r.activeInSchedule !== false);
    [unitBar, orderBar].forEach(bar => {
      if (!bar) return;
      bar.innerHTML = '';
      schedRoutes.forEach(r => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sub-route-pill' + (r.id === cur.id ? ' active' : '');
        btn.innerHTML = '<span class="rtp-color" style="background:' + (r.color || '#FFB020') + '"></span><span>' + escapeHtml(r.name) + '</span>';
        btn.addEventListener('click', () => switchActiveRoute(r.id));
        bar.appendChild(btn);
      });
    });
  }

  function switchActiveRoute(routeId){
    state.activeRouteId = routeId;
    if (typeof selectedUnitIds !== 'undefined') selectedUnitIds.clear();
    saveState();
    renderRouteBar();
    hydrateInputs();
    renderUnitList();
    updateActiveSummary();
    renderOrderList();

    const cur = getActiveRoute();
    if (cur.committedSchedule && cur.committedSchedule.rows && cur.committedSchedule.rows.length){
      lastSchedule = reconstructDisplaySchedule(cur);
      render(lastSchedule);
      if (resultSection) resultSection.style.display = 'block';
    } else {
      lastSchedule = null;
      if (statTotal) statTotal.textContent = '—';
      if (statDurasi) statDurasi.textContent = '—';
      if (statUnit) statUnit.textContent = '—';
      if (patternNote) patternNote.textContent = '';
      if (boardBody) {
        boardBody.innerHTML = '<div style="padding:28px 16px; text-align:center; color:var(--text-muted); font-size:12px;">' +
          '<div style="font-size:24px; margin-bottom:6px;">📋</div>' +
          '<div style="font-weight:700; color:var(--text); margin-bottom:4px;">Belum Ada Jadwal untuk ' + escapeHtml(cur.name) + '</div>' +
          '<div style="margin-bottom:10px;">Klik tombol "Buat Jadwal" untuk menghitung keberangkatan.</div>' +
          '<button type="button" class="btn-mini amber" id="quickGenEmptyBtn" style="padding:7px 14px; font-weight:700; cursor:pointer;">⚡ Buat Jadwal Sekarang</button>' +
        '</div>';
        const emptyBtn = boardBody.querySelector('#quickGenEmptyBtn');
        if (emptyBtn && generateBtn) emptyBtn.addEventListener('click', () => generateBtn.click());
      }
      if (resultSection) resultSection.style.display = 'block';
    }
    renderDirtyBanner();
    clearError();
    refreshPapanIfOpen();
  }

  function promptAddNewRoute(){
    const defaultNum = state.routes.length + 1;
    const defaultName = 'JAK.' + (defaultNum > 9 ? defaultNum : '0' + defaultNum);
    const doCreate = (name) => {
      if (!name) return;
      const color = ROUTE_PALETTE[state.routes.length % ROUTE_PALETTE.length];
      const newRoute = createRouteObject(null, name, { color, jamMulai: '05:00', jamSelesai: '22:00', ritase: 8 });
      state.routes.push(newRoute);
      state.activeRouteId = newRoute.id;
      saveState();
      switchActiveRoute(newRoute.id);
      showToast('Rute "' + name + '" berhasil dibuat');
    };

    if (typeof Swal === 'undefined'){
      const name = window.prompt('Masukkan nama rute baru (contoh: JAK.88):', defaultName);
      if (name && name.trim()) doCreate(name.trim());
      return;
    }

    Swal.fire({
      title: 'Tambah Rute Baru',
      input: 'text',
      inputLabel: 'Nama / Kode Rute',
      inputPlaceholder: 'Contoh: JAK.88',
      inputValue: defaultName,
      showCancelButton: true,
      confirmButtonText: 'Buat Rute',
      cancelButtonText: 'Batal',
      background: '#1D222A',
      color: '#ECEAE4',
      confirmButtonColor: '#FFB020',
      cancelButtonColor: '#333A46',
      inputValidator: (v) => {
        if (!v || !v.trim()) return 'Nama rute tidak boleh kosong';
        if (state.routes.some(r => r.name.toLowerCase() === v.trim().toLowerCase())) return 'Nama rute sudah digunakan';
      }
    }).then(res => {
      if (res.isConfirmed && res.value) doCreate(res.value.trim());
    });
  }

  if (addRouteTopBtn) addRouteTopBtn.addEventListener('click', promptAddNewRoute);
  const saveRouteBtnEl = $('saveRouteBtn');
  if (saveRouteBtnEl) saveRouteBtnEl.addEventListener('click', () => {
    const nameInput = $('newRouteNameInput');
    const val = nameInput ? nameInput.value.trim() : '';
    if (!val){ showToast('Isi nama rute terlebih dahulu', 'error'); return; }
    if (state.routes.some(r => r.name.toLowerCase() === val.toLowerCase())){
      showToast('Nama rute sudah ada', 'error'); return;
    }
    const color = ROUTE_PALETTE[state.routes.length % ROUTE_PALETTE.length];
    const newRoute = createRouteObject(null, val, { color });
    state.routes.push(newRoute);
    state.activeRouteId = newRoute.id;
    saveState();
    if (nameInput) nameInput.value = '';
    switchActiveRoute(newRoute.id);
    showToast('Rute "' + val + '" dibuat');
  });

  if (renameRouteBtn) renameRouteBtn.addEventListener('click', () => {
    const cur = getActiveRoute();
    const doRename = (name) => {
      cur.name = name;
      saveState();
      renderRouteBar();
      showToast('Nama rute diubah menjadi "' + name + '"');
    };

    if (typeof Swal === 'undefined'){
      const name = window.prompt('Ubah nama rute:', cur.name);
      if (name && name.trim()) doRename(name.trim());
      return;
    }

    Swal.fire({
      title: 'Ubah Nama Rute',
      input: 'text',
      inputValue: cur.name,
      showCancelButton: true,
      confirmButtonText: 'Simpan',
      cancelButtonText: 'Batal',
      background: '#1D222A', color: '#ECEAE4',
      confirmButtonColor: '#FFB020', cancelButtonColor: '#333A46',
      inputValidator: (v) => { if (!v || !v.trim()) return 'Nama tidak boleh kosong'; }
    }).then(res => {
      if (res.isConfirmed && res.value) doRename(res.value.trim());
    });
  });

  if (dupRouteBtn) dupRouteBtn.addEventListener('click', () => {
    const cur = getActiveRoute();
    const dupName = cur.name + ' (Salinan)';
    const color = ROUTE_PALETTE[(state.routes.length) % ROUTE_PALETTE.length];
    const cloned = createRouteObject(null, dupName, {
      color,
      jamMulai: cur.jamMulai,
      jamSelesai: cur.jamSelesai,
      ritase: cur.ritase,
      groupOrder: cur.groupOrder,
      peakEnabled: cur.peakEnabled,
      peak1Start: cur.peak1Start,
      peak1End: cur.peak1End,
      peak1Interval: cur.peak1Interval,
      peak2Start: cur.peak2Start,
      peak2End: cur.peak2End,
      peak2Interval: cur.peak2Interval,
      alarmEnabled: cur.alarmEnabled,
      alarmDuration: cur.alarmDuration,
      alarmPrepSeconds: cur.alarmPrepSeconds !== undefined ? cur.alarmPrepSeconds : 10,
      masterUnits: cur.masterUnits.map(u => ({ id: 'u_' + Date.now() + Math.random().toString(36).slice(2,6), number: u.number, active: u.active }))
    });
    cloned.departureOrder = cloned.masterUnits.filter(u => u.active).map(u => u.id);
    state.routes.push(cloned);
    state.activeRouteId = cloned.id;
    saveState();
    switchActiveRoute(cloned.id);
    showToast('Rute diduplikasi');
  });

  if (delRouteBtn) delRouteBtn.addEventListener('click', () => {
    const cur = getActiveRoute();
    const schedRoutes = state.routes.filter(r => r.activeInSchedule !== false);
    if (schedRoutes.length <= 1){
      showToast('Minimal 1 rute harus tetap tampil di jadwal. Silakan gunakan tab "Rute" jika ingin mengelola rute.', 'error');
      return;
    }
    removeRouteFromSchedule(cur.id);
  });

  // Panel Unit: Route Manager List
  const routeListContainer = $('routeListContainer');
  function renderRouteList(){
    if (!routeListContainer) return;
    routeListContainer.innerHTML = '';
    const cur = getActiveRoute();

    state.routes.forEach(r => {
      const activeCount = r.masterUnits.filter(u => u.active).length;
      const isCur = r.id === cur.id;
      const inSched = r.activeInSchedule !== false;
      const card = document.createElement('div');
      card.className = 'route-manage-card';
      if (isCur) card.style.borderColor = r.color || '#FFB020';

      const schedStatus = r.committedSchedule
        ? (r.scheduleDirty ? '<span style="color:var(--amber); font-weight:700;">\u26A0 Perlu Dihitung Ulang</span>' : '<span style="color:#50E3C2; font-weight:700;">\u2713 Jadwal Siap (' + r.committedSchedule.rows.length + ' dep)</span>')
        : '<span style="color:var(--text-muted);">Belum ada jadwal</span>';

      const inSchedBadge = inSched
        ? '<span class="rtp-badge" style="background:rgba(80,227,194,0.18); color:#50E3C2; font-weight:700;">✓ DI JADWAL</span>'
        : '<span class="rtp-badge" style="background:rgba(255,255,255,0.06); color:var(--text-muted);">DISEMBUNYIKAN</span>';

      card.innerHTML =
        '<div class="rmc-head">' +
          '<div class="rmc-name">' +
            '<span class="rtp-color" style="background:' + (r.color || '#FFB020') + '"></span>' +
            '<span>' + escapeHtml(r.name) + '</span>' +
            (isCur ? '<span class="rtp-badge" style="background:var(--amber); color:#1A1300; font-weight:700;">AKTIF</span>' : '') +
            inSchedBadge +
          '</div>' +
          '<div style="font-size:11.5px;">' + schedStatus + '</div>' +
        '</div>' +
        '<div class="rmc-details">' +
          r.jamMulai + '&ndash;' + r.jamSelesai + ' &middot; ' + r.ritase + 'R &middot; ' + activeCount + '/' + r.masterUnits.length + 'u' +
          (r.peakEnabled ? (' &middot; Sibuk ' + r.peak1Start + '-' + r.peak1End + ' (' + r.peak1Interval + 'm), ' + r.peak2Start + '-' + r.peak2End + ' (' + r.peak2Interval + 'm)') : '') +
        '</div>' +
        '<div class="rmc-actions">' +
          (!isCur ? '<button type="button" class="btn-mini amber rmc-select-btn" data-id="' + r.id + '" data-tooltip="Buka rute ini">&#10148; Buka</button>' : '<span class="btn-mini" style="opacity:0.6; cursor:default;">Aktif</span>') +
          (inSched
            ? '<button type="button" class="btn-mini outline rmc-sched-toggle-btn" data-id="' + r.id + '" data-tooltip="Keluarkan dari daftar jadwal keberangkatan">&times; Keluarkan</button>'
            : '<button type="button" class="btn-mini emerald rmc-sched-toggle-btn" data-id="' + r.id + '" data-tooltip="Tampilkan kembali di daftar jadwal keberangkatan">+ Ke Jadwal</button>'
          ) +
          '<button type="button" class="icon-btn rmc-dup-btn" data-id="' + r.id + '" data-tooltip="Duplikasi rute" aria-label="Duplikasi">&#10697;</button>' +
          (state.routes.length > 1 ? '<button type="button" class="icon-btn danger rmc-del-btn" data-id="' + r.id + '" data-tooltip="Hapus rute permanen" aria-label="Hapus rute">&#128465;</button>' : '') +
        '</div>';

      routeListContainer.appendChild(card);
    });

    routeListContainer.querySelectorAll('.rmc-select-btn').forEach(btn => {
      btn.addEventListener('click', () => switchActiveRoute(btn.getAttribute('data-id')));
    });
    routeListContainer.querySelectorAll('.rmc-sched-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const target = state.routes.find(r => r.id === id);
        if (!target) return;
        if (target.activeInSchedule !== false){
          removeRouteFromSchedule(id);
        } else {
          target.activeInSchedule = true;
          saveState();
          switchActiveRoute(target.id);
          showToast('Rute "' + target.name + '" ditampilkan di jadwal');
        }
      });
    });
    routeListContainer.querySelectorAll('.rmc-dup-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = state.routes.find(r => r.id === btn.getAttribute('data-id'));
        if (!target) return;
        const dupName = target.name + ' (Copy)';
        const color = ROUTE_PALETTE[(state.routes.length) % ROUTE_PALETTE.length];
        const cloned = createRouteObject(null, dupName, {
          color,
          jamMulai: target.jamMulai,
          jamSelesai: target.jamSelesai,
          ritase: target.ritase,
          groupOrder: target.groupOrder,
          peakEnabled: target.peakEnabled,
          peak1Start: target.peak1Start,
          peak1End: target.peak1End,
          peak1Interval: target.peak1Interval,
          peak2Start: target.peak2Start,
          peak2End: target.peak2End,
          peak2Interval: target.peak2Interval,
          masterUnits: target.masterUnits.map(u => ({ id: 'u_' + Date.now() + Math.random().toString(36).slice(2,6), number: u.number, active: u.active }))
        });
        cloned.departureOrder = cloned.masterUnits.filter(u => u.active).map(u => u.id);
        state.routes.push(cloned);
        saveState();
        switchActiveRoute(cloned.id);
        showToast('Rute disalin');
      });
    });
    routeListContainer.querySelectorAll('.rmc-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const target = state.routes.find(r => r.id === id);
        if (!target) return;
        if (state.routes.length <= 1){ showToast('Minimal harus ada 1 rute', 'error'); return; }
        if (window.confirm('Hapus rute "' + target.name + '"?')){
          state.routes = state.routes.filter(r => r.id !== id);
          if (state.activeRouteId === id) state.activeRouteId = state.routes[0].id;
          saveState();
          switchActiveRoute(state.activeRouteId);
          showToast('Rute dihapus');
        }
      });
    });
  }

  // ===== BIND PARAMETER INPUTS (PER ROUTE) =====
  const jamMulai = $('jamMulai'), jamSelesai = $('jamSelesai'), ritaseInput = $('ritase');
  const peak1Start = $('peak1Start'), peak1End = $('peak1End'), peak2Start = $('peak2Start'), peak2End = $('peak2End');
  const peak1Interval = $('peak1Interval'), peak2Interval = $('peak2Interval'), peakToggle = $('peakToggle');
  const orderFastFirst = $('orderFastFirst'), orderSlowFirst = $('orderSlowFirst');
  const alarmToggle = $('alarmToggle'), alarmDurationInput = $('alarmDuration'),
        alarmDurMinus = $('alarmDurMinus'), alarmDurPlus = $('alarmDurPlus'),
        alarmPrepInput = $('alarmPrepSeconds'), alarmPrepMinus = $('alarmPrepMinus'), alarmPrepPlus = $('alarmPrepPlus');

  function setPeakInputsDisabled(disabled){
    [peak1Start, peak1End, peak2Start, peak2End, peak1Interval, peak2Interval].forEach(el => el.disabled = disabled);
  }

  function hydrateInputs(){
    const cur = getActiveRoute();
    jamMulai.value = cur.jamMulai || '05:00';
    jamSelesai.value = cur.jamSelesai || '22:00';
    ritaseInput.value = cur.ritase || 8;
    peak1Start.value = cur.peak1Start || '05:00';
    peak1End.value = cur.peak1End || '08:00';
    peak1Interval.value = cur.peak1Interval || 2;
    peak2Start.value = cur.peak2Start || '17:00';
    peak2End.value = cur.peak2End || '19:00';
    peak2Interval.value = cur.peak2Interval || 3;
    peakToggle.classList.toggle('on', !!cur.peakEnabled);
    setPeakInputsDisabled(!cur.peakEnabled);

    orderFastFirst.classList.toggle('active', cur.groupOrder !== 'slow-first');
    orderSlowFirst.classList.toggle('active', cur.groupOrder === 'slow-first');

    alarmToggle.classList.toggle('on', !!cur.alarmEnabled);
    alarmDurationInput.value = cur.alarmDuration || 8;
    alarmDurationInput.disabled = !cur.alarmEnabled;
    alarmDurMinus.disabled = !cur.alarmEnabled;
    alarmDurPlus.disabled = !cur.alarmEnabled;

    if (alarmPrepInput) {
      const prepVal = cur.alarmPrepSeconds !== undefined ? cur.alarmPrepSeconds : 10;
      alarmPrepInput.value = prepVal;
      alarmPrepInput.disabled = !cur.alarmEnabled;
      const prepLbl = $('alarmPrepLabel');
      if (prepLbl) prepLbl.textContent = prepVal + ' detik';
    }
    if (alarmPrepMinus) alarmPrepMinus.disabled = !cur.alarmEnabled;
    if (alarmPrepPlus) alarmPrepPlus.disabled = !cur.alarmEnabled;
  }

  [ [jamMulai,'jamMulai'], [jamSelesai,'jamSelesai'], [peak1Start,'peak1Start'], [peak1End,'peak1End'],
    [peak2Start,'peak2Start'], [peak2End,'peak2End'] ].forEach(([el,key]) => {
    el.addEventListener('change', () => {
      const cur = getActiveRoute();
      cur[key] = el.value;
      saveState();
      markDirtyIfCommitted(cur);
      renderRouteBar();
    });
  });

  if (ritaseInput) {
    ritaseInput.addEventListener('change', () => {
      let v = Math.max(1, Math.min(30, parseInt(ritaseInput.value) || 1));
      ritaseInput.value = v;
      const cur = getActiveRoute();
      cur.ritase = v;
      saveState();
      markDirtyIfCommitted(cur);
      renderRouteBar();
    });
  }
  const ritaseMinusBtn = $('ritaseMinus');
  if (ritaseMinusBtn) {
    ritaseMinusBtn.addEventListener('click', () => {
      if (ritaseInput) {
        ritaseInput.value = Math.max(1, (parseInt(ritaseInput.value)||1) - 1);
        ritaseInput.dispatchEvent(new Event('change'));
      }
    });
  }
  const ritasePlusBtn = $('ritasePlus');
  if (ritasePlusBtn) {
    ritasePlusBtn.addEventListener('click', () => {
      if (ritaseInput) {
        ritaseInput.value = Math.min(30, (parseInt(ritaseInput.value)||1) + 1);
        ritaseInput.dispatchEvent(new Event('change'));
      }
    });
  }

  [ [peak1Interval,'peak1Interval'], [peak2Interval,'peak2Interval'] ].forEach(([el,key]) => {
    if (el) {
      el.addEventListener('change', () => {
        let v = Math.max(1, Math.min(60, parseInt(el.value) || 1));
        el.value = v;
        const cur = getActiveRoute();
        cur[key] = v;
        saveState();
        markDirtyIfCommitted(cur);
        renderRouteBar();
      });
    }
  });

  if (peakToggle) {
    peakToggle.addEventListener('click', () => {
      const cur = getActiveRoute();
      cur.peakEnabled = !cur.peakEnabled;
      peakToggle.classList.toggle('on', cur.peakEnabled);
      setPeakInputsDisabled(!cur.peakEnabled);
      saveState();
      markDirtyIfCommitted(cur);
      renderRouteBar();
    });
  }

  if (orderFastFirst) {
    orderFastFirst.addEventListener('click', () => {
      const cur = getActiveRoute();
      cur.groupOrder = 'fast-first';
      orderFastFirst.classList.add('active');
      if (orderSlowFirst) orderSlowFirst.classList.remove('active');
      saveState();
      markDirtyIfCommitted(cur);
    });
  }
  if (orderSlowFirst) {
    orderSlowFirst.addEventListener('click', () => {
      const cur = getActiveRoute();
      cur.groupOrder = 'slow-first';
      orderSlowFirst.classList.add('active');
      if (orderFastFirst) orderFastFirst.classList.remove('active');
      saveState();
      markDirtyIfCommitted(cur);
    });
  }

  if (alarmToggle) {
    alarmToggle.addEventListener('click', () => {
      const cur = getActiveRoute();
      cur.alarmEnabled = !cur.alarmEnabled;
      alarmToggle.classList.toggle('on', cur.alarmEnabled);
      if (alarmDurationInput) alarmDurationInput.disabled = !cur.alarmEnabled;
      if (alarmDurMinus) alarmDurMinus.disabled = !cur.alarmEnabled;
      if (alarmDurPlus) alarmDurPlus.disabled = !cur.alarmEnabled;
      if (alarmPrepInput) alarmPrepInput.disabled = !cur.alarmEnabled;
      if (alarmPrepMinus) alarmPrepMinus.disabled = !cur.alarmEnabled;
      if (alarmPrepPlus) alarmPrepPlus.disabled = !cur.alarmEnabled;
      saveState();
    });
  }
  if (alarmDurationInput) {
    alarmDurationInput.addEventListener('change', () => {
      let v = Math.max(1, Math.min(30, parseInt(alarmDurationInput.value) || 8));
      alarmDurationInput.value = v;
      const cur = getActiveRoute();
      cur.alarmDuration = v;
      saveState();
    });
  }
  if (alarmDurMinus) {
    alarmDurMinus.addEventListener('click', () => {
      if (alarmDurationInput) {
        alarmDurationInput.value = Math.max(1, (parseInt(alarmDurationInput.value)||1) - 1);
        alarmDurationInput.dispatchEvent(new Event('change'));
      }
    });
  }
  if (alarmDurPlus) {
    alarmDurPlus.addEventListener('click', () => {
      if (alarmDurationInput) {
        alarmDurationInput.value = Math.min(30, (parseInt(alarmDurationInput.value)||1) + 1);
        alarmDurationInput.dispatchEvent(new Event('change'));
      }
    });
  }

  if (alarmPrepInput) {
    alarmPrepInput.addEventListener('change', () => {
      let v = Math.max(0, Math.min(60, parseInt(alarmPrepInput.value) || 0));
      alarmPrepInput.value = v;
      const cur = getActiveRoute();
      cur.alarmPrepSeconds = v;
      const lbl = $('alarmPrepLabel');
      if (lbl) lbl.textContent = v + ' detik';
      saveState();
    });
  }
  if (alarmPrepMinus) {
    alarmPrepMinus.addEventListener('click', () => {
      if (alarmPrepInput) {
        alarmPrepInput.value = Math.max(0, (parseInt(alarmPrepInput.value) || 10) - 1);
        alarmPrepInput.dispatchEvent(new Event('change'));
      }
    });
  }
  if (alarmPrepPlus) {
    alarmPrepPlus.addEventListener('click', () => {
      if (alarmPrepInput) {
        alarmPrepInput.value = Math.min(60, (parseInt(alarmPrepInput.value) || 10) + 1);
        alarmPrepInput.dispatchEvent(new Event('change'));
      }
    });
  }

  // ===== DAFTAR UNIT & URUTAN =====
  const unitListContainer = $('unitListContainer');
  const activeSummaryText = $('activeSummaryText');
  const unitSearchInput = $('unitSearchInput');
  const bulkUnitsBar = $('bulkUnitsBar');
  const bulkCountText = $('bulkCountText');
  const bulkActivateBtn = $('bulkActivateBtn');
  const bulkDeactivateBtn = $('bulkDeactivateBtn');
  const bulkDeleteBtn = $('bulkDeleteBtn');
  const bulkCancelBtn = $('bulkCancelBtn');
  const selectAllUnitsBtn = $('selectAllUnitsBtn');
  const filterUnitsAll = $('filterUnitsAll');
  const filterUnitsActive = $('filterUnitsActive');
  const filterUnitsInactive = $('filterUnitsInactive');

  const selectedUnitIds = new Set();
  let unitFilter = 'all'; // 'all' | 'active' | 'inactive'
  let unitSearchQuery = '';

  function getFilteredUnits(cur){
    if (!cur.masterUnits) return [];
    let list = cur.masterUnits;
    if (unitFilter === 'active') list = list.filter(u => u.active);
    else if (unitFilter === 'inactive') list = list.filter(u => !u.active);
    if (unitSearchQuery){
      const q = unitSearchQuery.toLowerCase().trim();
      list = list.filter(u => String(u.number).toLowerCase().includes(q));
    }
    return list;
  }

  if (unitSearchInput){
    unitSearchInput.addEventListener('input', () => {
      unitSearchQuery = unitSearchInput.value.trim();
      renderUnitList();
    });
  }

  function updateBulkBar(){
    if (!bulkUnitsBar) return;
    const n = selectedUnitIds.size;
    if (n > 0){
      bulkUnitsBar.style.display = 'flex';
      bulkCountText.textContent = n + ' dipilih';
      if (unitListContainer) unitListContainer.classList.add('has-bulk');
    } else {
      bulkUnitsBar.style.display = 'none';
      if (unitListContainer) unitListContainer.classList.remove('has-bulk');
    }
  }

  function renderUnitList(){
    const cur = getActiveRoute();
    unitListContainer.innerHTML = '';

    // Update filter counts and active states
    const totalUnits = cur.masterUnits.length;
    const totalActive = cur.masterUnits.filter(u => u.active).length;
    const totalInactive = totalUnits - totalActive;

    if (filterUnitsAll){
      filterUnitsAll.textContent = 'Semua (' + totalUnits + ')';
      filterUnitsAll.classList.toggle('active', unitFilter === 'all');
    }
    if (filterUnitsActive){
      filterUnitsActive.textContent = 'Aktif (' + totalActive + ')';
      filterUnitsActive.classList.toggle('active', unitFilter === 'active');
    }
    if (filterUnitsInactive){
      filterUnitsInactive.textContent = 'Off (' + totalInactive + ')';
      filterUnitsInactive.classList.toggle('active', unitFilter === 'inactive');
    }

    const filtered = getFilteredUnits(cur);

    if (selectAllUnitsBtn){
      const allSelected = filtered.length > 0 && filtered.every(u => selectedUnitIds.has(String(u.id)));
      selectAllUnitsBtn.innerHTML = allSelected ? '&#9746;' : '&#9745;';
      selectAllUnitsBtn.setAttribute('data-tooltip', allSelected ? 'Batal pilih semua' : 'Pilih semua unit');
      selectAllUnitsBtn.setAttribute('aria-label', allSelected ? 'Batal pilih semua' : 'Pilih semua unit');
    }

    updateBulkBar();

    if (!cur.masterUnits || cur.masterUnits.length === 0){
      unitListContainer.innerHTML = '<div class="empty-note">Belum ada unit untuk rute ' + escapeHtml(cur.name) + '. Tambahkan lewat form di atas.</div>';
      return;
    }

    if (filtered.length === 0){
      unitListContainer.innerHTML = '<div class="empty-note">Tidak ada unit pada kategori filter ini.</div>';
      return;
    }

    filtered.forEach(u => {
      const uIdStr = String(u.id);
      const isSelected = selectedUnitIds.has(uIdStr);
      const row = document.createElement('div');
      row.className = 'unit-row' + (u.active ? '' : ' inactive') + (isSelected ? ' selected' : '');
      row.setAttribute('data-id', uIdStr);
      row.setAttribute('data-num', String(u.number));

      row.innerHTML =
        '<div class="unit-row-left">' +
          '<input type="checkbox" class="unit-checkbox" data-id="' + escapeHtml(uIdStr) + '" data-num="' + escapeHtml(String(u.number)) + '" ' + (isSelected ? 'checked' : '') + ' aria-label="Pilih unit ' + escapeHtml(String(u.number)) + '">' +
          '<span class="num">' + escapeHtml(String(u.number)) + '</span>' +
          '<span class="unit-status-tag ' + (u.active ? 'active' : 'inactive') + '">' + (u.active ? 'Aktif' : 'Off') + '</span>' +
        '</div>' +
        '<div class="unit-row-actions">' +
          '<button type="button" class="del-btn" data-id="' + escapeHtml(uIdStr) + '" data-num="' + escapeHtml(String(u.number)) + '" data-tooltip="Hapus unit ' + escapeHtml(String(u.number)) + '" aria-label="Hapus unit">&#128465;</button>' +
          '<div class="switch' + (u.active ? ' on' : '') + '" data-id="' + escapeHtml(uIdStr) + '" data-num="' + escapeHtml(String(u.number)) + '" data-tooltip="' + (u.active ? 'Nonaktifkan unit' : 'Aktifkan unit') + '"><div class="knob"></div></div>' +
        '</div>';

      unitListContainer.appendChild(row);
    });

    // Checkbox selection listener
    unitListContainer.querySelectorAll('.unit-checkbox').forEach(cb => {
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = cb.getAttribute('data-id');
        if (cb.checked){
          selectedUnitIds.add(id);
        } else {
          selectedUnitIds.delete(id);
        }
        const row = cb.closest('.unit-row');
        if (row) row.classList.toggle('selected', cb.checked);
        updateBulkBar();
        if (selectAllUnitsBtn){
          const allSelected = filtered.length > 0 && filtered.every(u => selectedUnitIds.has(String(u.id)));
          selectAllUnitsBtn.textContent = allSelected ? '\u2611 Batal Pilih' : '\u2610 Pilih Semua';
        }
      });
    });

    // Row click to toggle selection
    unitListContainer.querySelectorAll('.unit-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.del-btn') || e.target.closest('.switch') || e.target.closest('.unit-checkbox')) return;
        const id = row.getAttribute('data-id');
        const cb = row.querySelector('.unit-checkbox');
        if (selectedUnitIds.has(id)){
          selectedUnitIds.delete(id);
          if (cb) cb.checked = false;
          row.classList.remove('selected');
        } else {
          selectedUnitIds.add(id);
          if (cb) cb.checked = true;
          row.classList.add('selected');
        }
        updateBulkBar();
        if (selectAllUnitsBtn){
          const allSelected = filtered.length > 0 && filtered.every(u => selectedUnitIds.has(String(u.id)));
          selectAllUnitsBtn.textContent = allSelected ? '\u2611 Batal Pilih' : '\u2610 Pilih Semua';
        }
      });
    });

    // Switch individual active toggle with robust dual lookup
    unitListContainer.querySelectorAll('.switch').forEach(sw => {
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = sw.getAttribute('data-id');
        const num = sw.getAttribute('data-num');
        const c = getActiveRoute();
        const unit = c.masterUnits.find(u => (id && String(u.id) === String(id)) || (num && String(u.number) === String(num)));
        if (!unit) return;
        unit.active = !unit.active;
        if (unit.active){
          if (!c.departureOrder.some(x => String(x) === String(unit.id) || String(x) === String(unit.number))){
            c.departureOrder.push(unit.id);
          }
        } else {
          c.departureOrder = c.departureOrder.filter(x => String(x) !== String(unit.id) && String(x) !== String(unit.number));
        }
        saveState();
        renderUnitList();
        updateActiveSummary();
        markDirtyIfCommitted(c);
        renderRouteBar();
      });
    });

    // Single delete button listener with guaranteed ID matching & confirmation
    unitListContainer.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const num = btn.getAttribute('data-num') || '';
        deleteSingleUnit(id, num);
      });
    });
  }

  function deleteSingleUnit(id, number){
    const c = getActiveRoute();
    const doDelete = () => {
      c.masterUnits = c.masterUnits.filter(u => !( (id && String(u.id) === String(id)) || (number && String(u.number) === String(number)) ));
      c.departureOrder = c.departureOrder.filter(x => !( (id && String(x) === String(id)) || (number && String(x) === String(number)) ));
      if (id) selectedUnitIds.delete(String(id));
      saveState();
      renderUnitList();
      updateActiveSummary();
      markDirtyIfCommitted(c);
      renderRouteBar();
      showToast('Unit ' + number + ' berhasil dihapus');
    };

    if (typeof Swal === 'undefined'){
      if (window.confirm('Hapus unit ' + number + ' dari rute ' + c.name + '?')) doDelete();
      return;
    }

    Swal.fire({
      title: 'Hapus Unit ' + escapeHtml(number) + '?',
      text: 'Unit akan dihapus dari daftar armada rute ' + c.name + '.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Hapus',
      cancelButtonText: 'Batal',
      background: '#1D222A',
      color: '#ECEAE4',
      confirmButtonColor: '#FF6B5E',
      cancelButtonColor: '#333A46'
    }).then(res => {
      if (res.isConfirmed) doDelete();
    });
  }

  // Bulk Actions Handlers
  function bulkActivateUnits(){
    if (selectedUnitIds.size === 0) return;
    const c = getActiveRoute();
    let count = 0;
    c.masterUnits.forEach(u => {
      if (selectedUnitIds.has(String(u.id))){
        u.active = true;
        if (!c.departureOrder.some(x => String(x) === String(u.id))) c.departureOrder.push(u.id);
        count++;
      }
    });
    selectedUnitIds.clear();
    saveState();
    renderUnitList();
    updateActiveSummary();
    markDirtyIfCommitted(c);
    renderRouteBar();
    showToast(count + ' unit diaktifkan');
  }

  function bulkDeactivateUnits(){
    if (selectedUnitIds.size === 0) return;
    const c = getActiveRoute();
    let count = 0;
    c.masterUnits.forEach(u => {
      if (selectedUnitIds.has(String(u.id))){
        u.active = false;
        c.departureOrder = c.departureOrder.filter(x => String(x) !== String(u.id));
        count++;
      }
    });
    selectedUnitIds.clear();
    saveState();
    renderUnitList();
    updateActiveSummary();
    markDirtyIfCommitted(c);
    renderRouteBar();
    showToast(count + ' unit dinonaktifkan');
  }

  function bulkDeleteUnits(){
    if (selectedUnitIds.size === 0) return;
    const c = getActiveRoute();
    const count = selectedUnitIds.size;

    const doBulkDelete = () => {
      c.masterUnits = c.masterUnits.filter(u => !selectedUnitIds.has(String(u.id)));
      c.departureOrder = c.departureOrder.filter(x => !selectedUnitIds.has(String(x)));
      selectedUnitIds.clear();
      saveState();
      renderUnitList();
      updateActiveSummary();
      markDirtyIfCommitted(c);
      renderRouteBar();
      showToast(count + ' unit berhasil dihapus');
    };

    if (typeof Swal === 'undefined'){
      if (window.confirm('Hapus ' + count + ' unit terpilih dari rute ' + c.name + '?')) doBulkDelete();
      return;
    }

    Swal.fire({
      title: 'Hapus ' + count + ' Unit?',
      text: count + ' unit yang dipilih akan dihapus permanen dari rute ' + c.name + '.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Hapus Semua (' + count + ')',
      cancelButtonText: 'Batal',
      background: '#1D222A',
      color: '#ECEAE4',
      confirmButtonColor: '#FF6B5E',
      cancelButtonColor: '#333A46'
    }).then(res => {
      if (res.isConfirmed) doBulkDelete();
    });
  }

  if (bulkActivateBtn) bulkActivateBtn.addEventListener('click', bulkActivateUnits);
  if (bulkDeactivateBtn) bulkDeactivateBtn.addEventListener('click', bulkDeactivateUnits);
  if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDeleteUnits);
  if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', () => { selectedUnitIds.clear(); renderUnitList(); });

  if (selectAllUnitsBtn) selectAllUnitsBtn.addEventListener('click', () => {
    const cur = getActiveRoute();
    const filtered = getFilteredUnits(cur);
    const allSelected = filtered.length > 0 && filtered.every(u => selectedUnitIds.has(String(u.id)));
    if (allSelected){
      filtered.forEach(u => selectedUnitIds.delete(String(u.id)));
    } else {
      filtered.forEach(u => selectedUnitIds.add(String(u.id)));
    }
    renderUnitList();
  });

  if (filterUnitsAll) filterUnitsAll.addEventListener('click', () => { unitFilter = 'all'; renderUnitList(); });
  if (filterUnitsActive) filterUnitsActive.addEventListener('click', () => { unitFilter = 'active'; renderUnitList(); });
  if (filterUnitsInactive) filterUnitsInactive.addEventListener('click', () => { unitFilter = 'inactive'; renderUnitList(); });

  function updateActiveSummary(){
    const cur = getActiveRoute();
    const active = cur.masterUnits.filter(u => u.active).length;
    if (activeSummaryText) activeSummaryText.textContent = active + ' / ' + cur.masterUnits.length + ' unit aktif';
    const bnavUnitBadge = $('bnavUnitBadge');
    if (bnavUnitBadge) bnavUnitBadge.textContent = active;
    const bnavRouteBadge = $('bnavRouteBadge');
    if (bnavRouteBadge) {
      const schedCount = state.routes.filter(r => r.activeInSchedule !== false).length;
      bnavRouteBadge.textContent = schedCount;
    }
    const bnavJadwalDot = $('bnavJadwalDot');
    if (bnavJadwalDot){
      const hasSched = cur.committedSchedule && cur.committedSchedule.rows && cur.committedSchedule.rows.length;
      bnavJadwalDot.classList.toggle('show', !!hasSched);
      bnavJadwalDot.style.background = cur.scheduleDirty ? 'var(--amber)' : 'var(--emerald)';
    }
  }

  const addUnitBtnEl = $('addUnitBtn');
  if (addUnitBtnEl) addUnitBtnEl.addEventListener('click', addUnit);
  const newUnitInputEl = $('newUnitInput');
  if (newUnitInputEl) newUnitInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addUnit(); });
  function addUnit(){
    const input = $('newUnitInput');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    const cur = getActiveRoute();
    if (cur.masterUnits.some(u => String(u.number).trim() === val)){ showToast('Nomor unit sudah ada di rute ini', 'error'); return; }
    const id = 'u_' + val.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    cur.masterUnits.push({ id, number: val, active: true });
    cur.departureOrder.push(id);
    saveState();
    if (input) input.value = '';
    renderUnitList();
    updateActiveSummary();
    markDirtyIfCommitted(cur);
    renderRouteBar();
    showToast('Unit ' + val + ' ditambahkan ke rute ' + cur.name);
  }

  // Urutan Keberangkatan Tab
  const orderListContainer = $('orderListContainer');
  const multiSelectBar = $('multiSelectBar');
  const multiSelectCount = $('multiSelectCount');
  let sortableInstance = null;
  let multiDragMounted = false;
  if (window.Sortable && Sortable.MultiDrag && !multiDragMounted){
    try{ Sortable.mount(new Sortable.MultiDrag()); multiDragMounted = true; }catch(e){}
  }

  function updateMultiSelectBar(){
    if (!orderListContainer || !multiSelectBar) return;
    const n = orderListContainer.querySelectorAll('.order-row.selected').length;
    multiSelectBar.style.display = n > 0 ? 'flex' : 'none';
    if (multiSelectCount) multiSelectCount.textContent = n + ' unit dipilih';
  }
  const clearSelectionBtnEl = $('clearSelectionBtn');
  if (clearSelectionBtnEl) clearSelectionBtnEl.addEventListener('click', () => { renderOrderList(); });

  function renderOrderList(){
    const cur = getActiveRoute();
    cur.departureOrder = cur.departureOrder.filter(id => {
      const u = cur.masterUnits.find(x => x.id === id);
      return u && u.active;
    });
    cur.masterUnits.forEach(u => { if (u.active && !cur.departureOrder.includes(u.id)) cur.departureOrder.push(u.id); });
    saveState();

    orderListContainer.innerHTML = '';
    if (cur.departureOrder.length === 0){
      orderListContainer.innerHTML = '<div class="empty-note">Belum ada unit aktif di rute ' + escapeHtml(cur.name) + '. Aktifkan unit dulu di tab "Armada".</div>';
      return;
    }

    cur.departureOrder.forEach((id, idx) => {
      const u = cur.masterUnits.find(x => x.id === id);
      if (!u) return;
      const row = document.createElement('div');
      row.className = 'order-row';
      row.setAttribute('data-id', id);
      row.innerHTML =
        '<span class="handle" data-tooltip="Tahan &amp; geser urutan" aria-label="Geser urutan">&#9776;</span>' +
        '<span class="idx">' + String(idx+1).padStart(2,'0') + '</span>' +
        '<span class="num">' + escapeHtml(u.number) + '</span>' +
        '<div class="order-row-quick-btns">' +
          '<button type="button" class="order-step-btn order-step-up" data-idx="' + idx + '" data-tooltip="Pindah ke atas" aria-label="Pindah ke atas" ' + (idx === 0 ? 'disabled style="opacity:0.25; pointer-events:none;"' : '') + '>&uarr;</button>' +
          '<button type="button" class="order-step-btn order-step-down" data-idx="' + idx + '" data-tooltip="Pindah ke bawah" aria-label="Pindah ke bawah" ' + (idx === cur.departureOrder.length - 1 ? 'disabled style="opacity:0.25; pointer-events:none;"' : '') + '>&darr;</button>' +
        '</div>';
      orderListContainer.appendChild(row);
    });

    // Touch friendly step buttons
    orderListContainer.querySelectorAll('.order-step-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(btn.getAttribute('data-idx'), 10);
        if (i > 0){
          const c = getActiveRoute();
          const temp = c.departureOrder[i];
          c.departureOrder[i] = c.departureOrder[i-1];
          c.departureOrder[i-1] = temp;
          saveState();
          markDirtyIfCommitted(c);
          renderOrderList();
        }
      });
    });

    orderListContainer.querySelectorAll('.order-step-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(btn.getAttribute('data-idx'), 10);
        const c = getActiveRoute();
        if (i < c.departureOrder.length - 1){
          const temp = c.departureOrder[i];
          c.departureOrder[i] = c.departureOrder[i+1];
          c.departureOrder[i+1] = temp;
          saveState();
          markDirtyIfCommitted(c);
          renderOrderList();
        }
      });
    });

    if (sortableInstance) sortableInstance.destroy();
    updateMultiSelectBar();
    if (window.Sortable){
      sortableInstance = Sortable.create(orderListContainer, {
        animation: 150,
        handle: '.handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        multiDrag: true,
        selectedClass: 'selected',
        fallbackTolerance: 3,
        onSelect: updateMultiSelectBar,
        onDeselect: updateMultiSelectBar,
        onEnd: () => {
          const c = getActiveRoute();
          const newOrder = Array.from(orderListContainer.querySelectorAll('.order-row')).map(el => el.getAttribute('data-id'));
          c.departureOrder = newOrder;
          saveState();
          orderListContainer.querySelectorAll('.idx').forEach((el, i) => { el.textContent = String(i+1).padStart(2,'0'); });
          markDirtyIfCommitted(c);
          updateMultiSelectBar();
        }
      });
    }
  }

  // ===== TIME HELPERS =====
  function toMinutes(hhmm){ const [h,m] = hhmm.split(':').map(Number); return h*60+m; }
  function toHHMM(totalMin){
    let m = Math.round(totalMin) % 1440; if (m < 0) m += 1440;
    const h = Math.floor(m/60), mm = m % 60;
    return String(h).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }
  function fmtDur(min){ const h=Math.floor(min/60), m=min%60; return (h>0?h+'j ':'')+m+'m'; }

  // ===== TIMELINE BUILDER =====
  function buildTimeline(startMin, endMin, totalDep, peakEnabled, peaksRaw, groupOrder){
    const totalMinutes = endMin - startMin;
    const totalGaps = totalDep - 1;
    if (totalGaps <= 0) return { offsets: [0], segments: [], error:null };

    if (!peakEnabled || !peaksRaw || peaksRaw.length === 0){
      const low = Math.floor(totalMinutes / totalGaps), high = low + 1;
      const y = totalMinutes - low*totalGaps, x = totalGaps - y;
      const intervals = groupOrder === 'slow-first'
        ? new Array(y).fill(high).concat(new Array(x).fill(low))
        : new Array(x).fill(low).concat(new Array(y).fill(high));

      const offsets = [0]; let cur = 0;
      intervals.forEach(iv => { cur += iv; offsets.push(cur); });
      offsets[offsets.length-1] = totalMinutes;

      const seg = { start: 0, end: totalMinutes, duration: totalMinutes, isPeak: false,
        label: toHHMM(startMin) + '-' + toHHMM(endMin), intervals };
      return { offsets, segments: [seg], error:null };
    }

    const clampedPeaks = peaksRaw.map(p => ({
      s: Math.max(startMin, Math.min(endMin, p.s)),
      e: Math.max(startMin, Math.min(endMin, p.e)),
      interval: Math.max(1, p.interval)
    })).filter(p => p.e > p.s).sort((a,b) => a.s - b.s);

    const mergedPeaks = [];
    clampedPeaks.forEach(p => {
      if (!mergedPeaks.length){ mergedPeaks.push({ ...p }); return; }
      const last = mergedPeaks[mergedPeaks.length-1];
      if (p.s <= last.e){
        last.e = Math.max(last.e, p.e);
        last.interval = Math.min(last.interval, p.interval);
      } else {
        mergedPeaks.push({ ...p });
      }
    });

    const timeline = [];
    let cursor = startMin;
    mergedPeaks.forEach(p => {
      if (p.s > cursor){ timeline.push({ type:'offpeak', start: cursor, end: p.s, duration: p.s - cursor }); }
      timeline.push({ type:'peak', start: p.s, end: p.e, duration: p.e - p.s, interval: p.interval });
      cursor = p.e;
    });
    if (cursor < endMin){ timeline.push({ type:'offpeak', start: cursor, end: endMin, duration: endMin - cursor }); }

    let peakGapsSum = 0;
    timeline.forEach(seg => {
      if (seg.type === 'peak'){
        seg.gaps = Math.max(1, Math.round(seg.duration / seg.interval));
        peakGapsSum += seg.gaps;
      }
    });

    let remainingGaps = totalGaps - peakGapsSum;
    const offpeakEntries = timeline.filter(t => t.type === 'offpeak');
    const totalOffpeakDuration = offpeakEntries.reduce((a,e) => a+e.duration, 0);

    if (offpeakEntries.length > 0 && totalOffpeakDuration > 0 && remainingGaps > 0){
      let raw = offpeakEntries.map(e => remainingGaps * e.duration / totalOffpeakDuration);
      let floors = raw.map(Math.floor);
      let assigned = floors.reduce((a,b)=>a+b,0);
      let remaining = remainingGaps - assigned;
      let remainders = raw.map((r,i) => ({ i, rem: r - floors[i] })).sort((a,b) => b.rem - a.rem);
      for (let k=0; k<remaining; k++){ floors[remainders[k % remainders.length].i]++; }
      offpeakEntries.forEach((e,i) => e.gaps = floors[i]);
    } else {
      offpeakEntries.forEach(e => e.gaps = 0);
      if (remainingGaps > 0 && mergedPeaks.length > 0){
        const lastPeak = timeline.filter(t=>t.type==='peak').pop();
        if (lastPeak) lastPeak.gaps += remainingGaps;
      }
    }

    timeline.forEach(seg => {
      if (seg.type === 'peak'){
        seg.intervals = new Array(seg.gaps).fill(seg.interval);
        seg.isPeak = true;
      } else {
        const g = seg.gaps || 0;
        if (g <= 0){ seg.intervals = []; seg.isPeak = false; return; }
        const low = Math.floor(seg.duration / g), high = low + 1;
        const y = seg.duration - low*g, x = g - y;
        seg.intervals = groupOrder === 'slow-first'
          ? new Array(y).fill(high).concat(new Array(x).fill(low))
          : new Array(x).fill(low).concat(new Array(y).fill(high));
        seg.isPeak = false;
      }
    });

    const offsets = [0];
    let cur = 0;
    const renderSegments = [];
    timeline.forEach(seg => {
      const segStartOffset = cur;
      seg.intervals.forEach(iv => { cur += iv; offsets.push(cur); });
      if (seg.intervals.length > 0){
        renderSegments.push({ start: segStartOffset, end: cur, duration: cur-segStartOffset, isPeak: seg.isPeak,
          label: toHHMM(startMin+segStartOffset) + '-' + toHHMM(startMin+cur), intervals: seg.intervals });
      }
    });

    while (offsets.length < totalDep) offsets.push(totalMinutes);
    offsets.length = totalDep;
    offsets[offsets.length-1] = totalMinutes;

    return { offsets, segments: renderSegments, error:null };
  }

  function isPeakAtOffset(segments, off){
    for (const seg of segments){ if (off >= seg.start && off <= seg.end) return seg.isPeak; }
    return false;
  }

  // ===== SCHEDULE COMPUTATION (PER ROUTE & ALL ROUTES) =====
  const errorBox = $('errorBox'), generateBtn = $('generateBtn'), generateAllBtn = $('generateAllBtn'), resultSection = $('resultSection');
  function showError(msg){
    errorBox.textContent = msg;
    errorBox.classList.add('show');
    if (boardBody) {
      boardBody.innerHTML = '<div style="padding:24px 16px; text-align:center; color:var(--rose); font-size:12px;">' +
        '<div style="font-size:24px; margin-bottom:6px;">⚠️</div>' +
        '<div style="font-weight:700; margin-bottom:4px;">Gagal Menghitung Jadwal</div>' +
        '<div>' + escapeHtml(msg) + '</div>' +
      '</div>';
    }
  }
  function clearError(){ errorBox.classList.remove('show'); }

  let lastSchedule = null;

  function buildScheduleForRoute(route){
    const units = route.departureOrder.map(id => {
      const u = route.masterUnits.find(x => x.id === id);
      return u && u.active ? u.number : null;
    }).filter(Boolean);

    const N = units.length;
    const R = parseInt(route.ritase) || 1;
    const startMin = toMinutes(route.jamMulai);
    const endMin = toMinutes(route.jamSelesai);

    if (N === 0) return { error: 'Rute "' + route.name + '": Aktifkan minimal 1 unit di tab "Daftar Unit".' };
    if (endMin <= startMin) return { error: 'Rute "' + route.name + '": Jam selesai (' + route.jamSelesai + ') harus setelah jam mulai (' + route.jamMulai + ').' };

    const totalDep = N * R;
    const peaksCfg = route.peakEnabled ? [
      { s: toMinutes(route.peak1Start), e: toMinutes(route.peak1End), interval: parseInt(route.peak1Interval) || 1 },
      { s: toMinutes(route.peak2Start), e: toMinutes(route.peak2End), interval: parseInt(route.peak2Interval) || 1 }
    ] : [];

    const { offsets, segments, error } = buildTimeline(startMin, endMin, totalDep, route.peakEnabled, peaksCfg, route.groupOrder);
    if (error) return { error: 'Rute "' + route.name + '": ' + error };

    const rows = [];
    for (let i=0; i<totalDep; i++){
      const ritaseKe = Math.floor(i / N) + 1;
      const unit = units[i % N];
      const timeMin = startMin + offsets[i];
      const interval = i < totalDep - 1 ? (offsets[i + 1] - offsets[i]) : null;
      rows.push({
        no: i + 1,
        ritase: ritaseKe,
        unit,
        jam: toHHMM(timeMin),
        interval,
        isPeak: isPeakAtOffset(segments, offsets[i]),
        routeId: route.id,
        routeName: route.name,
        routeColor: route.color || '#FFB020'
      });
    }

    return {
      rows,
      N,
      R,
      totalDep,
      totalMinutes: endMin - startMin,
      startLabel: route.jamMulai,
      endLabel: route.jamSelesai,
      peakEnabled: route.peakEnabled,
      segmentsInfo: segments,
      recalcBoundaryIndex: undefined
    };
  }

  function generateScheduleForRoute(route, silent = false){
    const res = buildScheduleForRoute(route);
    if (res.error){
      if (!silent) showError(res.error);
      return null;
    }
    route.committedSchedule = {
      rows: res.rows,
      N: res.N,
      R: res.R,
      startLabel: res.startLabel,
      endLabel: res.endLabel,
      peakEnabled: res.peakEnabled,
      segmentsInfo: res.segmentsInfo,
      recalcBoundaryIndex: undefined,
      lastRecalcLabel: undefined
    };
    route.scheduleDirty = false;
    saveState();
    return res;
  }

  function reconstructDisplaySchedule(route = getActiveRoute()){
    const cs = route.committedSchedule;
    if (!cs) return null;
    return {
      rows: cs.rows,
      N: cs.N,
      R: cs.R,
      totalDep: cs.rows.length,
      totalMinutes: toMinutes(cs.endLabel) - toMinutes(cs.startLabel),
      startLabel: cs.startLabel,
      endLabel: cs.endLabel,
      peakEnabled: cs.peakEnabled,
      segmentsInfo: cs.segmentsInfo || [],
      recalcBoundaryIndex: cs.recalcBoundaryIndex
    };
  }

  function render(sched){
    if (!sched){ resultSection.style.display = 'none'; return; }
    $('statTotal').textContent = sched.totalDep;
    $('statDurasi').textContent = fmtDur(sched.totalMinutes);
    $('statUnit').textContent = sched.N;

    const cur = getActiveRoute();
    if (!sched.peakEnabled){
      $('patternNote').innerHTML = 'Jam sibuk nonaktif &mdash; interval dihitung merata (' + sched.startLabel + '&ndash;' + sched.endLabel + ').';
    } else if (sched.segmentsInfo && sched.segmentsInfo.length){
      const parts = sched.segmentsInfo.map(seg => {
        const ivs = Array.from(new Set(seg.intervals||[]));
        const ivLabel = ivs.length === 0 ? '-' : (ivs.length === 1 ? ivs[0]+'mnt' : Math.min(...ivs)+'-'+Math.max(...ivs)+'mnt');
        return '<b>' + seg.label + '</b>' + (seg.isPeak ? ' (sibuk)' : '') + ': ' + ivLabel;
      });
      $('patternNote').innerHTML = parts.join(' &middot; ');
    } else {
      $('patternNote').innerHTML = '';
    }
    if (sched.recalcBoundaryIndex !== undefined && cur.committedSchedule){
      $('patternNote').innerHTML += '<br><span style="color:var(--amber)">Terakhir dihitung ulang: ' + (cur.committedSchedule.lastRecalcLabel||'-') + '</span>';
    }

    const body = $('boardBody');
    body.innerHTML = '';
    let curRitase = 0, prevGap = null;
    const maxAnim = 40;
    const boundary = sched.recalcBoundaryIndex;

    sched.rows.forEach((r, idx) => {
      const pastBoundary = boundary !== undefined && idx >= boundary;

      if (boundary !== undefined && idx === boundary){
        const div = document.createElement('div');
        div.className = 'recalc-divider';
        div.innerHTML = '<span>&#8635; Dihitung ulang mulai ' + r.jam + '</span>';
        body.appendChild(div);
        curRitase = 0; prevGap = null;
      }

      if (!pastBoundary || boundary === undefined){
        if (r.ritase !== curRitase){
          curRitase = r.ritase;
          const div = document.createElement('div');
          div.className = 'ritase-divider';
          div.innerHTML = '<span class="dot" style="background:' + (cur.color || '#FFB020') + '"></span><span>Ritase ' + curRitase + '</span>';
          body.appendChild(div);
          prevGap = null;
        }
      }

      let gapChangedHere = false;
      if (idx > 0){
        const currentGap = sched.rows[idx-1].interval;
        if (prevGap !== null && currentGap !== null && currentGap !== prevGap){
          gapChangedHere = true;
          const prevRowPeak = sched.rows[idx-1].isPeak;
          const peakNote = r.isPeak !== prevRowPeak ? (r.isPeak ? ' &mdash; masuk jam sibuk' : ' &mdash; keluar jam sibuk') : '';
          const div = document.createElement('div');
          div.className = 'interval-divider';
          div.innerHTML = '<span class="dot"></span><span>Interval headway berubah dari ' + prevGap + ' menit menjadi ' + currentGap + ' menit' + peakNote + '</span>';
          body.appendChild(div);
        }
        prevGap = currentGap;
      }

      const el = document.createElement('div');
      el.className = 'row-item' + (r.isPeak ? ' peak' : '') + (boundary !== undefined && idx < boundary ? ' history' : '');
      if (idx < maxAnim){ el.classList.add('flip'); el.style.animationDelay = (idx*12)+'ms'; }
      const gapText = r.interval !== null ? ('+' + r.interval + 'm') : 'selesai';
      const gapClass = gapChangedHere ? ' gap-changed' : '';
      el.innerHTML = '<span class="no">' + String(r.no).padStart(2,'0') + '</span><span>' + r.ritase + '</span><span class="unit">' + escapeHtml(String(r.unit)) + '</span>' +
        '<span class="jam-wrap"><span class="jam">' + r.jam + '</span><span class="gap-label' + gapClass + '">' + gapText + '</span></span>';
      body.appendChild(el);
    });

    const lastRow = body.querySelector('.row-item:last-child');
    if (lastRow) lastRow.classList.add('last-row');
    resultSection.style.display = 'block';
  }

  // Buat Jadwal Rute Ini
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      clearError();
      const cur = getActiveRoute();
      if (cur.committedSchedule && cur.committedSchedule.rows && cur.committedSchedule.rows.length){
        const ok = confirm('Ini akan menghapus histori jadwal rute "' + cur.name + '" hari ini dan membuat jadwal baru. Lanjutkan?');
        if (!ok) return;
      }
      const sched = generateScheduleForRoute(cur);
      if (!sched) return;
      lastSchedule = sched;
      resetAlarmTracking();
      render(lastSchedule);
      renderDirtyBanner();
      renderRouteBar();
      refreshPapanIfOpen();
      if (resultSection) resultSection.scrollIntoView({behavior:'smooth', block:'start'});
      showToast('Jadwal rute ' + cur.name + ' siap');
    });
  }

  // Buat Jadwal SEMUA RUTE Sekaligus
  if (generateAllBtn) {
    generateAllBtn.addEventListener('click', () => {
      clearError();
      const schedRoutes = state.routes.filter(r => r.activeInSchedule !== false);
      const ok = confirm('Hitung dan buat jadwal untuk ' + schedRoutes.length + ' rute yang aktif di jadwal berdasarkan jam operasional & ritase masing-masing?');
      if (!ok) return;

      let successCount = 0;
      const errors = [];
      schedRoutes.forEach(r => {
        const sched = generateScheduleForRoute(r, true);
        if (sched) successCount++;
        else errors.push(r.name);
      });

      resetAlarmTracking();
      const cur = getActiveRoute();
      if (cur.committedSchedule){
        lastSchedule = reconstructDisplaySchedule(cur);
        render(lastSchedule);
        renderDirtyBanner();
      }
      renderRouteBar();
      refreshPapanIfOpen();

      if (errors.length > 0){
        showToast('Selesai: ' + successCount + ' rute. Gagal: ' + errors.join(', '), 'error');
      } else {
        showToast(successCount + ' rute aktif berhasil dibuat jadwalnya!');
      }
    });
  }

  // Hitung Ulang Sisa Jadwal (Recalc)
  const recalcBtnEl = $('recalcBtn');
  if (recalcBtnEl) recalcBtnEl.addEventListener('click', recalcRemaining);
  function recalcRemaining(){
    const cur = getActiveRoute();
    const cs = cur.committedSchedule;
    if (!cs || !cs.rows || cs.rows.length === 0){ showToast('Belum ada jadwal yang dibuat', 'error'); return; }

    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    const startMinOriginal = toMinutes(cs.startLabel);
    const endMin = toMinutes(cs.endLabel);

    if (nowMin <= startMinOriginal){ showToast('Belum masuk jam operasional', 'error'); return; }
    if (nowMin >= endMin){ showToast('Sudah lewat jam selesai operasional', 'error'); return; }

    const history = cs.rows.filter(r => toMinutes(r.jam) <= nowMin);
    const completedCount = {};
    history.forEach(r => { completedCount[r.unit] = (completedCount[r.unit]||0) + 1; });

    const R = cs.R;
    const activeUnits = cur.departureOrder.map(id => {
      const u = cur.masterUnits.find(x => x.id === id);
      return u && u.active ? u.number : null;
    }).filter(Boolean);

    const withRemaining = activeUnits.map(u => {
      const done = completedCount[u] || 0;
      return { unit:u, remaining: Math.max(0, R - done), nextRitase: done+1 };
    }).filter(x => x.remaining > 0);

    if (withRemaining.length === 0){
      cur.committedSchedule.rows = history;
      cur.committedSchedule.recalcBoundaryIndex = history.length;
      cur.committedSchedule.lastRecalcLabel = toHHMM(nowMin);
      cur.scheduleDirty = false;
      saveState();
      resetAlarmTracking();
      lastSchedule = reconstructDisplaySchedule(cur);
      render(lastSchedule);
      renderDirtyBanner();
      renderRouteBar();
      refreshPapanIfOpen();
      showToast('Selesai &mdash; seluruh target ritase sudah terpenuhi');
      return;
    }

    const queue = [];
    const working = withRemaining.map(x => ({ unit:x.unit, remaining:x.remaining, nextRitase:x.nextRitase }));
    let anyLeft = true;
    while (anyLeft){
      anyLeft = false;
      for (const w of working){
        if (w.remaining > 0){
          queue.push({ unit:w.unit, ritase:w.nextRitase });
          w.nextRitase++; w.remaining--;
          if (w.remaining > 0) anyLeft = true;
        }
      }
    }

    const totalDep = queue.length;
    const peaksCfg = cur.peakEnabled ? [
      { s: toMinutes(cur.peak1Start), e: toMinutes(cur.peak1End), interval: parseInt(cur.peak1Interval) || 1 },
      { s: toMinutes(cur.peak2Start), e: toMinutes(cur.peak2End), interval: parseInt(cur.peak2Interval) || 1 }
    ] : [];

    const { offsets, segments, error } = buildTimeline(nowMin, endMin, totalDep, cur.peakEnabled, peaksCfg, cur.groupOrder);
    if (error){ showToast(error, 'error'); return; }

    const futureRows = [];
    let noCounter = history.length;
    for (let i=0; i<totalDep; i++){
      noCounter++;
      const timeMin = nowMin + offsets[i];
      const interval = i < totalDep - 1 ? (offsets[i+1] - offsets[i]) : null;
      futureRows.push({
        no: noCounter,
        ritase: queue[i].ritase,
        unit: queue[i].unit,
        jam: toHHMM(timeMin),
        interval,
        isPeak: isPeakAtOffset(segments, offsets[i]),
        routeId: cur.id,
        routeName: cur.name,
        routeColor: cur.color
      });
    }

    cur.committedSchedule.rows = history.concat(futureRows);
    cur.committedSchedule.recalcBoundaryIndex = history.length;
    cur.committedSchedule.lastRecalcLabel = toHHMM(nowMin);
    cur.committedSchedule.N = activeUnits.length;
    cur.scheduleDirty = false;
    saveState();
    resetAlarmTracking();

    lastSchedule = reconstructDisplaySchedule(cur);
    render(lastSchedule);
    renderDirtyBanner();
    renderRouteBar();
    refreshPapanIfOpen();
    showToast('Sisa jadwal ' + cur.name + ' dihitung ulang mulai ' + toHHMM(nowMin));
    resultSection.scrollIntoView({behavior:'smooth', block:'start'});
  }

  // Copy as Text (WhatsApp Optimized)
  const copyBtnEl = $('copyBtn');
  if (copyBtnEl) {
    copyBtnEl.addEventListener('click', () => {
      if (!lastSchedule) return;
    const cur = getActiveRoute();
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let text = '🚌 *JADWAL KEBERANGKATAN MIKROTRANS*\n';
    text += '📍 *Rute:* ' + cur.name + '\n';
    text += '📅 *Hari/Tanggal:* ' + dateFormatted + '\n';
    text += '⏰ *Jam Operasional:* ' + lastSchedule.startLabel + ' - ' + lastSchedule.endLabel + ' (' + lastSchedule.R + ' Rit)\n';
    text += '📊 *Total:* ' + lastSchedule.totalDep + ' Keberangkatan | ' + lastSchedule.N + ' Unit Aktif\n';
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    let curRitase = 0;
    lastSchedule.rows.forEach(r => {
      if (r.ritase !== curRitase){
        curRitase = r.ritase;
        text += '\n🔹 *RITASE ' + curRitase + '*\n';
      }
      const peakTag = r.isPeak ? ' ⚡[PEAK]' : '';
      const gapText = r.interval !== null ? ' (+' + r.interval + 'm)' : '';
      text += String(r.no).padStart(2, '0') + '. Unit *' + r.unit + '* ➔ ' + r.jam + gapText + peakTag + '\n';
    });
    text += '\n━━━━━━━━━━━━━━━━━━━━\n';
    text += '_Dipantau via Dispatcher Mikrotrans_';

    const btn = $('copyBtn');
    const doneMsg = () => {
      btn.innerHTML = '<span>Tersalin ke WA ✓</span>';
      btn.classList.add('copied');
      showToast('Jadwal tersalin, siap ditempel ke grup WhatsApp');
      setTimeout(()=>{
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Salin Teks (WA)</span>';
        btn.classList.remove('copied');
      }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(doneMsg).catch(()=>fallbackCopy(text,doneMsg));
    } else {
      fallbackCopy(text, doneMsg);
    }
    });
  }
  function fallbackCopy(text, cb){
    const ta = document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); cb(); }catch(e){}
    document.body.removeChild(ta);
  }

  function dateStamp(){
    const d = new Date();
    return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  }
  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ===== COMBINED MULTI-ROUTE SCHEDULE =====
  function buildCombinedSchedule(){
    const allRows = [];
    let activeRoutesCount = 0;

    const schedRoutes = state.routes.filter(r => r.activeInSchedule !== false);
    schedRoutes.forEach(r => {
      if (r.committedSchedule && r.committedSchedule.rows && r.committedSchedule.rows.length){
        activeRoutesCount++;
        r.committedSchedule.rows.forEach(row => {
          allRows.push({
            ...row,
            routeId: r.id,
            routeName: r.name,
            routeColor: r.color || '#FFB020'
          });
        });
      }
    });

    allRows.sort((a, b) => {
      const diff = toMinutes(a.jam) - toMinutes(b.jam);
      if (diff !== 0) return diff;
      return (a.routeName || '').localeCompare(b.routeName || '');
    });

    allRows.forEach((r, idx) => {
      r.combinedNo = idx + 1;
    });

    return {
      rows: allRows,
      routesCount: activeRoutesCount,
      totalDep: allRows.length
    };
  }

  // ===== MODE PAPAN DISPLAY & MONITOR GABUNGAN =====
  const papanOverlay = $('papanOverlay'), papanClock = $('papanClock'), papanRoute = $('papanRoute'),
        papanDate = $('papanDate'), papanBoardBody = $('papanBoardBody'), openPapanBtn = $('openPapanBtn'),
        openPapanCombinedBtn = $('openPapanCombinedBtn'), papanExitBtn = $('papanExitBtn'), papanBoardWrap = $('papanBoardWrap'),
        papanCountdownBar = $('papanCountdownBar'), papanCountdownLabel = $('papanCountdownLabel'),
        papanCountdownUnit = $('papanCountdownUnit'), papanCountdownTime = $('papanCountdownTime'),
        pmsActiveBtn = $('pmsActiveBtn'), pmsCombinedBtn = $('pmsCombinedBtn');

  let papanMode = 'active'; // 'active' | 'combined'
  let lastPapanNextIdx = null;
  let countdownWarningActive = false;
  let countdownWarningSoundTimer = null;

  if (pmsActiveBtn) {
    pmsActiveBtn.addEventListener('click', () => {
      papanMode = 'active';
      pmsActiveBtn.classList.add('active');
      if (pmsCombinedBtn) pmsCombinedBtn.classList.remove('active');
      renderPapanBoard();
    });
  }

  if (pmsCombinedBtn) {
    pmsCombinedBtn.addEventListener('click', () => {
      papanMode = 'combined';
      pmsCombinedBtn.classList.add('active');
      if (pmsActiveBtn) pmsActiveBtn.classList.remove('active');
      renderPapanBoard();
    });
  }

  function getActivePapanSchedule(){
    if (papanMode === 'combined'){
      return buildCombinedSchedule();
    }
    const cur = getActiveRoute();
    return cur.committedSchedule ? reconstructDisplaySchedule(cur) : lastSchedule;
  }

  function renderPapanBoard(){
    const sched = getActivePapanSchedule();
    pmsActiveBtn.classList.toggle('active', papanMode === 'active');
    pmsCombinedBtn.classList.toggle('active', papanMode === 'combined');

    papanDate.textContent = new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    if (!sched || !sched.rows || sched.rows.length === 0){
      papanRoute.textContent = papanMode === 'combined' ? 'MONITOR GABUNGAN (BELUM ADA JADWAL)' : ('RUTE ' + getActiveRoute().name + ' (BELUM ADA JADWAL)');
      papanBoardBody.innerHTML = '<div class="empty-note" style="padding:40px; font-size:16px;">Belum ada jadwal yang aktif. Buat jadwal di tab "Jadwal" terlebih dahulu.</div>';
      updatePapanCountdown(-1, new Date(), sched);
      return;
    }

    if (papanMode === 'combined'){
      papanRoute.innerHTML = '<span style="color:var(--blue);">&#127760;</span> MONITOR GABUNGAN &middot; ' + sched.routesCount + ' Rute Aktif &middot; ' + sched.totalDep + ' Keberangkatan';
      const headRow = papanBoardWrap.querySelector('.papan-head-row');
      if (headRow) headRow.innerHTML = '<span>Rute</span><span>No</span><span>Unit</span><span style="text-align:right;">Jam</span>';
    } else {
      const cur = getActiveRoute();
      papanRoute.textContent = cur.name + ' \u00B7 ' + cur.jamMulai + '-' + cur.jamSelesai + ' \u00B7 ' + cur.ritase + ' Rit';
      const headRow = papanBoardWrap.querySelector('.papan-head-row');
      if (headRow) headRow.innerHTML = '<span>No</span><span>Rit</span><span>Unit</span><span style="text-align:right;">Jam</span>';
    }

    papanBoardBody.innerHTML = '';
    let curRitase = 0;

    sched.rows.forEach((r, idx) => {
      if (papanMode !== 'combined' && r.ritase !== curRitase){
        curRitase = r.ritase;
        const div = document.createElement('div');
        div.className = 'papan-ritase-divider';
        div.textContent = 'RITASE ' + curRitase;
        papanBoardBody.appendChild(div);
      }

      const el = document.createElement('div');
      el.className = 'papan-row' + (r.isPeak ? ' peak' : '');
      el.setAttribute('data-ridx', idx);

      if (papanMode === 'combined'){
        const tag = '<span class="papan-route-tag" style="background:' + hexToRgba(r.routeColor, 0.22) + '; color:' + (r.routeColor || '#FFB020') + '; border:1px solid ' + (r.routeColor || '#FFB020') + '">' + escapeHtml(r.routeName) + '</span>';
        el.innerHTML =
          '<span>' + tag + '</span>' +
          '<span class="no">' + String(r.combinedNo || (idx+1)).padStart(2,'0') + '</span>' +
          '<span class="unit">' + escapeHtml(String(r.unit)) + ' <span style="font-size:11px; opacity:0.65; font-weight:normal;">(Rit ' + r.ritase + ')</span></span>' +
          '<span class="jam">' + r.jam + '<span class="papan-next-badge">Berikutnya</span></span>';
      } else {
        el.innerHTML =
          '<span class="no">' + String(r.no).padStart(2,'0') + '</span>' +
          '<span class="rit">' + r.ritase + '</span>' +
          '<span class="unit">' + escapeHtml(String(r.unit)) + '</span>' +
          '<span class="jam">' + r.jam + '<span class="papan-next-badge">Berikutnya</span></span>';
      }
      papanBoardBody.appendChild(el);
    });

    lastPapanNextIdx = null;
    updatePapanHighlight();
  }

  function centerPapanHighlight(smooth){
    if (!papanOverlay.classList.contains('show') || !papanBoardWrap) return;
    const target = papanBoardBody.querySelector('.papan-row.next-up');
    if (!target) return;
    const wrapRect = papanBoardWrap.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const currentScroll = papanBoardWrap.scrollTop;
    const maxScroll = Math.max(0, papanBoardWrap.scrollHeight - papanBoardWrap.clientHeight);
    const targetTopInContent = (targetRect.top - wrapRect.top) + currentScroll;
    const desired = targetTopInContent - (papanBoardWrap.clientHeight / 2) + (targetRect.height / 2);
    const clamped = Math.max(0, Math.min(desired, maxScroll));
    if (Math.abs(currentScroll - clamped) < 3) return;
    papanBoardWrap.scrollTo({ top: clamped, behavior: smooth ? 'smooth' : 'auto' });
  }

  function playCountdownWarningBeep(){
    beep(1500, 0.09, 0);
    beep(1500, 0.09, 0.16);
  }
  function startCountdownWarningSound(){
    stopCountdownWarningSound();
    playCountdownWarningBeep();
    countdownWarningSoundTimer = setInterval(playCountdownWarningBeep, 2000);
  }
  function stopCountdownWarningSound(){
    if (countdownWarningSoundTimer){ clearInterval(countdownWarningSoundTimer); countdownWarningSoundTimer = null; }
  }

  function updatePapanCountdown(nextIdx, now, sched){
    if (!sched || !sched.rows || nextIdx === -1 || nextIdx === null || !sched.rows.length){
      papanCountdownBar.classList.remove('warning', 'yellow-alert');
      papanCountdownLabel.textContent = 'JADWAL KEBERANGKATAN';
      papanCountdownUnit.textContent = '\u2014';
      papanCountdownTime.textContent = 'SELESAI';
      if (countdownWarningActive){ countdownWarningActive = false; stopCountdownWarningSound(); }
      return;
    }

    const row = sched.rows[nextIdx];
    const targetMin = toMinutes(row.jam);
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(targetMin/60), targetMin%60, 0, 0);
    const rawDiffSec = Math.round((targetDate - now) / 1000);
    const isNow = rawDiffSec <= 0;
    const diffSec = Math.max(0, rawDiffSec);
    const mm = String(Math.floor(diffSec/60)).padStart(2,'0');
    const ss = String(diffSec%60).padStart(2,'0');

    if (papanMode === 'combined' && row.routeName){
      papanCountdownUnit.innerHTML = '<span style="color:' + (row.routeColor || '#FFB020') + '">[' + escapeHtml(row.routeName) + ']</span> UNIT ' + escapeHtml(String(row.unit)).toUpperCase();
    } else {
      papanCountdownUnit.textContent = 'UNIT ' + String(row.unit).toUpperCase();
    }
    papanCountdownLabel.textContent = isNow ? 'SEDANG BERANGKAT' : 'BERANGKAT DALAM';
    papanCountdownTime.textContent = mm + ':' + ss;

    const cur = getActiveRoute();
    const prepThreshold = (cur && typeof cur.alarmPrepSeconds === 'number') ? cur.alarmPrepSeconds : 10;

    const isRedWarning = diffSec <= prepThreshold;
    papanCountdownBar.classList.toggle('warning', isRedWarning);
    papanCountdownBar.classList.toggle('yellow-alert', !isRedWarning);

    const shouldSound = diffSec > 0 && diffSec <= prepThreshold;
    if (shouldSound){
      if (!countdownWarningActive){
        countdownWarningActive = true;
        startCountdownWarningSound();
        if (navigator.vibrate) navigator.vibrate([250,120,250]);
      }
    } else if (countdownWarningActive){
      countdownWarningActive = false;
      stopCountdownWarningSound();
    }
  }

  let lastDismissedIdx = -1;

  function updatePapanHighlight(){
    if (!papanOverlay.classList.contains('show')) return;
    const sched = getActivePapanSchedule();
    if (!sched || !sched.rows || !sched.rows.length) return;
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();

    let nextIdx = -1;
    if (activeAlarmRows && activeAlarmRows.length > 0){
      let minIdx = Infinity;
      activeAlarmRows.forEach(r => {
        if (typeof r._idx === 'number' && r._idx < minIdx) minIdx = r._idx;
      });
      nextIdx = minIdx !== Infinity ? minIdx : 0;
    } else if (lastDismissedIdx >= 0){
      const candidate = lastDismissedIdx + 1;
      nextIdx = candidate < sched.rows.length ? candidate : -1;
    } else {
      for (let i=0; i<sched.rows.length; i++){
        if (toMinutes(sched.rows[i].jam) >= nowMin){ nextIdx = i; break; }
      }
    }

    papanBoardBody.querySelectorAll('.papan-row').forEach(el => {
      const idx = parseInt(el.getAttribute('data-ridx'), 10);
      el.classList.toggle('next-up', idx === nextIdx);
      el.classList.toggle('done', nextIdx === -1 ? true : idx < nextIdx);
    });

    updatePapanCountdown(nextIdx, now, sched);
    const indexChanged = nextIdx !== lastPapanNextIdx;
    if (indexChanged) lastPapanNextIdx = nextIdx;
    centerPapanHighlight(true);
  }

  function refreshPapanIfOpen(){
    if (papanOverlay.classList.contains('show')) renderPapanBoard();
  }

  window.addEventListener('resize', () => { if (papanOverlay.classList.contains('show')) centerPapanHighlight(false); });

  let wakeLockSentinel = null;
  async function requestWakeLock(){
    if (!('wakeLock' in navigator)) return;
    try{
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
    }catch(e){}
  }
  function releaseWakeLock(){
    if (wakeLockSentinel){ wakeLockSentinel.release().catch(()=>{}); wakeLockSentinel = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && papanOverlay.classList.contains('show') && !wakeLockSentinel){
      requestWakeLock();
    }
  });

  if (openPapanBtn) {
    openPapanBtn.addEventListener('click', () => {
      papanMode = 'active';
      openPapanModal();
    });
  }
  if (openPapanCombinedBtn) {
    openPapanCombinedBtn.addEventListener('click', () => {
      papanMode = 'combined';
      openPapanModal();
    });
  }
  const headerMonitorBtn = $('headerMonitorBtn');
  if (headerMonitorBtn) {
    headerMonitorBtn.addEventListener('click', () => {
      papanMode = 'active';
      openPapanModal();
    });
  }

  function openPapanModal(){
    const sched = getActivePapanSchedule();
    if (!sched || !sched.rows || !sched.rows.length){
      showToast('Belum ada jadwal yang siap untuk ditampilkan', 'error');
      return;
    }
    papanOverlay.classList.add('show');
    renderPapanBoard();
    requestWakeLock();
    const docEl = document.documentElement;
    const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
    if (req){ try{ req.call(docEl).catch(()=>{}); }catch(e){} }
  }

  function closePapanMode(){
    papanOverlay.classList.remove('show');
    releaseWakeLock();
    if (countdownWarningActive){ countdownWarningActive = false; stopCountdownWarningSound(); }
    papanCountdownBar.classList.remove('warning', 'yellow-alert');
    if (document.fullscreenElement){ document.exitFullscreen().catch(()=>{}); }
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen){ document.webkitExitFullscreen(); }
  }
  if (papanExitBtn) papanExitBtn.addEventListener('click', closePapanMode);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && papanOverlay.classList.contains('show')) closePapanMode(); });

  // ===== MULTI-ROUTE SIMULTANEOUS ALARM =====
  const alarmOverlay = $('alarmOverlay'), alarmOkBtn = $('alarmOkBtn'), alarmUnitsList = $('alarmUnitsList');
  let firedRowKeys = new Set();
  let activeAlarmRows = [];
  let alarmAutoStopTimer = null;
  let audioCtx = null;

  function resetAlarmTracking(){
    firedRowKeys = new Set();
    lastDismissedIdx = -1;
    if (alarmAutoStopTimer){ clearTimeout(alarmAutoStopTimer); alarmAutoStopTimer = null; }
    stopAlarmSound();
    alarmOverlay.classList.remove('show');
    activeAlarmRows = [];
  }

  function ensureAudioCtx(){
    if (!audioCtx){
      try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended'){ audioCtx.resume().catch(()=>{}); }
    return audioCtx;
  }
  document.addEventListener('pointerdown', ensureAudioCtx, { passive:true });

  function beep(freq, duration, when){
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + duration + 0.03);
  }
  function playAlarmChime(){
    beep(1000, 0.16, 0);
    beep(760, 0.16, 0.2);
  }
  let alarmSoundTimer = null;
  function startAlarmSound(){
    stopAlarmSound();
    playAlarmChime();
    alarmSoundTimer = setInterval(playAlarmChime, 900);
  }
  function stopAlarmSound(){
    if (alarmSoundTimer){ clearInterval(alarmSoundTimer); alarmSoundTimer = null; }
  }

  function announceSpeech(rows){
    if (!('speechSynthesis' in window)) return;
    try{
      window.speechSynthesis.cancel();
      const parts = rows.map(r => 'Rute ' + r.routeName + ', Unit ' + r.unit + ', saatnya berangkat.').join(' ');
      const utterance = new SpeechSynthesisUtterance(parts);
      utterance.lang = 'id-ID';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    }catch(e){}
  }

  function renderAlarmOverlay(){
    alarmUnitsList.innerHTML = '';
    alarmUnitsList.classList.toggle('single', activeAlarmRows.length === 1);

    activeAlarmRows.forEach(r => {
      const el = document.createElement('div');
      el.className = 'alarm-unit-row';
      const routeBadge = '<span style="font-weight:700; color:' + (r.routeColor || '#FFB020') + '; margin-right:6px;">[' + escapeHtml(r.routeName) + ']</span>';
      el.innerHTML =
        '<span class="au-jam">' + r.jam + '</span>' +
        '<span class="au-unit">' + routeBadge + 'UNIT ' + escapeHtml(String(r.unit)) + '</span>' +
        '<span class="au-meta">Ritase ' + r.ritase + ' &middot; Rute ' + escapeHtml(r.routeName) + '</span>';
      alarmUnitsList.appendChild(el);
    });
    alarmOverlay.classList.add('show');
  }

  function armAutoStop(){
    if (alarmAutoStopTimer) clearTimeout(alarmAutoStopTimer);
    const durSec = Math.max(1, Math.min(30, parseInt(getActiveRoute().alarmDuration) || 8));
    alarmAutoStopTimer = setTimeout(dismissAlarm, durSec * 1000);
  }

  function addRowsToAlarm(rows){
    if (countdownWarningActive){ countdownWarningActive = false; stopCountdownWarningSound(); }
    rows.forEach(r => {
      if (!activeAlarmRows.some(x => x.routeId === r.routeId && x.unit === r.unit && x.jam === r.jam)){
        activeAlarmRows.push(r);
      }
    });
    activeAlarmRows.sort((a,b) => toMinutes(a.jam) - toMinutes(b.jam) || a.no - b.no);
    renderAlarmOverlay();
    startAlarmSound();
    announceSpeech(activeAlarmRows);
    if (navigator.vibrate){ navigator.vibrate([400,150,400,150,600]); }
    armAutoStop();
  }

  function dismissAlarm(){
    if (alarmAutoStopTimer){ clearTimeout(alarmAutoStopTimer); alarmAutoStopTimer = null; }
    stopAlarmSound();
    alarmOverlay.classList.remove('show');
    if (activeAlarmRows && activeAlarmRows.length > 0){
      activeAlarmRows.forEach(r => {
        if (typeof r._idx === 'number' && r._idx > lastDismissedIdx){
          lastDismissedIdx = r._idx;
        }
      });
    }
    activeAlarmRows = [];
    updatePapanHighlight();
  }
  if (alarmOkBtn) alarmOkBtn.addEventListener('click', dismissAlarm);

  function checkAlarmTriggers(now){
    const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    const due = [];

    state.routes.forEach(r => {
      if (r.activeInSchedule === false) return;
      if (!r.alarmEnabled) return;
      if (!r.committedSchedule || !r.committedSchedule.rows || !r.committedSchedule.rows.length) return;
      r.committedSchedule.rows.forEach((row, idx) => {
        if (row.jam !== hhmm) return;
        const key = r.id + '|' + row.no + '|' + row.jam + '|' + row.unit;
        if (firedRowKeys.has(key)) return;
        firedRowKeys.add(key);
        due.push({
          ...row,
          routeId: r.id,
          routeName: r.name,
          routeColor: r.color,
          _idx: idx
        });
      });
    });

    if (due.length) addRowsToAlarm(due);
  }

  function masterTick(){
    const now = new Date();
    if (papanOverlay.classList.contains('show')){
      papanClock.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
      updatePapanHighlight();
    }
    checkAlarmTriggers(now);
  }
  setInterval(masterTick, 1000);
  masterTick();

  // ===== EXPORT (SINGLE & MULTI-ROUTE) =====
  const exportMenuBtn = $('exportMenuBtn');
  const SHIFT_OPTIONS = ['1 (Pagi)', '2 (Siang)', '3 (Malam)'];
  const FORMAT_OPTIONS = [
    { value:'xlsx', label:'Excel (.xlsx)' },
    { value:'pdf', label:'Dokumen PDF (.pdf)' },
    { value:'txt', label:'Teks (.txt)' },
    { value:'png', label:'Gambar (.png)' }
  ];
  const SWAL_DARK = { background:'#1D222A', color:'#ECEAE4' };

  function openExportMenu(){
    const cur = getActiveRoute();
    if (!cur.committedSchedule || !cur.committedSchedule.rows || !cur.committedSchedule.rows.length){
      showToast('Buat jadwal rute ' + cur.name + ' dulu sebelum export', 'error');
      return;
    }
    if (typeof Swal === 'undefined'){ showToast('Export butuh library UI', 'error'); return; }

    const routesWithSched = state.routes.filter(r => r.activeInSchedule !== false && r.committedSchedule && r.committedSchedule.rows && r.committedSchedule.rows.length);

    Swal.fire(Object.assign({
      title: 'Pilih Mode Export',
      html:
        '<div style="text-align:left; font-size:13px; line-height:1.6; margin-bottom:14px;">Pilih apakah ingin mengekspor rute aktif saat ini atau mengekspor seluruh rute sekaligus:</div>' +
        '<div style="display:flex; flex-direction:column; gap:10px;">' +
          '<button type="button" id="swalExportCurrentBtn" class="generate-btn-main" style="padding:12px; font-size:13px;">' +
            'Ekspor Rute Aktif (' + escapeHtml(cur.name) + ')' +
          '</button>' +
          '<button type="button" id="swalExportAllBtn" class="generate-btn-all" style="padding:12px; font-size:13px;">' +
            '&#127760; Ekspor Semua Rute (' + routesWithSched.length + ' Rute &middot; Multi-Sheet Excel)' +
          '</button>' +
        '</div>',
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Tutup',
      didOpen: () => {
        $('swalExportCurrentBtn').addEventListener('click', () => {
          Swal.close();
          showSingleExportForm(cur);
        });
        $('swalExportAllBtn').addEventListener('click', () => {
          Swal.close();
          exportAllRoutesXLSX();
        });
      }
    }, SWAL_DARK));
  }

  function showSingleExportForm(route){
    const sched = reconstructDisplaySchedule(route);
    const R = sched.R;
    const shiftOptionsHtml = SHIFT_OPTIONS.map(s => '<option value="' + s + '"' + ((route.lastShift || '') === s ? ' selected' : '') + '>' + s + '</option>').join('');
    const formatOptionsHtml = FORMAT_OPTIONS.map(f => '<option value="' + f.value + '">' + f.label + '</option>').join('');

    Swal.fire(Object.assign({
      title: 'Export Rute ' + escapeHtml(route.name),
      html:
        '<div class="export-route-badge" style="background:' + hexToRgba(route.color, 0.15) + '; color:' + route.color + '; border-color:' + route.color + '"><span class="dot" style="background:' + route.color + '"></span>Kode Rute: ' + escapeHtml(route.name) + '</div>' +
        '<div class="export-fields">' +
          '<div class="f"><label for="swalShift">Shift *</label>' +
            '<select id="swalShift"><option value="" disabled>Pilih Shift</option>' + shiftOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="export-fields">' +
          '<div class="f"><label for="swalRitaseFrom">Ritase Mulai Dari *</label><input type="number" id="swalRitaseFrom" min="1" placeholder="1" value="' + (route.lastRitaseFrom || 1) + '"></div>' +
          '<div class="f"><label for="swalRitaseTo">Rentang Ritase</label><input type="text" id="swalRitaseTo" readonly tabindex="-1" placeholder="' + R + ' gelombang"></div>' +
        '</div>' +
        '<div class="export-ritase-hint" id="swalRitaseHint"></div>' +
        '<div class="export-fields">' +
          '<div class="f"><label for="swalFormat">Format Export *</label>' +
            '<select id="swalFormat">' + formatOptionsHtml + '</select></div>' +
        '</div>',
      showCancelButton: true,
      confirmButtonText: 'Export Sekarang',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#FFB020', cancelButtonColor: '#333A46',
      didOpen: () => {
        const fromField = document.getElementById('swalRitaseFrom');
        const toField = document.getElementById('swalRitaseTo');
        const hint = document.getElementById('swalRitaseHint');
        const updatePreview = () => {
          const from = parseInt(fromField.value.trim(), 10) || 1;
          const to = from + R - 1;
          toField.value = from + '\u2013' + to;
          hint.textContent = 'Header tabel akan diberi nama Ritase ' + from + ' sampai Ritase ' + to + ' (' + R + ' gelombang).';
        };
        fromField.addEventListener('input', updatePreview);
        updatePreview();
      },
      preConfirm: () => {
        const shift = document.getElementById('swalShift').value;
        const ritaseFrom = parseInt(document.getElementById('swalRitaseFrom').value.trim(), 10) || 1;
        const format = document.getElementById('swalFormat').value;
        if (!shift){ Swal.showValidationMessage('Pilih shift'); return false; }
        return { kodeRute: route.name, shift, ritaseFrom, ritaseTo: ritaseFrom + R - 1, format };
      }
    }, SWAL_DARK)).then(res => {
      if (res.isConfirmed && res.value){
        doExportSingle(route, res.value);
      }
    });
  }

  function doExportSingle(route, data){
    const sched = reconstructDisplaySchedule(route);
    route.lastShift = data.shift;
    route.lastRitaseFrom = data.ritaseFrom;
    saveState();

    const labeledRows = sched.rows.map(r => Object.assign({}, r, { ritase: data.ritaseFrom + (r.ritase - 1) }));
    const now = new Date();
    const meta = {
      hari: now.toLocaleDateString('id-ID', { weekday: 'long' }),
      tanggal: now.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' }),
      kodeRute: data.kodeRute,
      shift: data.shift,
      ritaseRange: data.ritaseFrom + '\u2013' + data.ritaseTo,
      footer: 'Dibuat oleh PDO \u00B7 Rute ' + data.kodeRute + ' \u00B7 Shift ' + data.shift
    };

    if (data.format === 'xlsx') return exportSingleXLSX(route, meta, labeledRows, sched);
    if (data.format === 'pdf') return exportSinglePDF(route, meta, labeledRows, sched);
    if (data.format === 'txt') return exportSingleTXT(route, meta, labeledRows, sched);
    if (data.format === 'png') return exportSinglePNG(route, meta, labeledRows, sched);
  }

  function exportSingleTXT(route, meta, rows, sched){
    let text = 'JADWAL KEBERANGKATAN\n' + meta.hari + ', ' + meta.tanggal + '\n' +
      'Rute ' + meta.kodeRute + '   Shift ' + meta.shift + '\n' +
      '='.repeat(48) + '\n' +
      'Periode : ' + rows[0].jam + ' - ' + rows[rows.length-1].jam + '\n' +
      'Total   : ' + rows.length + ' keberangkatan (' + sched.N + ' unit, ' + meta.ritaseRange + ' rit)\n' +
      '='.repeat(48) + '\n';

    let curRit = 0;
    rows.forEach(r => {
      if (r.ritase !== curRit){ curRit = r.ritase; text += '\nRITASE ' + curRit + '\n' + '-'.repeat(48) + '\n'; }
      const noStr = String(r.no).padStart(3, ' ');
      const unitStr = ('Unit ' + r.unit).padEnd(12, ' ');
      const peakStr = r.isPeak ? '[PEAK] ' : '       ';
      const gapStr = r.interval !== null ? ('(+' + r.interval + 'm)') : '(selesai)';
      text += noStr + '. ' + unitStr + peakStr + r.jam + '  ' + gapStr + '\n';
    });
    text += '\n' + '='.repeat(48) + '\n' + meta.footer + '\n';
    downloadBlob(new Blob([text], {type:'text/plain'}), 'Jadwal_' + meta.kodeRute + '_' + dateStamp() + '.txt');
    showToast('File TXT terunduh');
  }

  function exportSingleXLSX(route, meta, rows, sched){
    if (typeof XLSX === 'undefined'){ showToast('Library XLSX belum dimuat', 'error'); return; }
    const aoa = [
      ['JADWAL KEBERANGKATAN ARMADA'],
      [meta.hari + ', ' + meta.tanggal],
      ['Rute: ' + meta.kodeRute, '', 'Shift: ' + meta.shift],
      ['Jam Operasional: ' + sched.startLabel + ' - ' + sched.endLabel, '', 'Total: ' + rows.length + ' Keberangkatan', '', 'Unit: ' + sched.N + ' Unit'],
      [],
      ['No', 'Ritase', 'Nomor Unit', 'Jam Berangkat', 'Interval (menit)', 'Keterangan']
    ];

    rows.forEach(r => {
      aoa.push([
        r.no,
        'Ritase ' + r.ritase,
        'Unit ' + r.unit,
        r.jam,
        r.interval !== null ? r.interval : '-',
        r.isPeak ? 'Jam Sibuk (Peak Hour)' : 'Normal'
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 }];
    const sheetName = route.name.replace(/[\\/?*[\]]/g, '').slice(0, 30) || 'Jadwal';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, 'Jadwal_' + meta.kodeRute + '_' + dateStamp() + '.xlsx');
    showToast('File Excel terunduh');
  }

  // Export SEMUA RUTE Sekaligus (Multi-Sheet XLSX)
  function exportAllRoutesXLSX(){
    if (typeof XLSX === 'undefined'){ showToast('Library XLSX belum siap', 'error'); return; }
    const routesWithSched = state.routes.filter(r => r.activeInSchedule !== false && r.committedSchedule && r.committedSchedule.rows && r.committedSchedule.rows.length);
    if (routesWithSched.length === 0){
      showToast('Belum ada rute dengan jadwal yang siap diekspor', 'error');
      return;
    }

    const wb = XLSX.utils.book_new();
    const now = new Date();
    const hari = now.toLocaleDateString('id-ID', { weekday: 'long' });
    const tanggal = now.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });

    // Sheet 1: Master Monitor Gabungan
    const combined = buildCombinedSchedule();
    const masterAoa = [
      ['MONITOR GABUNGAN KEBERANGKATAN SEMUA RUTE'],
      [hari + ', ' + tanggal],
      ['Total Rute: ' + combined.routesCount, '', 'Total Keberangkatan: ' + combined.totalDep],
      [],
      ['No Urut', 'Kode Rute', 'Nomor Unit', 'Ritase Ke', 'Jam Berangkat', 'Headway Sisa', 'Keterangan']
    ];

    combined.rows.forEach(r => {
      masterAoa.push([
        r.combinedNo,
        r.routeName,
        'Unit ' + r.unit,
        'Rit ' + r.ritase,
        r.jam,
        r.interval !== null ? (r.interval + ' menit') : '-',
        r.isPeak ? 'Jam Sibuk' : 'Normal'
      ]);
    });

    const masterWs = XLSX.utils.aoa_to_sheet(masterAoa);
    masterWs['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, masterWs, 'Master Gabungan');

    // Sheet 2..N: Tiap Rute Lembar Sendiri
    routesWithSched.forEach(r => {
      const sched = reconstructDisplaySchedule(r);
      const rAoa = [
        ['JADWAL KEBERANGKATAN RUTE ' + r.name],
        [hari + ', ' + tanggal],
        ['Jam Operasional: ' + sched.startLabel + ' - ' + sched.endLabel, '', 'Ritase: ' + r.ritase, '', 'Unit: ' + sched.N + ' Unit'],
        ['Jam Sibuk: ' + (r.peakEnabled ? 'Aktif' : 'Nonaktif'), '', 'Total: ' + sched.totalDep + ' Keberangkatan'],
        [],
        ['No', 'Ritase', 'Nomor Unit', 'Jam Berangkat', 'Interval (menit)', 'Keterangan']
      ];
      sched.rows.forEach(row => {
        rAoa.push([
          row.no,
          'Ritase ' + row.ritase,
          'Unit ' + row.unit,
          row.jam,
          row.interval !== null ? row.interval : '-',
          row.isPeak ? 'Jam Sibuk' : 'Normal'
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rAoa);
      ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
      const safeSheetName = r.name.replace(/[\\/?*[\]]/g, '').slice(0, 30) || 'Rute';
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
    });

    XLSX.writeFile(wb, 'Jadwal_Semua_Rute_' + dateStamp() + '.xlsx');
    showToast('File Excel semua rute (' + (routesWithSched.length + 1) + ' Sheet) terunduh!');
  }

  function exportSinglePDF(route, meta, rows, sched){
    if (typeof window.jspdf === 'undefined'){ showToast('Library PDF belum siap', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('JADWAL KEBERANGKATAN ARMADA', 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(meta.hari + ', ' + meta.tanggal, 14, 25);
    doc.text('Rute: ' + meta.kodeRute + '   Shift: ' + meta.shift + '   Ritase: ' + meta.ritaseRange, 14, 31);
    doc.text('Total: ' + rows.length + ' Keberangkatan   Unit: ' + sched.N + ' Unit   Jam: ' + sched.startLabel + ' - ' + sched.endLabel, 14, 37);

    let y = 47;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 5, 182, 7, 'F');
    doc.text('No', 16, y); doc.text('Ritase', 28, y); doc.text('Unit', 56, y);
    doc.text('Jam', 90, y); doc.text('Interval', 120, y); doc.text('Keterangan', 150, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    rows.forEach(r => {
      if (y > 280){ doc.addPage(); y = 20; }
      doc.text(String(r.no), 16, y);
      doc.text('Rit ' + r.ritase, 28, y);
      doc.text('Unit ' + r.unit, 56, y);
      doc.text(r.jam, 90, y);
      doc.text(r.interval !== null ? (r.interval + 'm') : '-', 120, y);
      doc.text(r.isPeak ? 'Jam Sibuk' : '-', 150, y);
      y += 5.5;
    });

    doc.save('Jadwal_' + meta.kodeRute + '_' + dateStamp() + '.pdf');
    showToast('File PDF terunduh');
  }

  function exportSinglePNG(route, meta, rows, sched){
    if (typeof html2canvas === 'undefined'){ showToast('Library html2canvas belum siap', 'error'); return; }
    html2canvas($('boardBody'), { backgroundColor: '#14171C' }).then(canvas => {
      canvas.toBlob(blob => {
        downloadBlob(blob, 'Jadwal_' + meta.kodeRute + '_' + dateStamp() + '.png');
        showToast('Gambar PNG terunduh');
      });
    }).catch(() => showToast('Gagal export gambar', 'error'));
  }

  if (exportMenuBtn) exportMenuBtn.addEventListener('click', openExportMenu);

  // ===== INITIALIZATION =====
  function updateHeaderHeight(){
    const header = document.querySelector('.app-header');
    if (header){
      const h = header.getBoundingClientRect().height;
      if (h > 0){
        document.documentElement.style.setProperty('--app-header-h', Math.round(h) + 'px');
      }
    }
  }
  window.addEventListener('resize', updateHeaderHeight, { passive: true });
  window.addEventListener('orientationchange', updateHeaderHeight, { passive: true });
  updateHeaderHeight();

  renderRouteBar();
  hydrateInputs();
  renderUnitList();
  updateActiveSummary();
  renderOrderList();

  const initialRoute = getActiveRoute();
  if (initialRoute.committedSchedule && initialRoute.committedSchedule.rows && initialRoute.committedSchedule.rows.length){
    lastSchedule = reconstructDisplaySchedule(initialRoute);
    render(lastSchedule);
  } else {
    // Generate initial schedule for route
    if (generateBtn) generateBtn.click();
  }
  renderDirtyBanner();

})();
