/**
 * Liste de naissance — Petit bonhomme
 * Front-end : intro, countdown, liste, réservation, cagnotte, confetti
 */
(function () {
  'use strict';

  // ===================================================================
  // 1. INTRO OVERLAY
  // ===================================================================
  const intro = document.getElementById('introOverlay');
  const SEEN_KEY = 'birthlist_intro_seen_v1';
  const alreadySeen = sessionStorage.getItem(SEEN_KEY);

  if (alreadySeen) {
    intro.classList.add('gone');
    document.body.style.overflow = '';
  } else {
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      intro.classList.add('gone');
      document.body.style.overflow = '';
      sessionStorage.setItem(SEEN_KEY, '1');
    }, 3800);
    // Skip en cliquant
    intro.addEventListener('click', () => {
      intro.classList.add('gone');
      document.body.style.overflow = '';
      sessionStorage.setItem(SEEN_KEY, '1');
    });
  }

  // ===================================================================
  // 2. COUNTDOWN
  // ===================================================================
  const DUE_DATE = new Date('2026-08-07T00:00:00+02:00').getTime();
  const countdownEls = {
    d: document.querySelector('[data-k="d"]'),
    h: document.querySelector('[data-k="h"]'),
    m: document.querySelector('[data-k="m"]'),
    s: document.querySelector('[data-k="s"]'),
  };

  function updateCountdown() {
    const now = Date.now();
    let delta = Math.max(0, DUE_DATE - now);
    const d = Math.floor(delta / 86400000); delta -= d * 86400000;
    const h = Math.floor(delta / 3600000);  delta -= h * 3600000;
    const m = Math.floor(delta / 60000);    delta -= m * 60000;
    const s = Math.floor(delta / 1000);
    countdownEls.d.textContent = String(d).padStart(2, '0');
    countdownEls.h.textContent = String(h).padStart(2, '0');
    countdownEls.m.textContent = String(m).padStart(2, '0');
    countdownEls.s.textContent = String(s).padStart(2, '0');
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // ===================================================================
  // 3. STATE + API
  // ===================================================================
  const state = { gifts: [], filter: 'all' };
  const tokens = JSON.parse(localStorage.getItem('birthlist_tokens') || '{}');
  const saveTokens = () => localStorage.setItem('birthlist_tokens', JSON.stringify(tokens));

  const api = {
    async list() {
      const r = await fetch('/api/gifts');
      if (!r.ok) throw new Error('Impossible de charger la liste');
      return r.json();
    },
    async reserve(id, payload) {
      const r = await fetch(`/api/gifts/${id}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erreur');
      return data;
    },
    async contribute(id, payload) {
      const r = await fetch(`/api/gifts/${id}/contribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erreur');
      return data;
    },
  };

  // ===================================================================
  // 4. RENDU
  // ===================================================================
  const grid = document.getElementById('giftsGrid');

  const eur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  const eur2 = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function categoryLabel(c) {
    return { essential: 'Essentiel', practical: 'Pratique', 'coup-de-coeur': 'Coup de cœur', cagnotte: 'Cagnotte' }[c] || c;
  }

  function renderGift(gift) {
    const isPool = gift.type === 'pool';
    const isReserved = !isPool && gift.reserved;
    const card = document.createElement('article');
    card.className = 'gift-card' + (isReserved ? ' reserved' : '');
    card.dataset.category = gift.category;

    let actionsHtml = '';
    if (isPool) {
      const pct = Math.min(100, (gift.collected / gift.goal) * 100);
      actionsHtml = `
        <div class="pool-block">
          <div class="pool-progress"><div class="pool-bar" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="pool-stats">
            <span><strong>${eur(gift.collected)}</strong> collectés</span>
            <span>sur ${eur(gift.goal)}</span>
          </div>
          <div class="pool-stats" style="margin-top:4px">
            <span>${gift.contributorsCount} participation${gift.contributorsCount > 1 ? 's' : ''}</span>
            <span>${pct.toFixed(0)} %</span>
          </div>
        </div>
        <div class="gift-actions">
          <button class="btn btn-pool" data-action="contribute" data-id="${gift.id}">💝 Participer</button>
        </div>`;
    } else {
      const reservedByText = isReserved
        ? (gift.reservedAnonymous ? 'Réservé par un invité anonyme' : `Réservé par ${esc(gift.reservedBy)}`)
        : '';
      const canUnreserve = isReserved && tokens[gift.id];
      actionsHtml = `
        ${isReserved ? `<div class="reserved-by">${reservedByText}</div>` : ''}
        <div class="gift-actions">
          ${isReserved
            ? (canUnreserve
                ? `<button class="btn btn-ghost" data-action="unreserve" data-id="${gift.id}">Annuler ma réservation</button>`
                : `<button class="btn btn-primary" disabled>✓ Déjà réservé</button>`)
            : `<button class="btn btn-primary" data-action="reserve" data-id="${gift.id}">🎁 Réserver</button>`}
          ${gift.link ? `<a class="btn btn-link" href="${esc(gift.link)}" target="_blank" rel="noopener">Voir ↗</a>` : ''}
        </div>`;
    }

    card.innerHTML = `
      <div class="gift-visual">
        <span class="gift-tag ${esc(gift.category)}">${categoryLabel(gift.category)}</span>
        ${isReserved ? `<span class="reserved-stamp">✓ Réservé</span>` : ''}
        <span class="gift-emoji">${gift.emoji || '🎁'}</span>
      </div>
      <div class="gift-body">
        ${gift.brand ? `<div class="gift-brand">${esc(gift.brand)}</div>` : ''}
        <h3 class="gift-name">${esc(gift.name)}</h3>
        <p class="gift-desc">${esc(gift.description)}</p>
        <div class="gift-price">${isPool ? `Objectif : ${eur(gift.goal)}` : eur2(gift.price)}</div>
        ${actionsHtml}
      </div>
    `;
    return card;
  }

  function renderAll() {
    grid.innerHTML = '';
    const filtered = state.gifts.filter((g) => {
      if (state.filter === 'all') return true;
      if (state.filter === 'cagnotte') return g.type === 'pool';
      return g.category === state.filter;
    });
    if (!filtered.length) {
      grid.innerHTML = '<div class="grid-loader">Aucun cadeau dans cette catégorie.</div>';
      return;
    }
    filtered.forEach((g, i) => {
      const card = renderGift(g);
      card.style.animationDelay = `${i * 40}ms`;
      grid.appendChild(card);
    });
  }

  // ===================================================================
  // 5. FILTRES
  // ===================================================================
  document.getElementById('filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter');
    if (!btn) return;
    document.querySelectorAll('.filter').forEach((f) => f.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    renderAll();
  });

  // ===================================================================
  // 6. MODALES
  // ===================================================================
  const overlay = document.getElementById('modalOverlay');
  const modalReserve = document.getElementById('modalReserve');
  const modalPool = document.getElementById('modalPool');
  const modalSuccess = document.getElementById('modalSuccess');

  function openModal(which, data) {
    [modalReserve, modalPool, modalSuccess].forEach((m) => (m.hidden = true));
    which.hidden = false;
    overlay.classList.add('active');
    overlay.dataset.currentGift = data && data.id ? data.id : '';
    if (data && data.gift) {
      const g = data.gift;
      if (which === modalReserve) {
        modalReserve.querySelector('#modalReserveTitle').textContent = `Réserver : ${g.name}`;
        modalReserve.querySelector('#modalReserveSubtitle').textContent = `${g.brand ? g.brand + ' · ' : ''}${eur2(g.price)}`;
        modalReserve.querySelector('form').reset();
        modalReserve.querySelector('#reserveError').hidden = true;
      } else if (which === modalPool) {
        modalPool.querySelector('#modalPoolTitle').textContent = `Cagnotte : ${g.name}`;
        const remaining = Math.max(0, g.goal - g.collected);
        modalPool.querySelector('#modalPoolSubtitle').textContent = `Objectif ${eur(g.goal)} · il reste ${eur(remaining)} à collecter`;
        modalPool.querySelector('form').reset();
        modalPool.querySelector('#poolError').hidden = true;
        modalPool.querySelectorAll('.amount-presets button').forEach((b) => b.classList.remove('active'));
      }
    }
  }

  function closeModal() {
    overlay.classList.remove('active');
    setTimeout(() => {
      [modalReserve, modalPool, modalSuccess].forEach((m) => (m.hidden = true));
    }, 200);
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.matches('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('active')) closeModal();
  });

  // ===================================================================
  // 7. ACTIONS (délégation)
  // ===================================================================
  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const gift = state.gifts.find((g) => g.id === id);
    if (!gift) return;

    if (btn.dataset.action === 'reserve') {
      openModal(modalReserve, { id, gift });
    } else if (btn.dataset.action === 'contribute') {
      openModal(modalPool, { id, gift });
    } else if (btn.dataset.action === 'unreserve') {
      if (!confirm('Annuler ta réservation pour "' + gift.name + '" ?')) return;
      try {
        const r = await fetch(`/api/gifts/${id}/reserve`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokens[id] }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Erreur');
        delete tokens[id]; saveTokens();
        await reload();
        showToast('Réservation annulée');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  // ===================================================================
  // 8. FORMULAIRE RÉSERVATION
  // ===================================================================
  document.getElementById('reserveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const isAnonymous = !!data.isAnonymous;
    if (!isAnonymous && !String(data.guestName || '').trim()) {
      return showError('reserveError', 'Merci d\'indiquer votre prénom (ou cochez anonyme).');
    }
    const id = overlay.dataset.currentGift;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'Envoi…';
    try {
      const result = await api.reserve(id, {
        guestName: data.guestName,
        isAnonymous,
        message: data.message,
      });
      tokens[id] = result.token; saveTokens();
      await reload();
      celebrate();
      openModal(modalSuccess);
      document.getElementById('modalSuccessText').textContent =
        `Le cadeau est à vous ! Nous avons hâte de découvrir votre attention.`;
    } catch (err) {
      showError('reserveError', err.message);
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Confirmer la réservation';
    }
  });

  // ===================================================================
  // 9. FORMULAIRE CAGNOTTE
  // ===================================================================
  const poolPresets = document.getElementById('amountPresets');
  poolPresets.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    poolPresets.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelector('#poolForm input[name="amount"]').value = b.dataset.amount;
  });

  document.getElementById('poolForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const isAnonymous = !!data.isAnonymous;
    const amount = Number(data.amount);
    if (!isAnonymous && !String(data.guestName || '').trim()) {
      return showError('poolError', 'Merci d\'indiquer votre prénom.');
    }
    if (!(amount > 0)) {
      return showError('poolError', 'Merci de choisir un montant.');
    }
    const id = overlay.dataset.currentGift;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'Envoi…';
    try {
      await api.contribute(id, {
        guestName: data.guestName,
        isAnonymous,
        amount,
        message: data.message,
      });
      await reload();
      celebrate();
      openModal(modalSuccess);
      document.getElementById('modalSuccessText').textContent =
        `Votre participation de ${eur2(amount)} est enregistrée. Merci !`;
    } catch (err) {
      showError('poolError', err.message);
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Confirmer ma participation';
    }
  });

  // ===================================================================
  // 10. UTILS
  // ===================================================================
  function showError(elId, msg) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.hidden = false;
  }
  function showToast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  async function reload() {
    try {
      const data = await api.list();
      state.gifts = data.gifts;
      renderAll();
    } catch (err) {
      grid.innerHTML = `<div class="grid-loader" style="color:#a9432d">${err.message}</div>`;
    }
  }

  // ===================================================================
  // 11. CONFETTI (canvas léger)
  // ===================================================================
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  function fitCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  const CONFETTI_COLORS = ['#c89454', '#e8c07d', '#2a5a8a', '#a9c8e3', '#a9432d', '#f7f1e6'];

  function celebrate() {
    const particles = [];
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -12 - 4,
        g: 0.3,
        size: 4 + Math.random() * 6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.25,
        life: 120,
      });
    }
    let start = performance.now();
    function frame(t) {
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of particles) {
        if (p.life <= 0) continue;
        alive++;
        p.vy += p.g;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / 120);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive > 0 && elapsed < 4000) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  }

  // ===================================================================
  // 12. INIT
  // ===================================================================
  reload();
})();
