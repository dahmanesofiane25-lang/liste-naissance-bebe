/* global fetch */
/**
 * Liste de naissance - Frontend public
 */
(() => {
  'use strict';

  const state = {
    items: [],
    currentCategory: 'all',
    currentItemId: null,
    meta: null,
  };

  // ---------- Helpers ----------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function formatPrice(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n));
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function toast(msg, type = 'success', ms = 3000) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast';
    if (type === 'error') el.classList.add('error');
    else if (type === 'info') el.classList.add('info');
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `http_${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- Confetti ----------
  function launchConfetti() {
    const container = $('#confettiContainer');
    const colors = ['#4A90D9', '#F4A261', '#48BB78', '#C0392B', '#D4A574', '#89CFF0', '#FFD700'];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDelay = Math.random() * 1.5 + 's';
      c.style.animationDuration = (2 + Math.random() * 2) + 's';
      c.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      c.style.width = (5 + Math.random() * 10) + 'px';
      c.style.height = (5 + Math.random() * 10) + 'px';
      container.appendChild(c);
    }
    setTimeout(() => { container.innerHTML = ''; }, 4000);
  }

  // ---------- Countdown ----------
  function startCountdown(targetDate) {
    const target = new Date(targetDate).getTime();
    function tick() {
      const now = Date.now();
      const diff = Math.max(0, target - now);
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      $('#days').textContent = String(d).padStart(2, '0');
      $('#hours').textContent = String(h).padStart(2, '0');
      $('#minutes').textContent = String(m).padStart(2, '0');
      $('#seconds').textContent = String(s).padStart(2, '0');
    }
    tick();
    setInterval(tick, 1000);
  }

  // ---------- Stats ----------
  function renderStats(stats) {
    const bar = $('#statsBar');
    if (!bar || !stats) return;
    bar.innerHTML = `
      <div class="stat-card">
        <div class="value">${stats.total_items}</div>
        <div class="label">Cadeaux</div>
      </div>
      <div class="stat-card">
        <div class="value">${stats.reserved_items}/${stats.total_items}</div>
        <div class="label">Réservés</div>
        <div class="progress-track"><div class="progress-bar" style="width: ${stats.progress_percent}%"></div></div>
      </div>
      <div class="stat-card">
        <div class="value">${formatPrice(stats.total_pool)}</div>
        <div class="label">Cagnotte</div>
      </div>
      <div class="stat-card">
        <div class="value">${stats.guestbook_count}</div>
        <div class="label">Messages</div>
      </div>
    `;
  }

  // ---------- Gifts rendering ----------
  const CATEGORY_LABELS = {
    essential: 'Essentiel',
    practical: 'Pratique',
    'coup-de-coeur': 'Coup de coeur',
  };

  function giftCard(item) {
    const reserved = item.is_reserved;
    const catLabel = CATEGORY_LABELS[item.category] || item.category;
    const reservedBy = reserved
      ? (item.reservation_is_anonymous ? 'Par un invité anonyme'
        : (item.reserved_by ? `Par ${escapeHtml(item.reserved_by)}` : 'Réservé'))
      : '';

    const imageContent = item.image_url
      ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.outerHTML='<span class=&quot;placeholder-emoji&quot;>${escapeHtml(item.emoji || '\ud83c\udf81')}</span>'" />`
      : `<span class="placeholder-emoji">${escapeHtml(item.emoji || '🎁')}</span>`;

    const poolBar = item.allow_pool && item.pool_collected > 0
      ? `<div class="pool-bar">
          <div class="pool-track"><div class="pool-fill" style="width: ${item.pool_progress}%"></div></div>
          <div class="pool-labels">
            <span>Cagnotte : <strong>${formatPrice(item.pool_collected)}</strong></span>
            <span>${item.pool_progress}%</span>
          </div>
        </div>`
      : '';

    const actions = reserved
      ? `<button class="btn-reserve" disabled>✅ Réservé</button>
         ${item.product_url ? `<a href="${escapeHtml(item.product_url)}" target="_blank" rel="noopener" class="btn-link" title="Voir le produit">🔗</a>` : ''}`
      : `<button class="btn-reserve" data-action="reserve" data-id="${item.id}">🎁 Réserver</button>
         ${item.allow_pool ? `<button class="btn-pool" data-action="pool" data-id="${item.id}">💰 Cagnotte</button>` : ''}
         ${item.product_url ? `<a href="${escapeHtml(item.product_url)}" target="_blank" rel="noopener" class="btn-link" title="Voir le produit">🔗</a>` : ''}`;

    return `
      <div class="gift-card ${reserved ? 'reserved' : ''}" data-id="${item.id}">
        ${reserved ? `<div class="reserved-overlay">
          <div class="reserved-text">✅ Déjà réservé</div>
          <div class="reserved-by">${reservedBy}</div>
        </div>` : ''}
        <div class="gift-image-wrap">${imageContent}</div>
        <div class="gift-content">
          <span class="gift-category ${item.category}">${catLabel}</span>
          <h3 class="gift-name">${escapeHtml(item.name)}</h3>
          <p class="gift-description">${escapeHtml(item.description || '')}</p>
          <div class="gift-price">${formatPrice(item.price)}</div>
          ${poolBar}
          <div class="gift-actions">${actions}</div>
        </div>
      </div>
    `;
  }

  function renderGifts() {
    const grid = $('#giftGrid');
    const list = state.currentCategory === 'all'
      ? state.items
      : state.items.filter(i => i.category === state.currentCategory);

    if (list.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Aucun cadeau dans cette catégorie pour le moment.</div>`;
      return;
    }
    grid.innerHTML = list.map(giftCard).join('');
  }

  async function loadItems() {
    try {
      state.items = await api('/api/items');
      renderGifts();
    } catch (err) {
      console.error(err);
      $('#giftGrid').innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Erreur de chargement. Réessayez plus tard.</div>`;
    }
  }

  // ---------- Category tabs ----------
  function initCategoryTabs() {
    $$('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentCategory = tab.dataset.category;
        renderGifts();
      });
    });
  }

  // ---------- Modal plumbing ----------
  function openModal(id) {
    $(`#${id}`).classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    $(`#${id}`).classList.remove('active');
    document.body.style.overflow = '';
  }
  function closeAllModals() {
    $$('.modal-overlay').forEach(m => m.classList.remove('active'));
    document.body.style.overflow = '';
  }

  function initModalClose() {
    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeAllModals();
      });
    });
    $$('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  // ---------- Reserve modal ----------
  function openReserveModal(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;
    state.currentItemId = itemId;
    $('#reserveTitle').textContent = `🎁 Réserver : ${item.name}`;
    $('#reserveName').value = '';
    $('#reserveAnon').checked = false;
    $('#reserveName').disabled = false;
    $('#reserveMsg').value = '';
    openModal('reserveModal');
    setTimeout(() => $('#reserveName').focus(), 100);
  }

  function initReserveModal() {
    $('#reserveAnon').addEventListener('change', e => {
      $('#reserveName').disabled = e.target.checked;
      if (e.target.checked) $('#reserveName').value = '';
    });

    $('#reserveConfirm').addEventListener('click', async () => {
      const isAnon = $('#reserveAnon').checked;
      const name = $('#reserveName').value.trim();
      const msg = $('#reserveMsg').value.trim();
      if (!isAnon && !name) {
        toast('Merci d\'entrer votre nom ou de cocher "anonyme".', 'error');
        return;
      }
      const btn = $('#reserveConfirm');
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        await api(`/api/items/${state.currentItemId}/reserve`, {
          method: 'POST',
          body: { guest_name: name, is_anonymous: isAnon, message: msg },
        });
        closeAllModals();
        toast('✨ Merci, votre réservation est enregistrée !');
        launchConfetti();
        await Promise.all([loadItems(), loadMeta()]);
      } catch (err) {
        if (err.status === 409) {
          toast('Oh, ce cadeau vient d\'être réservé par quelqu\'un d\'autre.', 'error');
          await loadItems();
          closeAllModals();
        } else {
          toast('Erreur : ' + (err.message || 'impossible d\'enregistrer'), 'error');
        }
      } finally {
        btn.disabled = false; btn.textContent = '✓ Confirmer';
      }
    });
  }

  // ---------- Pool (cagnotte) modal ----------
  function openPoolModal(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;
    state.currentItemId = itemId;
    $('#poolTitle').textContent = `💰 Cagnotte : ${item.name}`;
    const remaining = Math.max(0, (item.price || 0) - (item.pool_collected || 0));
    $('#poolInfo').innerHTML = `
      Prix total : <strong>${formatPrice(item.price)}</strong> —
      déjà collecté : <strong>${formatPrice(item.pool_collected)}</strong> —
      reste : <strong>${formatPrice(remaining)}</strong>
    `;
    $('#poolAmount').value = '';
    $('#poolName').value = '';
    $('#poolAnon').checked = false;
    $('#poolName').disabled = false;
    $('#poolMsg').value = '';
    openModal('poolModal');
    setTimeout(() => $('#poolAmount').focus(), 100);
  }

  function initPoolModal() {
    $$('.amount-suggestions button').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#poolAmount').value = btn.dataset.amount;
      });
    });

    $('#poolAnon').addEventListener('change', e => {
      $('#poolName').disabled = e.target.checked;
      if (e.target.checked) $('#poolName').value = '';
    });

    $('#poolConfirm').addEventListener('click', async () => {
      const amt = Number($('#poolAmount').value);
      const isAnon = $('#poolAnon').checked;
      const name = $('#poolName').value.trim();
      const msg = $('#poolMsg').value.trim();
      if (!(amt > 0)) {
        toast('Entrez un montant supérieur à 0.', 'error');
        return;
      }
      if (!isAnon && !name) {
        toast('Merci d\'entrer votre nom ou de cocher "anonyme".', 'error');
        return;
      }
      const btn = $('#poolConfirm');
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        await api(`/api/items/${state.currentItemId}/contribute`, {
          method: 'POST',
          body: { guest_name: name, is_anonymous: isAnon, amount: amt, message: msg },
        });
        closeAllModals();
        toast('💝 Merci pour votre contribution !');
        launchConfetti();
        await Promise.all([loadItems(), loadMeta()]);
      } catch (err) {
        toast('Erreur : ' + (err.message || 'impossible d\'enregistrer'), 'error');
      } finally {
        btn.disabled = false; btn.textContent = '✓ Je contribue';
      }
    });
  }

  // ---------- Delegated actions on gift grid ----------
  function initGiftActions() {
    $('#giftGrid').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'reserve') openReserveModal(id);
      else if (btn.dataset.action === 'pool') openPoolModal(id);
    });
  }

  // ---------- Guestbook ----------
  async function loadGuestbook() {
    try {
      const msgs = await api('/api/guestbook');
      const grid = $('#messagesGrid');
      if (msgs.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">Soyez le premier à laisser un message !</div>`;
        return;
      }
      grid.innerHTML = msgs.map(m => `
        <div class="message-card">
          <div class="msg-author">${escapeHtml(m.author)}</div>
          <div class="msg-text">${escapeHtml(m.message)}</div>
          <div class="msg-date">${new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      `).join('');
    } catch (err) {
      console.error('[guestbook]', err);
    }
  }

  function initGuestbook() {
    $('#gbSubmit').addEventListener('click', async () => {
      const author = $('#gbAuthor').value.trim();
      const message = $('#gbMessage').value.trim();
      if (!author || !message) {
        toast('Merci d\'entrer votre nom et votre message.', 'error');
        return;
      }
      const btn = $('#gbSubmit');
      btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        await api('/api/guestbook', { method: 'POST', body: { author, message } });
        $('#gbAuthor').value = '';
        $('#gbMessage').value = '';
        toast('💌 Merci pour votre message !');
        launchConfetti();
        await Promise.all([loadGuestbook(), loadMeta()]);
      } catch (err) {
        toast('Erreur : ' + (err.message || 'impossible d\'envoyer'), 'error');
      } finally {
        btn.disabled = false; btn.textContent = '💬 Envoyer';
      }
    });
  }

  // ---------- Guess name ----------
  async function loadGuessCount() {
    try {
      const data = await api('/api/guess-count');
      const el = $('#guessCount');
      if (data.count === 0) {
        el.innerHTML = 'Soyez le premier à proposer !';
      } else {
        el.innerHTML = `<strong>${data.count}</strong> proposition${data.count > 1 ? 's' : ''} déjà enregistrée${data.count > 1 ? 's' : ''}. Et la vôtre ?`;
      }
    } catch { /* ignore */ }
  }

  function initGuessForm() {
    $('#guessForm').addEventListener('submit', async e => {
      e.preventDefault();
      const author = $('#guessAuthor').value.trim();
      const guess = $('#guessName').value.trim();
      const reason = $('#guessReason').value.trim();
      if (!author || !guess) {
        toast('Nom et prénom proposé sont requis.', 'error');
        return;
      }
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        await api('/api/guess-name', { method: 'POST', body: { author, guess, reason } });
        $('#guessAuthor').value = '';
        $('#guessName').value = '';
        $('#guessReason').value = '';
        toast('🔮 Proposition enregistrée, bonne chance !');
        launchConfetti();
        await loadGuessCount();
      } catch (err) {
        toast('Erreur : ' + (err.message || 'impossible d\'enregistrer'), 'error');
      } finally {
        btn.disabled = false; btn.textContent = '🎉 Valider ma proposition';
      }
    });
  }

  // ---------- Meta / init ----------
  async function loadMeta() {
    try {
      const meta = await api('/api/meta');
      state.meta = meta;
      if (meta.parents) {
        const label = `${meta.parents.parent_1} & ${meta.parents.parent_2}`;
        $('#parentsLabel').textContent = label;
        $('#navBrand').textContent = label;
      }
      if (meta.birth_date) startCountdownOnce(meta.birth_date);
      renderStats(meta.stats);
    } catch (err) {
      console.error('[meta]', err);
    }
  }

  let countdownStarted = false;
  function startCountdownOnce(date) {
    if (countdownStarted) return;
    countdownStarted = true;
    startCountdown(date);
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    initCategoryTabs();
    initModalClose();
    initReserveModal();
    initPoolModal();
    initGiftActions();
    initGuestbook();
    initGuessForm();

    loadMeta();
    loadItems();
    loadGuestbook();
    loadGuessCount();
  });
})();
