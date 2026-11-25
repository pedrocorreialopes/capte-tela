/* ==========================================================================
   gallery.js — Minhas Capturas
   Miniaturas, agrupamento por data, visualizador em tela cheia,
   compartilhamento, download, seleção múltipla e exclusão.
   ========================================================================== */

const PrintFacilGallery = (() => {
  const state = {
    shots: [],
    urls: new Map(),      // id -> objectURL da miniatura
    selecting: false,
    selected: new Set(),
    viewerId: null,
    viewerIndex: 0
  };

  const el = {};
  let onEmptyChange = () => {};

  function cache() {
    el.grid = document.getElementById('galleryGrid');
    el.empty = document.getElementById('galleryEmpty');
    el.count = document.getElementById('galleryCount');
    el.recentStrip = document.getElementById('recentStrip');
    el.recentEmpty = document.getElementById('recentEmpty');
    el.miniCount = document.getElementById('miniGalleryCount');
    el.selBar = document.getElementById('selBar');
    el.selCount = document.getElementById('selCount');
    el.headActions = document.getElementById('galleryHeadActions');
    el.selActions = document.getElementById('gallerySelActions');
    el.viewer = document.getElementById('viewerModal');
    el.viewerImg = document.getElementById('viewerImg');
    el.viewerMeta = document.getElementById('viewerMeta');
    el.viewerTitle = document.getElementById('viewerTitle');
    el.viewerPrev = document.getElementById('viewerPrev');
    el.viewerNext = document.getElementById('viewerNext');
  }

  /* ------------------------------ helpers ------------------------------ */

  function urlFor(shot) {
    if (!shot) return '';
    const key = shot.id;
    if (!state.urls.has(key)) {
      state.urls.set(key, URL.createObjectURL(shot.thumb || shot.blob));
    }
    return state.urls.get(key);
  }

  function releaseUrl(id) {
    const url = state.urls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      state.urls.delete(id);
    }
  }

  function releaseAllUrls() {
    state.urls.forEach((url) => URL.revokeObjectURL(url));
    state.urls.clear();
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function timeOf(ts) {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function dayKeyOf(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayLabelOf(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(d, today)) return 'Hoje';
    if (sameDay(d, yesterday)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function extOf(shot) {
    return (shot.mime || '').includes('jpeg') ? 'jpg' : 'png';
  }

  function fileNameOf(shot) {
    const d = new Date(shot.createdAt);
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    return `print-facil_${stamp}.${extOf(shot)}`;
  }

  /* ------------------------------ render ------------------------------ */

  async function refresh() {
    try {
      state.shots = await PrintFacilDB.all();
    } catch (err) {
      console.error('Falha ao ler as capturas:', err);
      state.shots = [];
      if (window.PrintFacilApp) window.PrintFacilApp.toast('Não foi possível ler o armazenamento local.', 'err');
    }
    renderAll();
    return state.shots;
  }

  function renderAll() {
    renderGallery();
    renderRecent();
    renderCounts();
    onEmptyChange(state.shots.length === 0);
  }

  function renderCounts() {
    const n = state.shots.length;
    const label = n === 1 ? '1 imagem' : `${n} imagens`;
    if (el.count) el.count.textContent = label;
    if (el.miniCount) el.miniCount.textContent = label;
    if (el.recentEmpty) el.recentEmpty.classList.toggle('is-hidden', n > 0);
  }

  function renderRecent() {
    if (!el.recentStrip) return;
    const recent = state.shots.slice(0, 10);
    el.recentStrip.textContent = '';
    recent.forEach((shot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-item';
      btn.setAttribute('aria-label', `Abrir captura de ${new Date(shot.createdAt).toLocaleString('pt-BR')}`);

      const img = document.createElement('img');
      img.className = 'recent-thumb';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = 'Miniatura de captura de tela';
      img.src = urlFor(shot);

      const time = document.createElement('time');
      time.dateTime = new Date(shot.createdAt).toISOString();
      time.textContent = timeOf(shot.createdAt);

      btn.append(img, time);
      btn.addEventListener('click', () => openViewer(shot.id));
      el.recentStrip.appendChild(btn);
    });
  }

  function renderGallery() {
    if (!el.grid) return;
    el.grid.textContent = '';

    const isEmpty = state.shots.length === 0;
    el.empty.classList.toggle('is-hidden', !isEmpty);
    el.grid.classList.toggle('is-hidden', isEmpty);

    if (isEmpty) return;

    // limpa seleções de itens que não existem mais
    const ids = new Set(state.shots.map((s) => s.id));
    [...state.selected].forEach((id) => { if (!ids.has(id)) state.selected.delete(id); });

    const groups = new Map();
    state.shots.forEach((shot) => {
      const key = dayKeyOf(shot.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(shot);
    });

    groups.forEach((items) => {
      const section = document.createElement('section');
      section.className = 'day-group';

      const label = document.createElement('h3');
      label.className = 'day-label';
      label.textContent = `${dayLabelOf(items[0].createdAt)} · ${items.length}`;
      section.appendChild(label);

      const grid = document.createElement('div');
      grid.className = 'day-grid';
      items.forEach((shot) => grid.appendChild(shotTile(shot)));
      section.appendChild(grid);
      el.grid.appendChild(section);
    });

    syncSelectionUi();
  }

  function shotTile(shot) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shot';
    btn.dataset.id = shot.id;
    btn.setAttribute('aria-pressed', state.selected.has(shot.id) ? 'true' : 'false');
    btn.setAttribute('aria-label', `Captura de ${new Date(shot.createdAt).toLocaleString('pt-BR')}, ${shot.width}×${shot.height}`);

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = 'Captura de tela';
    img.src = urlFor(shot);
    img.width = shot.width || 320;
    img.height = shot.height || 240;

    const check = document.createElement('span');
    check.className = 'shot-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';

    const meta = document.createElement('span');
    meta.className = 'shot-meta';
    const left = document.createElement('span');
    left.textContent = timeOf(shot.createdAt);
    const right = document.createElement('span');
    right.textContent = `${shot.width}×${shot.height}`;
    meta.append(left, right);

    btn.append(img, check, meta);
    if (state.selected.has(shot.id)) btn.classList.add('is-selected');

    btn.addEventListener('click', () => {
      if (state.selecting) toggleSelect(shot.id);
      else openViewer(shot.id);
    });
    return btn;
  }

  /* ------------------------------ seleção ------------------------------ */

  function setSelecting(enabled) {
    state.selecting = enabled;
    if (!enabled) state.selected.clear();
    document.body.classList.toggle('is-selecting', enabled);
    el.headActions.classList.toggle('is-hidden', enabled);
    el.selActions.classList.toggle('is-hidden', !enabled);
    el.selBar.classList.toggle('is-hidden', !enabled);
    if (el.grid) {
      el.grid.querySelectorAll('.shot').forEach((tile) => {
        const id = tile.dataset.id;
        const on = enabled && state.selected.has(id);
        tile.classList.toggle('is-selected', on);
        tile.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    syncSelectionUi();
  }

  function toggleSelect(id) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);

    const tile = el.grid && el.grid.querySelector(`.shot[data-id="${CSS.escape(id)}"]`);
    if (tile) {
      const on = state.selected.has(id);
      tile.classList.toggle('is-selected', on);
      tile.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    syncSelectionUi();
  }

  function selectAll() {
    state.shots.forEach((s) => state.selected.add(s.id));
    setSelecting(true);
  }

  function syncSelectionUi() {
    if (!el.selCount) return;
    const n = state.selected.size;
    el.selCount.textContent = n === 1 ? '1 selecionada' : `${n} selecionadas`;
    const disabled = n === 0;
    ['btnDeleteSel', 'btnShareSel', 'btnDownloadSel'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = disabled;
    });
  }

  async function deleteSelected() {
    const ids = [...state.selected];
    if (!ids.length) return;
    const ok = await window.PrintFacilApp.confirm(
      ids.length === 1 ? 'Excluir esta captura?' : `Excluir ${ids.length} capturas?`,
      'A ação não pode ser desfeita.'
    );
    if (!ok) return;
    await PrintFacilDB.removeMany(ids);
    ids.forEach(releaseUrl);
    setSelecting(false);
    await refresh();
    window.PrintFacilApp.toast(ids.length === 1 ? 'Captura excluída.' : `${ids.length} capturas excluídas.`, 'ok');
  }

  /* ------------------------------ ações ------------------------------ */

  async function saveRecord(record) {
    await PrintFacilDB.add(record);
    await refresh();
    return record;
  }

  function toBlobUrl(shot) {
    return URL.createObjectURL(shot.blob);
  }

  async function download(shot) {
    const url = toBlobUrl(shot);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameOf(shot);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function share(shot) {
    const ext = extOf(shot);
    const file = new File([shot.blob], fileNameOf(shot), { type: shot.mime || `image/${ext}` });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Print Fácil',
          text: `Captura de ${new Date(shot.createdAt).toLocaleString('pt-BR')}`
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    // fallback: copia a imagem para a área de transferência
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ [file.type]: shot.blob })]);
        window.PrintFacilApp.toast('Captura copiada para a área de transferência.', 'ok');
        return;
      } catch { /* segue para download */ }
    }
    await download(shot);
    window.PrintFacilApp.toast('Compartilhamento indisponível — imagem baixada.', 'warn');
  }

  async function downloadSelected() {
    const ids = [...state.selected];
    const shots = state.shots.filter((s) => ids.includes(s.id));
    for (let i = 0; i < shots.length; i += 1) {
      await download(shots[i]);
      await new Promise((r) => setTimeout(r, 320));
    }
    window.PrintFacilApp.toast(`${shots.length} download(s) iniciados.`, 'ok');
  }

  async function shareSelected() {
    const ids = [...state.selected];
    const shots = state.shots.filter((s) => ids.includes(s.id));
    if (shots.length === 1) {
      await share(shots[0]);
      return;
    }
    const files = shots.map((s) => new File([s.blob], fileNameOf(s), { type: s.mime || 'image/png' }));
    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: 'Print Fácil', text: `${files.length} capturas` });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    window.PrintFacilApp.toast('Este navegador não compartilha várias imagens. Use Baixar.', 'warn');
  }

  async function deleteOne(id) {
    const ok = await window.PrintFacilApp.confirm('Excluir esta captura?', 'A ação não pode ser desfeita.');
    if (!ok) return false;
    await PrintFacilDB.remove(id);
    releaseUrl(id);
    await refresh();
    window.PrintFacilApp.toast('Captura excluída.', 'ok');
    return true;
  }

  /* ------------------------------ visualizador ------------------------------ */

  function openViewer(id) {
    const index = state.shots.findIndex((s) => s.id === id);
    if (index < 0) return;
    state.viewerId = id;
    showViewerIndex(index);
    window.PrintFacilApp.openModal(el.viewer);
  }

  function showViewerIndex(index) {
    const shot = state.shots[index];
    if (!shot) return;
    state.viewerId = shot.id;
    const url = toBlobUrl(shot);
    el.viewerImg.src = url;
    el.viewerImg.onload = () => setTimeout(() => URL.revokeObjectURL(url), 1500);
    el.viewerImg.alt = `Captura de tela de ${new Date(shot.createdAt).toLocaleString('pt-BR')}`;
    el.viewerTitle.textContent = `Captura de ${new Date(shot.createdAt).toLocaleDateString('pt-BR')}`;
    el.viewerMeta.textContent = `${timeOf(shot.createdAt)} · ${shot.width}×${shot.height} · ${formatBytes(shot.bytes)}`;
    el.viewerPrev.disabled = index >= state.shots.length - 1;
    el.viewerNext.disabled = index <= 0;
    state.viewerIndex = index;
  }

  function stepViewer(delta) {
    const next = (state.viewerIndex || 0) + delta;
    if (next < 0 || next >= state.shots.length) return;
    showViewerIndex(next);
  }

  function currentViewerShot() {
    return state.shots.find((s) => s.id === state.viewerId) || null;
  }

  /* ------------------------------ init ------------------------------ */

  function init(hooks = {}) {
    cache();
    onEmptyChange = hooks.onEmptyChange || (() => {});

    document.getElementById('btnSelectMode')?.addEventListener('click', () => setSelecting(true));
    document.getElementById('btnCancelSel')?.addEventListener('click', () => setSelecting(false));
    document.getElementById('btnSelectAll')?.addEventListener('click', selectAll);
    document.getElementById('btnDeleteSel')?.addEventListener('click', deleteSelected);
    document.getElementById('btnDownloadSel')?.addEventListener('click', downloadSelected);
    document.getElementById('btnShareSel')?.addEventListener('click', shareSelected);

    el.viewerPrev?.addEventListener('click', () => stepViewer(1));
    el.viewerNext?.addEventListener('click', () => stepViewer(-1));

    document.getElementById('viewerDownload')?.addEventListener('click', () => {
      const shot = currentViewerShot();
      if (shot) download(shot);
    });
    document.getElementById('viewerShare')?.addEventListener('click', () => {
      const shot = currentViewerShot();
      if (shot) share(shot);
    });
    document.getElementById('viewerDelete')?.addEventListener('click', async () => {
      const shot = currentViewerShot();
      if (!shot) return;
      const removed = await deleteOne(shot.id);
      if (removed) window.PrintFacilApp.closeModal(el.viewer);
    });

    document.addEventListener('keydown', (e) => {
      if (el.viewer.hidden) return;
      if (e.key === 'ArrowLeft') stepViewer(1);
      if (e.key === 'ArrowRight') stepViewer(-1);
    });

    // colar com Ctrl+V em qualquer lugar
    document.addEventListener('paste', async (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          try {
            const record = await PrintFacilCapture.buildRecord(file, { source: 'clipboard', note: 'colado' });
            await saveRecord(record);
            window.PrintFacilApp.toast('Print colado e salvo em Minhas Capturas.', 'ok');
            window.PrintFacilApp.closeModal(document.getElementById('previewModal'));
          } catch (err) {
            window.PrintFacilApp.toast('Não foi possível salvar o print colado.', 'err');
            console.warn(err);
          }
          return;
        }
      }
    });

    return refresh();
  }

  return {
    init,
    refresh,
    saveRecord,
    download,
    share,
    openViewer,
    formatBytes,
    fileNameOf,
    state
  };
})();

window.PrintFacilGallery = PrintFacilGallery;
