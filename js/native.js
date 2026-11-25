/* ==========================================================================
   native.js — ponte JavaScript <-> camada nativa Android
   A camada nativa (Kotlin) injeta um objeto `window.PrintFacilNative`.
   Se ele não existir, o app roda como PWA no navegador.
   ========================================================================== */

const PrintFacilBridge = (() => {
  const CALLBACK = '__printFacilOnNativeCapture';
  let pendingResolve = null;
  let pendingReject = null;
  let pendingTimer = null;

  function raw() {
    return typeof window.PrintFacilNative !== 'undefined' ? window.PrintFacilNative : null;
  }

  function available() {
    const bridge = raw();
    if (!bridge) return false;
    try {
      return typeof bridge.isNativeApp === 'function' ? bridge.isNativeApp() === true : true;
    } catch {
      return false;
    }
  }

  function call(method, ...args) {
    const bridge = raw();
    if (!bridge || typeof bridge[method] !== 'function') return undefined;
    try {
      return bridge[method](...args);
    } catch (err) {
      console.warn(`[ponte nativa] ${method} falhou:`, err);
      return undefined;
    }
  }

  function version() {
    const value = call('version');
    return typeof value === 'string' ? value : null;
  }

  function hasOverlayPermission() {
    return call('hasOverlayPermission') === true;
  }

  function requestOverlayPermission() {
    call('requestOverlayPermission');
  }

  function startGlobalButton() {
    call('startFloatingButton');
  }

  function stopGlobalButton() {
    call('stopFloatingButton');
  }

  function vibrate(ms = 18) {
    if (available()) {
      call('vibrate', ms);
      return true;
    }
    if (typeof navigator.vibrate === 'function') {
      try {
        return navigator.vibrate(ms);
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Pede uma captura nativa via MediaProjection.
   * Resolve com um Blob PNG. Rejeita em erro, negativa ou timeout.
   */
  function captureNative(timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const bridge = raw();
      if (!bridge || typeof bridge.captureScreen !== 'function') {
        reject(new Error('Captura nativa indisponível.'));
        return;
      }

      if (pendingReject) pendingReject(new Error('Nova solicitação de captura.'));
      pendingResolve = resolve;
      pendingReject = reject;

      window[CALLBACK] = (payload) => {
        cleanup();
        try {
          const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
          if (!data || data.ok !== true || !data.base64) {
            reject(new Error(data && data.error ? data.error : 'A captura nativa falhou.'));
            return;
          }
          const binary = atob(data.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          resolve(new Blob([bytes], { type: 'image/png' }));
        } catch (err) {
          reject(err);
        }
      };

      pendingTimer = setTimeout(() => {
        cleanup();
        reject(new Error('A captura nativa não respondeu a tempo.'));
      }, timeoutMs);

      try {
        bridge.captureScreen();
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    function cleanup() {
      clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingResolve = null;
      pendingReject = null;
      delete window[CALLBACK];
    }
  }

  return {
    available,
    version,
    hasOverlayPermission,
    requestOverlayPermission,
    startGlobalButton,
    stopGlobalButton,
    vibrate,
    captureNative
  };
})();

window.PrintFacilBridge = PrintFacilBridge;
