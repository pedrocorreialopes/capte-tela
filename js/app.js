/* ==========================================================================
   app.js — orquestração: navegação, ajustes, captura, prévia, toasts, modais
   ========================================================================== */

const PrintFacilApp = (() => {
  const el = {};
  let currentView = 'inicio';
  let pendingRecord = null;      // captura aguardando decisão na prévia
  let pendingBlob = null;
  let confirmResolver = null;
  let installPrompt = null;
  let lastFocused = null;

  /* ------------------------------ utilidades ------------------------------ */

  function toast(message, kind = '', timeout = 3400) {
    const wrap = el.toastWrap;
    if (!wrap) return;
    const node = document.createElement('div');
    node.className = `toast ${kind}`.trim();
    node.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    node.textContent = message;
    wrap.appendChild(node);
    setTimeout(() => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 260);
    }, timeout);
  }

  function openModal(node) {
    if (!node) return;
    lastFocused = document.activeElement;
    node.hidden = false;
    document.body.style.overflow = 'hidden';
    const focusable = node.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
    setTimeout(() => focusable && focusable.focus({ preventScroll: true }), 60);
  }

  function closeModal(node) {
    if (!node) return;
    node.hidden = true;
    if (!document.querySelector('.modal:not([hidden]), .capture-overlay:not([hidden])')) {
      document.body.style.overflow = '';
    }
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus({ preventScroll: true });
      lastFocused = null;
    }
  }

  function confirm(title, message) {
    return new Promise((resolve) => {
      el.confirmTitle.textContent = title;
      el.confirmMsg.textContent = message;
      openModal(el.confirmModal);
      confirmResolver = resolve;
    });
  }

  /* ------------------------------ navegação ------------------------------ */

  function go(view) {
    const target = ['inicio', 'galeria', 'ajustes'].includes(view) ? view : 'inicio';
    currentView = target;

    document.querySelectorAll('.view').forEach((node) => {
      node.classList.toggle('is-active', node.dataset.view === target);
    });
    document.querySelectorAll('.tab').forEach((tab) => {
      const on = tab.dataset.goto === target;
      tab.classList.toggle('is-active', on);
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (location.hash !== `#${target}`) {
      history.replaceState(null, '', `#${target}`);
    }
    if (target === 'ajustes') updateStorageInfo();
    if (target === 'galeria') PrintFacilGallery.refresh();
  }

  /* ------------------------------ status ------------------------------ */

  function setStatus(state, text) {
    if (!el.statusChip) return;
    el.statusChip.dataset.state = state;
    el.statusText.textContent = text;
  }

  function refreshStatus() {
    if (PrintFacilBridge.available()) {
      setStatus('ok', 'App Android · MediaProjection');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('warn', 'Requer HTTPS');
      return;
    }
    if (PrintFacilCapture.supported()) {
      setStatus('ok', 'Captura disponível');
      return;
    }
    setStatus('off', 'Captura indisponível');
  }

  function refreshNativeCard() {
    const node = document.getElementById('nativeState');
    if (!node) return;
    if (PrintFacilBridge.available()) {
      const v = PrintFacilBridge.version();
      const overlay = PrintFacilBridge.hasOverlayPermission() ? 'sobreposição autorizada' : 'sobreposição a autorizar';
      node.textContent = `Ponte nativa ativa${v ? ` (v${v})` : ''} · ${overlay}`;
      node.style.color = 'var(--ok)';
    } else {
      node.textContent = 'Ponte nativa: não detectada (executando como PWA no navegador).';
      node.style.color = '';
    }
  }

  /* ------------------------------ captura ------------------------------ */

  function setCaptureOverlay(visible, title, msg) {
    const overlay = el.captureOverlay;
    if (!overlay) return;
    overlay.hidden = !visible;
    if (visible) {
      if (title) el.captureTitle.textContent = title;
      if (msg) el.captureMsg.textContent = msg;
    }
    document.body.style.overflow = visible ? 'hidden' : '';
  }

  async function startCapture(origin = 'button') {
    if (PrintFacilCapture.busy()) {
      toast('Já existe uma captura em andamento.', 'warn');
      return;
    }
    if (!PrintFacilCapture.hasNative() && !PrintFacilCapture.supported()) {
      toast('Este navegador não permite captura de tela. Use o app Android ou cole um print.', 'err', 5200);
      return;
    }

    PrintFacilFab.setBusy(true);
    setCaptureOverlay(true, 'Preparando captura…', 'Autorize o compartilhamento da tela na janela do sistema.');

    try {
      const blob = await PrintFacilCapture.grab(({ title, msg }) => {
        setCaptureOverlay(true, title, msg);
      });

      setCaptureOverlay(true, 'Processando imagem…', 'Gerando a prévia da captura.');
      const record = await PrintFacilCapture.buildRecord(blob, { source: origin });
      showPreview(record);
    } catch (err) {
      console.warn('[captura]', err);
      setCaptureOverlay(false);
      if (err && err.code === 'cancelled') {
        toast('Captura cancelada — nenhum print foi criado.', 'warn');
      } else {
        toast(err && err.message ? err.message : 'Não foi possível capturar a tela.', 'err', 5200);
      }
    } finally {
      PrintFacilFab.setBusy(false);
      // a prévia aberta assume a tela; caso contrário o overlay sempre sai
      if (el.previewModal.hidden) setCaptureOverlay(false);
    }
  }

  function showPreview(record) {
    pendingRecord = record;
    pendingBlob = record.blob;
    const url = URL.createObjectURL(record.blob);
    el.previewImg.src = url;
    el.previewImg.onload = () => setTimeout(() => URL.revokeObjectURL(url), 2000);
    el.previewMeta.textContent = `${record.width}×${record.height} · ${PrintFacilGallery.formatBytes(record.bytes)} · ${new Date(record.createdAt).toLocaleString('pt-BR')}`;
    setCaptureOverlay(false);
    openModal(el.previewModal);
    if (PrintFacilSettings.get().vibrate) PrintFacilBridge.vibrate(12);
  }

  function clearPending() {
    pendingRecord = null;
    pendingBlob = null;
    el.previewImg.removeAttribute('src');
  }

  async function savePending() {
    if (!pendingRecord) return;
    try {
      await PrintFacilGallery.saveRecord(pendingRecord);
      const saved = pendingRecord;
      clearPending();
      closeModal(el.previewModal);
      toast('Print salvo em Minhas Capturas.', 'ok');
      if (PrintFacilSettings.get().vibrate) PrintFacilBridge.vibrate(20);
      void saved;
    } catch (err) {
      console.error(err);
      toast('Falha ao salvar no armazenamento local.', 'err');
    }
  }

  async function sharePending() {
    if (!pendingBlob) return;
    const fake = {
      blob: pendingBlob,
      mime: pendingBlob.type,
      createdAt: Date.now()
    };
    await PrintFacilGallery.share(fake);
  }

  async function downloadPending() {
    if (!pendingBlob) return;
    const fake = { blob: pendingBlob, mime: pendingBlob.type, createdAt: Date.now() };
    await PrintFacilGallery.download(fake);
  }

  async function pasteFromClipboard() {
    try {
      const blob = await PrintFacilCapture.captureClipboard();
      const record = await PrintFacilCapture.buildRecord(blob, { source: 'clipboard' });
      showPreview(record);
    } catch (err) {
      toast(err && err.message ? err.message : 'Não foi possível colar.', 'err', 4600);
    }
  }

  /* ------------------------------ ajustes ------------------------------ */

  function bindSettings() {
    const s = PrintFacilSettings.get();

    const fabEnabled = document.getElementById('setFabEnabled');
    const fabSize = document.getElementById('setFabSize');
    const fabOpacity = document.getElementById('setFabOpacity');
    const vibrate = document.getElementById('setVibrate');
    const quality = document.getElementById('setQuality');
    const qualityRow = document.getElementById('qualityRow');

    fabEnabled.checked = !!s.fabEnabled;
    fabSize.value = s.fabSize;
    fabOpacity.value = s.fabOpacity;
    vibrate.checked = !!s.vibrate;
    quality.value = s.quality;
    document.getElementById('valSize').textContent = s.fabSize;
    document.getElementById('valOpacity').textContent = s.fabOpacity;
    document.getElementById('valQuality').textContent = s.quality;
    qualityRow.hidden = s.format !== 'jpeg';

    fabEnabled.addEventListener('change', () => {
      PrintFacilSettings.set({ fabEnabled: fabEnabled.checked });
      toast(fabEnabled.checked ? 'Botão flutuante ativado.' : 'Botão flutuante oculto.', '', 2200);
    });

    fabSize.addEventListener('input', () => {
      document.getElementById('valSize').textContent = fabSize.value;
      PrintFacilSettings.set({ fabSize: Number(fabSize.value) });
    });

    fabOpacity.addEventListener('input', () => {
      document.getElementById('valOpacity').textContent = fabOpacity.value;
      PrintFacilSettings.set({ fabOpacity: Number(fabOpacity.value) });
    });

    vibrate.addEventListener('change', () => {
      PrintFacilSettings.set({ vibrate: vibrate.checked });
      if (vibrate.checked) PrintFacilBridge.vibrate(18);
    });

    quality.addEventListener('input', () => {
      document.getElementById('valQuality').textContent = quality.value;
      PrintFacilSettings.set({ quality: Number(quality.value) });
    });

    bindSegmented('setFormat', 'format', (value) => {
      qualityRow.hidden = value !== 'jpeg';
    }, (value) => value);

    bindSegmented('setTheme', 'theme', null, null, 'themeOpt');

    bindSegmented('setDotPos', 'fabDock', () => {
      PrintFacilFab.resetPosition();
    }, null, 'pos');

    document.getElementById('btnResetFab').addEventListener('click', () => {
      PrintFacilFab.resetPosition();
      toast('Botão reposicionado.', 'ok', 2200);
    });

    document.getElementById('btnClearAll').addEventListener('click', async () => {
      const total = await PrintFacilDB.count();
      if (!total) {
        toast('Não há capturas para apagar.', 'warn');
        return;
      }
      const ok = await confirm('Apagar todas as capturas?', `Isso remove ${total} imagem(ns) deste aparelho de forma permanente.`);
      if (!ok) return;
      await PrintFacilDB.clear();
      await PrintFacilGallery.refresh();
      toast('Todas as capturas foram apagadas.', 'ok');
    });

    const installBtn = document.getElementById('btnInstall');
    installBtn.addEventListener('click', async () => {
      if (installPrompt) {
        installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') toast('Instalando Print Fácil…', 'ok');
        installPrompt = null;
        installBtn.textContent = 'Instalar app';
        return;
      }
      if (PrintFacilBridge.available()) {
        toast('Você já está no app Android. Use o botão flutuante global nas Configurações do sistema.', '', 4200);
        return;
      }
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if (standalone) {
        toast('O app já está instalado neste dispositivo.', 'ok');
        return;
      }
      toast('No Chrome/Edge use o menu ⋮ → "Instalar app". No Android, instale o APK em docs/android.', '', 5600);
    });
  }

  function bindSegmented(containerId, key, after, transform, datasetKey = 'format') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const attr = datasetKey === 'themeOpt' ? 'themeOpt' : datasetKey;
    const current = PrintFacilSettings.get();

    // marca o ativo conforme o estado atual
    container.querySelectorAll('button').forEach((btn) => {
      const value = btn.dataset[attr];
      const active = key === 'fabDock' ? current.fabDock === value : current[key] === value;
      btn.classList.toggle('is-on', !!active);
      btn.addEventListener('click', () => {
        container.querySelectorAll('button').forEach((b) => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        const finalValue = transform ? transform(value) : value;
        PrintFacilSettings.set({ [key]: finalValue });
        if (after) after(finalValue);
      });
    });
  }

  async function updateStorageInfo() {
    const node = document.getElementById('storageInfo');
    if (!node) return;
    try {
      const count = await PrintFacilDB.count();
      const bytes = await PrintFacilDB.totalBytes();
      let quota = '';
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est && est.quota) quota = ` de ${PrintFacilGallery.formatBytes(est.quota)}`;
      }
      node.textContent = `${count} captura(s) · ${PrintFacilGallery.formatBytes(bytes)}${quota}`;
    } catch {
      node.textContent = 'Indisponível neste navegador';
    }
  }

  /* ------------------------------ inicialização ------------------------------ */

  function bindGlobals() {
    document.querySelectorAll('[data-goto]').forEach((node) => {
      node.addEventListener('click', () => go(node.dataset.goto));
    });

    document.querySelectorAll('[data-close]').forEach((node) => {
      node.addEventListener('click', () => {
        const modal = node.closest('.modal');
        if (!modal) return;
        if (modal === el.previewModal) clearPending();
        closeModal(modal);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = [...document.querySelectorAll('.modal:not([hidden])')].pop();
      if (open) {
        if (open === el.previewModal) clearPending();
        if (open === el.confirmModal && confirmResolver) {
          confirmResolver(false);
          confirmResolver = null;
        }
        closeModal(open);
      }
    });

    el.captureCancel.addEventListener('click', () => {
      PrintFacilCapture.stopStream();
      setCaptureOverlay(false);
      PrintFacilFab.setBusy(false);
      toast('Captura cancelada.', 'warn', 2400);
    });

    document.getElementById('btnCapture').addEventListener('click', () => startCapture('button'));
    document.getElementById('btnPaste').addEventListener('click', pasteFromClipboard);

    document.getElementById('btnSavePreview').addEventListener('click', savePending);
    document.getElementById('btnSharePreview').addEventListener('click', sharePending);
    document.getElementById('btnDownloadPreview').addEventListener('click', downloadPending);
    document.getElementById('btnDiscardPreview').addEventListener('click', () => {
      clearPending();
      closeModal(el.previewModal);
      toast('Captura descartada.', '', 2200);
    });

    el.confirmYes.addEventListener('click', () => {
      if (confirmResolver) confirmResolver(true);
      confirmResolver = null;
      closeModal(el.confirmModal);
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPrompt = e;
      const btn = document.getElementById('btnInstall');
      if (btn) btn.textContent = 'Instalar app';
    });

    window.addEventListener('offline', () => toast('Você está offline — as capturas salvas seguem disponíveis.', 'warn'));
  }

  function cacheDom() {
    el.statusChip = document.getElementById('statusChip');
    el.statusText = document.getElementById('statusText');
    el.captureOverlay = document.getElementById('captureOverlay');
    el.captureTitle = document.getElementById('captureTitle');
    el.captureMsg = document.getElementById('captureMsg');
    el.captureCancel = document.getElementById('btnCaptureCancel');
    el.previewModal = document.getElementById('previewModal');
    el.previewImg = document.getElementById('previewImg');
    el.previewMeta = document.getElementById('previewMeta');
    el.confirmModal = document.getElementById('confirmModal');
    el.confirmTitle = document.getElementById('confirmTitle');
    el.confirmMsg = document.getElementById('confirmMsg');
    el.confirmYes = document.getElementById('confirmYes');
    el.toastWrap = document.getElementById('toastWrap');
  }

  function init() {
    cacheDom();
    PrintFacilSettings.init();
    bindGlobals();
    bindSettings();
    PrintFacilFab.init();

    PrintFacilGallery.init();

    refreshStatus();
    refreshNativeCard();
    updateStorageInfo();

    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('view');
    const initial = (fromQuery || (location.hash || '').replace('#', '')).toLowerCase();
    go(['inicio', 'galeria', 'ajustes'].includes(initial) ? initial : 'inicio');

    window.addEventListener('hashchange', () => {
      const view = (location.hash || '').replace('#', '');
      if (['inicio', 'galeria', 'ajustes'].includes(view) && view !== currentView) go(view);
    });

    // a ponte nativa pode ser injetada após o load
    setTimeout(() => { refreshStatus(); refreshNativeCard(); }, 1200);

    if ('serviceWorker' in navigator && window.isSecureContext) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
          console.warn('Service worker não registrado:', err);
        });
      });
    }

    document.documentElement.dataset.booted = 'true';
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    go,
    toast,
    openModal,
    closeModal,
    confirm,
    startCapture,
    showPreview,
    updateStorageInfo,
    refreshStatus
  };
})();

window.PrintFacilApp = PrintFacilApp;
