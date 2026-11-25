/* ==========================================================================
   fab.js — botão flutuante: arrastar, lembrar posição, tamanho, opacidade
   Um toque = captura. Arrastar = reposicionar (guardado entre sessões).
   ========================================================================== */

const PrintFacilFab = (() => {
  const DRAG_THRESHOLD = 7;      // px antes de considerar arrasto
  const MARGIN = 6;              // respiro nas bordas da viewport

  let fab = null;
  let dragging = false;
  let moved = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let lastTapAt = 0;

  function init() {
    fab = document.getElementById('fab');
    if (!fab) return;

    const settings = PrintFacilSettings.get();
    applyAppearance(settings);
    placeFromSettings(settings);

    settings0(settings);
    PrintFacilSettings.subscribe((next) => {
      applyAppearance(next);
      if (!dragging) placeFromSettings(next);
    });

    fab.addEventListener('pointerdown', onPointerDown);
    fab.addEventListener('pointermove', onPointerMove);
    fab.addEventListener('pointerup', onPointerUp);
    fab.addEventListener('pointercancel', onPointerCancel);
    fab.addEventListener('contextmenu', (e) => e.preventDefault());
    fab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger();
      }
    });

    window.addEventListener('resize', () => {
      if (dragging) return;
      placeFromSettings(PrintFacilSettings.get());
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => placeFromSettings(PrintFacilSettings.get()), 220);
    });

    // mantém o botão dentro da área visível quando a barra de endereço muda
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (!dragging) placeFromSettings(PrintFacilSettings.get());
      });
    }
  }

  function settings0(settings) {
    // restaura o estado visível do botão (ligado/desligado)
    setVisible(settings.fabEnabled);
  }

  function applyAppearance(settings) {
    if (!fab) return;
    const size = Math.min(96, Math.max(44, Number(settings.fabSize) || 60));
    fab.style.width = `${size}px`;
    fab.style.height = `${size}px`;
    fab.style.opacity = String(Math.min(100, Math.max(30, Number(settings.fabOpacity) || 100)) / 100);
    fab.dataset.size = String(size);
    setVisible(settings.fabEnabled);
  }

  function setVisible(enabled) {
    if (!fab) return;
    fab.classList.toggle('is-hidden', !enabled);
    fab.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    fab.tabIndex = enabled ? 0 : -1;
  }

  function size() {
    const rect = fab ? fab.getBoundingClientRect() : { width: 60, height: 60 };
    return { w: rect.width || 60, h: rect.height || 60 };
  }

  /** Posiciona o botão a partir de { x, y } normalizados (0..1) ou do dock. */
  function placeFromSettings(settings) {
    if (!fab) return;
    const { w, h } = size();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let pos = settings.fabPos;

    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      const dock = settings.fabDock || 'bottom-right';
      const bottomY = vh - h - dockBottomOffset(h);
      const topY = 84;
      const leftX = 16;
      const rightX = vw - w - 16;
      if (dock === 'bottom-left') pos = { x: leftX / vw, y: bottomY / vh };
      else if (dock === 'top-right') pos = { x: rightX / vw, y: topY / vh };
      else if (dock === 'top-left') pos = { x: leftX / vw, y: topY / vh };
      else pos = { x: rightX / vw, y: bottomY / vh };
    }

    const x = clamp(pos.x * vw, MARGIN, Math.max(MARGIN, vw - w - MARGIN));
    const y = clamp(pos.y * vh, MARGIN, Math.max(MARGIN, vh - h - MARGIN));
    setTransform(x, y);
  }

  function dockBottomOffset(h) {
    // acima da tabbar: ~92px em telas pequenas, ~24px em desktop largo
    return window.innerWidth >= 720 ? 34 : Math.max(84, 26 + h * 0.9);
  }

  function setTransform(x, y) {
    fab.style.left = `${Math.round(x)}px`;
    fab.style.top = `${Math.round(y)}px`;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    if (fab.classList.contains('is-busy')) return;

    const rect = fab.getBoundingClientRect();
    dragging = true;
    moved = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    fab.classList.add('is-dragging');
    fab.setPointerCapture?.(pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;

    const { w, h } = size();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = clamp(e.clientX - offsetX, MARGIN, Math.max(MARGIN, vw - w - MARGIN));
    const y = clamp(e.clientY - offsetY, MARGIN, Math.max(MARGIN, vh - h - MARGIN));
    setTransform(x, y);
  }

  function onPointerUp(e) {
    if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
    endDrag();

    if (moved) {
      persistPosition();
      return;
    }
    // foi um toque: evita duplo disparo por duplo clique
    const now = Date.now();
    if (now - lastTapAt < 380) return;
    lastTapAt = now;
    trigger();
  }

  function onPointerCancel() {
    endDrag();
  }

  function endDrag() {
    dragging = false;
    pointerId = null;
    if (fab) {
      fab.classList.remove('is-dragging');
      try { fab.releasePointerCapture?.(undefined); } catch { /* ignore */ }
    }
  }

  function persistPosition() {
    const rect = fab.getBoundingClientRect();
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    PrintFacilSettings.set({
      fabPos: {
        x: clamp(rect.left / vw, 0, 1),
        y: clamp(rect.top / vh, 0, 1)
      }
    });
  }

  function flash() {
    if (!fab) return;
    fab.classList.remove('is-flash');
    // força reflow para reiniciar a animação
    void fab.offsetWidth;
    fab.classList.add('is-flash');
    setTimeout(() => fab.classList.remove('is-flash'), 700);
  }

  function setBusy(on) {
    if (!fab) return;
    fab.classList.toggle('is-busy', !!on);
    fab.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function trigger() {
    flash();
    const settings = PrintFacilSettings.get();
    if (settings.vibrate) PrintFacilBridge.vibrate(16);
    if (window.PrintFacilApp) window.PrintFacilApp.startCapture('fab');
  }

  function resetPosition() {
    PrintFacilSettings.resetPosition();
    placeFromSettings(PrintFacilSettings.get());
  }

  return { init, trigger, flash, setBusy, resetPosition, persistPosition };
})();

window.PrintFacilFab = PrintFacilFab;
