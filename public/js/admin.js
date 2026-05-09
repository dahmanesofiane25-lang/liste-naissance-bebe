/* global fetch */
/**
 * Liste de naissance - Admin dashboard
 */
(() => {
  'use strict';

  const state = {
    items: [],
    reservations: [],
    contributions: [],
    guestbook: [],
    guesses: [],
    currentPanel: 'items',
    editingId: null,
  };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function formatPrice(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n));
  }
  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
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

  // ---------- Auth ----------
  async function checkAuth() {
    try {
      const me = await api('/api/admin/me');
      $('#adminUsername').textContent = me.admin.username;
      showDashboard();
      await loadAll();
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    $('#loginScreen').style.display = 'flex';
    $('#adminApp').classList.remove('active');
  }
  function showDashboard() {
    $('#loginScreen').style.display = 'none';
    $('#adminApp').classList.add('active');
  }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('#loginUsername').value.trim();
    const password = $('#loginPassword').value;
    $('#loginError').textContent = '';
    try {
      const res = await api('/api/admin/login', { method: 'POST', body: { username, password } });
      $('#adminUsername').textContent = res.admin.username;
      showDashboard();
      await loadAll();
      $('#loginPassword').value = '';
    } catch (err) {
      $('#loginError').textContent = err.status === 429
        ? 'Trop de tentatives, patientez 15 min.'
        : 'Identifiants invalides.';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  // ---------- Tabs ----------
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.panel').forEach(p => p.classList.remove('active'));
      const target = tab.dataset.panel;
      $(`#panel${target.charAt(0).toUpperCase() + target.slice(1)}`).classList.add('active');
      state.currentPanel = target;
    });
  });

  // ---------- Load all data ----------
  async function loadAll() {
    await Promise.all([
      loadItems(),
      loadReservations(),
      loadContributions(),
      loadGuestbook(),
      loadGuesses(),
      loadStats(),
    ]);
  }

  async function loadStats() {
    try {
      const meta = await api('/api/meta');
      const s = meta.stats;
      $('#adminStats').innerHTML = `
        <div class="admin-stat"><div class="val">${s.total_items}</div><div class="lbl">Cadeaux actifs</div></div>
        <div class="admin-stat success"><div class="val">${s.reserved_items}</div><div class="lbl">Réservés</div></div>
        <div class="admin-stat accent"><div class="val">${formatPrice(s.total_pool)}</div><div class="lbl">Cagnotte totale</div></div>
        <div class="admin-stat kabyle"><div class="val">${s.guestbook_count}</div><div class="lbl">Messages</div></div>
        <div class="admin-stat"><div class="val">${s.guess_count}</div><div class="lbl">Prénoms proposés</div></div>
      `;
    } catch (err) { console.error('[stats]', err); }
  }

  // ---------- Items ----------
  async function loadItems() {
    try {
      state.items = await api('/api/admin/items');
      $('#badgeItems').textContent = state.items.filter(i => !i.archived).length;
      renderItems();
    } catch (err) { console.error('[items]', err); }
  }

  function renderItems() {
    const list = $('#itemsList');
    if (state.items.length === 0) {
      list.innerHTML = `<div class="empty-admin" style="grid-column: 1 / -1;">Aucun cadeau. Cliquez sur "Ajouter un cadeau" pour commencer.</div>`;
      return;
    }
    list.innerHTML = state.items.map(item => {
      const thumb = item.image_url
        ? `<img src="${escapeHtml(item.image_url)}" alt="" onerror="this.outerHTML='<span>${escapeHtml(item.emoji || '\ud83c\udf81')}</span>'" />`
        : `<span>${escapeHtml(item.emoji || '🎁')}</span>`;
      const tags = [
        `<span class="tag tag-${item.category}">${item.category}</span>`,
        item.archived ? `<span class="tag tag-archived">archivé</span>` : '',
        item.is_reserved ? `<span class="tag tag-reserved">réservé</span>` : '',
        item.pool_collected > 0 ? `<span class="tag tag-pool">${formatPrice(item.pool_collected)} collectés</span>` : '',
      ].filter(Boolean).join('');
      return `
        <div class="admin-item">
          <div class="thumb">${thumb}</div>
          <div class="info">
            <div class="title">${escapeHtml(item.name)}</div>
            <div class="meta">${formatPrice(item.price)} · ordre ${item.sort_order}</div>
            <div class="tags">${tags}</div>
            <div class="actions">
              <button class="btn-small" data-action="edit" data-id="${item.id}">✏️ Modifier</button>
              ${item.is_reserved ? `<button class="btn-small" data-action="unreserve" data-id="${item.id}">🔓 Libérer</button>` : ''}
              <button class="btn-small danger" data-action="delete" data-id="${item.id}">🗑 Supprimer</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  $('#itemsList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'edit') openItemModal(id);
    else if (action === 'delete') {
      if (!confirm('Supprimer ce cadeau ? Cette action supprimera aussi les réservations et contributions associées.')) return;
      try {
        await api(`/api/admin/items/${id}`, { method: 'DELETE' });
        toast('Cadeau supprimé');
        await loadAll();
      } catch (err) { toast('Erreur : ' + err.message, 'error'); }
    } else if (action === 'unreserve') {
      if (!confirm('Libérer ce cadeau ? La réservation sera supprimée.')) return;
      try {
        await api(`/api/admin/reservations/item/${id}`, { method: 'DELETE' });
        toast('Cadeau libéré');
        await loadAll();
      } catch (err) { toast('Erreur : ' + err.message, 'error'); }
    }
  });

  // ---------- Item modal ----------
  $('#btnAddItem').addEventListener('click', () => openItemModal(null));

  function openItemModal(id) {
    state.editingId = id;
    const item = id ? state.items.find(i => i.id === id) : null;
    $('#itemModalTitle').textContent = item ? `Modifier : ${item.name}` : 'Nouveau cadeau';
    $('#itemId').value = item?.id || '';
    $('#itemName').value = item?.name || '';
    $('#itemDescription').value = item?.description || '';
    $('#itemPrice').value = item?.price || '';
    $('#itemCategory').value = item?.category || 'essential';
    $('#itemImageUrl').value = item?.image_url || '';
    $('#itemProductUrl').value = item?.product_url || '';
    $('#itemEmoji').value = item?.emoji || '';
    $('#itemSortOrder').value = item?.sort_order ?? state.items.length;
    $('#itemAllowPool').checked = item ? !!item.allow_pool : true;
    $('#itemArchived').checked = item ? !!item.archived : false;
    $('#scrapeUrl').value = '';
    $('#itemModal').classList.add('active');
    setTimeout(() => $('#itemName').focus(), 100);
  }

  function closeModal() {
    $('#itemModal').classList.remove('active');
    state.editingId = null;
  }

  $$('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
  $('#itemModal').addEventListener('click', e => {
    if (e.target === $('#itemModal')) closeModal();
  });

  // Scraper
  $('#scrapeBtn').addEventListener('click', async () => {
    const url = $('#scrapeUrl').value.trim();
    if (!url) {
      toast('Coller une URL', 'error');
      return;
    }
    const btn = $('#scrapeBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Analyse…';
    try {
      const res = await api('/api/admin/scrape', { method: 'POST', body: { url } });
      const d = res.data;
      if (d.name && !$('#itemName').value) $('#itemName').value = d.name;
      else if (d.name) {
        if (confirm(`Remplacer le nom actuel par :\n"${d.name}" ?`)) $('#itemName').value = d.name;
      }
      if (d.description && !$('#itemDescription').value) $('#itemDescription').value = d.description;
      if (d.price !== null && d.price !== undefined && !$('#itemPrice').value) $('#itemPrice').value = d.price;
      else if (d.price !== null && d.price !== undefined) {
        if (confirm(`Remplacer le prix actuel par : ${d.price} € ?`)) $('#itemPrice').value = d.price;
      }
      if (d.image_url) $('#itemImageUrl').value = d.image_url;
      if (d.product_url) $('#itemProductUrl').value = d.product_url;
      toast('✓ Données récupérées');
    } catch (err) {
      toast('Échec du scraping : ' + (err.data?.message || err.message), 'error', 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Remplir auto';
    }
  });

  // Save item
  $('#itemForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      name: $('#itemName').value.trim(),
      description: $('#itemDescription').value.trim(),
      price: Number($('#itemPrice').value),
      category: $('#itemCategory').value,
      image_url: $('#itemImageUrl').value.trim(),
      product_url: $('#itemProductUrl').value.trim(),
      emoji: $('#itemEmoji').value.trim(),
      sort_order: Number($('#itemSortOrder').value) || 0,
      allow_pool: $('#itemAllowPool').checked,
      archived: $('#itemArchived').checked,
    };
    if (!data.name) {
      toast('Le nom est obligatoire', 'error');
      return;
    }
    try {
      if (state.editingId) {
        await api(`/api/admin/items/${state.editingId}`, { method: 'PUT', body: data });
        toast('✓ Cadeau mis à jour');
      } else {
        await api('/api/admin/items', { method: 'POST', body: data });
        toast('✓ Cadeau ajouté');
      }
      closeModal();
      await loadAll();
    } catch (err) {
      toast('Erreur : ' + err.message, 'error');
    }
  });

  // ---------- Reservations ----------
  async function loadReservations() {
    try {
      state.reservations = await api('/api/admin/reservations');
      $('#badgeReservations').textContent = state.reservations.length;
      renderReservations();
    } catch (err) { console.error('[reservations]', err); }
  }

  function renderReservations() {
    const el = $('#reservationsList');
    if (state.reservations.length === 0) {
      el.innerHTML = `<div class="empty-admin">Aucune réservation pour le moment.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="admin-table"><table>
        <thead><tr>
          <th>Cadeau</th><th>Invité</th><th>Prix</th><th>Message</th><th>Date</th><th></th>
        </tr></thead>
        <tbody>
          ${state.reservations.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.item_name || '(supprimé)')}</strong></td>
              <td>${r.is_anonymous ? '<em>Anonyme</em>' : escapeHtml(r.guest_name || '—')}</td>
              <td>${formatPrice(r.item_price)}</td>
              <td>${escapeHtml(r.message || '')}</td>
              <td>${formatDate(r.created_at)}</td>
              <td class="actions">
                <button class="btn-small danger" data-action="cancel-reservation" data-item="${r.item_id}">Annuler</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
  }

  $('#reservationsList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action="cancel-reservation"]');
    if (!btn) return;
    if (!confirm('Supprimer cette réservation ? Le cadeau redeviendra disponible.')) return;
    try {
      await api(`/api/admin/reservations/item/${btn.dataset.item}`, { method: 'DELETE' });
      toast('Réservation annulée');
      await loadAll();
    } catch (err) { toast('Erreur : ' + err.message, 'error'); }
  });

  // ---------- Contributions ----------
  async function loadContributions() {
    try {
      state.contributions = await api('/api/admin/contributions');
      $('#badgeContributions').textContent = state.contributions.length;
      renderContributions();
    } catch (err) { console.error('[contributions]', err); }
  }

  function renderContributions() {
    const el = $('#contributionsList');
    if (state.contributions.length === 0) {
      el.innerHTML = `<div class="empty-admin">Aucune contribution pour le moment.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="admin-table"><table>
        <thead><tr>
          <th>Cadeau</th><th>Contributeur</th><th>Montant</th><th>Message</th><th>Statut</th><th>Date</th><th></th>
        </tr></thead>
        <tbody>
          ${state.contributions.map(c => `
            <tr>
              <td><strong>${escapeHtml(c.item_name || '(supprimé)')}</strong></td>
              <td>${c.is_anonymous ? '<em>Anonyme</em>' : escapeHtml(c.guest_name || '—')}</td>
              <td><strong>${formatPrice(c.amount)}</strong></td>
              <td>${escapeHtml(c.message || '')}</td>
              <td>
                <span class="status-badge ${c.confirmed ? 'status-confirmed' : 'status-pending'}">
                  ${c.confirmed ? '✓ Confirmé' : '⏳ En attente'}
                </span>
              </td>
              <td>${formatDate(c.created_at)}</td>
              <td class="actions">
                <button class="btn-small" data-action="toggle-confirm" data-id="${c.id}" data-confirmed="${c.confirmed ? 1 : 0}">
                  ${c.confirmed ? 'Non reçu' : '✓ Marquer reçu'}
                </button>
                <button class="btn-small danger" data-action="delete-contribution" data-id="${c.id}">Suppr.</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
  }

  $('#contributionsList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'toggle-confirm') {
      const confirmed = btn.dataset.confirmed !== '1';
      try {
        await api(`/api/admin/contributions/${id}/confirm`, { method: 'PUT', body: { confirmed } });
        toast(confirmed ? 'Confirmée comme reçue' : 'Marquée comme non reçue');
        await loadAll();
      } catch (err) { toast('Erreur : ' + err.message, 'error'); }
    } else if (btn.dataset.action === 'delete-contribution') {
      if (!confirm('Supprimer cette contribution ?')) return;
      try {
        await api(`/api/admin/contributions/${id}`, { method: 'DELETE' });
        toast('Contribution supprimée');
        await loadAll();
      } catch (err) { toast('Erreur : ' + err.message, 'error'); }
    }
  });

  // ---------- Guestbook ----------
  async function loadGuestbook() {
    try {
      state.guestbook = await api('/api/admin/guestbook');
      $('#badgeGuestbook').textContent = state.guestbook.length;
      renderGuestbook();
    } catch (err) { console.error('[guestbook]', err); }
  }

  function renderGuestbook() {
    const el = $('#guestbookList');
    if (state.guestbook.length === 0) {
      el.innerHTML = `<div class="empty-admin">Aucun message dans le livre d'or.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="admin-table"><table>
        <thead><tr>
          <th>Auteur</th><th>Message</th><th>Visible</th><th>Date</th><th></th>
        </tr></thead>
        <tbody>
          ${state.guestbook.map(g => `
            <tr>
              <td><strong>${escapeHtml(g.author)}</strong></td>
              <td style="max-width: 400px; white-space: normal;">${escapeHtml(g.message)}</td>
              <td>
                <span class="status-badge ${g.approved ? 'status-confirmed' : 'status-pending'}">
                  ${g.approved ? '👁 Visible' : '🙈 Masqué'}
                </span>
              </td>
              <td>${formatDate(g.created_at)}</td>
              <td class="actions">
                <button class="btn-small" data-action="toggle-approve" data-id="${g.id}" data-approved="${g.approved ? 1 : 0}">
                  ${g.approved ? 'Masquer' : 'Publier'}
                </button>
                <button class="btn-small danger" data-action="delete-guestbook" data-id="${g.id}">Suppr.</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
  }

  $('#guestbookList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'toggle-approve') {
      const approved = btn.dataset.approved !== '1';
      try {
        await api(`/api/admin/guestbook/${id}/approve`, { method: 'PUT', body: { approved } });
        toast(approved ? 'Message publié' : 'Message masqué');
        await loadAll();
      } catch (err) { toast('Erreur : ' + err.message, 'error'); }
    } else if (btn.dataset.action === 'delete-guestbook') {
      if (!confirm('Supprimer ce message ?')) return;
      try {
        await api(`/api/admin/guestbook/${id}`, { method: 'DELETE' });
        toast('Message supprimé');
        await loadAll();
      } catch (err) { toast('Erreur : ' + err.message, 'error'); }
    }
  });

  // ---------- Guesses ----------
  async function loadGuesses() {
    try {
      state.guesses = await api('/api/admin/guesses');
      $('#badgeGuesses').textContent = state.guesses.length;
      renderGuesses();
    } catch (err) { console.error('[guesses]', err); }
  }

  function renderGuesses() {
    const el = $('#guessesList');
    if (state.guesses.length === 0) {
      el.innerHTML = `<div class="empty-admin">Aucune proposition de prénom.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="admin-table"><table>
        <thead><tr>
          <th>Auteur</th><th>Prénom proposé</th><th>Raison</th><th>Date</th><th></th>
        </tr></thead>
        <tbody>
          ${state.guesses.map(g => `
            <tr>
              <td><strong>${escapeHtml(g.author)}</strong></td>
              <td style="font-size: 1.05rem; color: var(--primary-dark);"><strong>${escapeHtml(g.guess)}</strong></td>
              <td style="max-width: 400px; white-space: normal;">${escapeHtml(g.reason || '')}</td>
              <td>${formatDate(g.created_at)}</td>
              <td class="actions">
                <button class="btn-small danger" data-action="delete-guess" data-id="${g.id}">Suppr.</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
  }

  $('#guessesList').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action="delete-guess"]');
    if (!btn) return;
    if (!confirm('Supprimer cette proposition ?')) return;
    try {
      await api(`/api/admin/guesses/${btn.dataset.id}`, { method: 'DELETE' });
      toast('Proposition supprimée');
      await loadAll();
    } catch (err) { toast('Erreur : ' + err.message, 'error'); }
  });

  // ---------- Escape handler ----------
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ---------- Boot ----------
  checkAuth();
})();
