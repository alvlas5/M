(() => {
  'use strict';

  // ---------- DOM refs ----------
  const searchInput   = document.getElementById('searchInput');
  const searchBar      = document.getElementById('searchBar');
  const searchClear    = document.getElementById('searchClear');
  const btnMap         = document.getElementById('btnMap');
  const mapPanel        = document.getElementById('mapPanel');
  const listEl          = document.getElementById('list');
  const countChip       = document.getElementById('countChip');
  const statusPill      = document.getElementById('statusPill');
  const emptyState      = document.getElementById('emptyState');
  const installBanner   = document.getElementById('installBanner');
  const installBtn      = document.getElementById('installBtn');
  const installDismiss  = document.getElementById('installDismiss');

  // ---------- State ----------
  let mapVisible = false;
  let map = null;
  let markersLayer = null;
  const markerById = new Map();
  let filtered = MONITORING_OBJECTS.slice();

  // ---------- Helpers ----------
  const norm = (s) => (s || '').toString().toLowerCase()
    .replace(/ё/g, 'е');

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function iconMarkerSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3C8.6 3 6 5.6 6 9c0 4.6 6 12 6 12s6-7.4 6-12c0-3.4-2.6-6-6-6z" fill="currentColor"/>
      <circle cx="12" cy="9" r="2.3" fill="#0B2545"/>
    </svg>`;
  }

  // ---------- Rendering list ----------
  function renderList(items) {
    countChip.querySelector('.n').textContent = items.length;

    if (items.length === 0) {
      listEl.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    const frag = document.createDocumentFragment();
    items.forEach((obj) => {
      const card = document.createElement('div');
      card.className = 'obj-card';
      card.dataset.bs = obj.bs_number;
      card.innerHTML = `
        <div class="obj-card__icon">${iconMarkerSvg()}</div>
        <div class="obj-card__body">
          <div class="obj-card__top">
            <span class="obj-card__bs">БС ${escapeHtml(obj.bs_number)}</span>
            ${obj.name ? `<span class="obj-card__name">${escapeHtml(obj.name)}</span>` : ''}
          </div>
          <div class="obj-card__addr">${escapeHtml(obj.address)}</div>
        </div>
        <div class="obj-card__go">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      `;
      card.addEventListener('click', () => focusObject(obj));
      frag.appendChild(card);
    });
    listEl.innerHTML = '';
    listEl.appendChild(frag);
  }

  function applyFilter() {
    const q = norm(searchInput.value.trim());
    searchBar.classList.toggle('has-text', q.length > 0);

    if (!q) {
      filtered = MONITORING_OBJECTS.slice();
    } else {
      filtered = MONITORING_OBJECTS.filter((o) =>
        norm(o.bs_number).includes(q) ||
        norm(o.address).includes(q) ||
        norm(o.name).includes(q)
      );
    }
    renderList(filtered);
    if (mapVisible) syncMarkers(filtered);
  }

  // ---------- Map ----------
  function ensureMap() {
    if (map) return;
    map = L.map('map', { zoomControl: false }).setView([54.53, 36.26], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
  }

  function syncMarkers(items) {
    ensureMap();
    markersLayer.clearLayers();
    markerById.clear();

    const bounds = [];
    items.forEach((obj) => {
      const marker = L.marker([obj.lat, obj.lon]);
      marker.bindPopup(
        `<div class="popup-bs">БС ${escapeHtml(obj.bs_number)}</div>` +
        (obj.name ? `<div class="popup-name">${escapeHtml(obj.name)}</div>` : '') +
        `<div class="popup-addr">${escapeHtml(obj.address)}</div>`
      );
      marker.addTo(markersLayer);
      markerById.set(obj.bs_number, marker);
      bounds.push([obj.lat, obj.lon]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
    }
    setTimeout(() => map.invalidateSize(), 380);
  }

  function toggleMap(forceOpen) {
    mapVisible = typeof forceOpen === 'boolean' ? forceOpen : !mapVisible;
    mapPanel.classList.toggle('open', mapVisible);
    btnMap.classList.toggle('active', mapVisible);
    btnMap.querySelector('.btn-map__label').textContent = mapVisible ? 'Скрыть карту' : 'Показать карту';

    if (mapVisible) {
      ensureMap();
      syncMarkers(filtered);
    }
  }

  function focusObject(obj) {
    if (!mapVisible) toggleMap(true);
    setTimeout(() => {
      const marker = markerById.get(obj.bs_number);
      if (marker) {
        map.setView([obj.lat, obj.lon], 16, { animate: true });
        marker.openPopup();
      }
      mapPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, mapVisible ? 60 : 420);
  }

  // ---------- Events ----------
  searchInput.addEventListener('input', applyFilter);
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    applyFilter();
    searchInput.focus();
  });
  btnMap.addEventListener('click', () => toggleMap());

  // ---------- Online / offline status ----------
  function updateStatus() {
    const online = navigator.onLine;
    statusPill.classList.toggle('offline', !online);
    statusPill.querySelector('.status-text').textContent = online ? 'Онлайн' : 'Офлайн';
  }
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();

  // ---------- PWA install prompt ----------
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!localStorage.getItem('installDismissed')) {
      installBanner.classList.add('show');
    }
  });
  installBtn.addEventListener('click', async () => {
    installBanner.classList.remove('show');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
  });
  installDismiss.addEventListener('click', () => {
    installBanner.classList.remove('show');
    localStorage.setItem('installDismissed', '1');
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // ---------- Init ----------
  renderList(filtered);
})();
