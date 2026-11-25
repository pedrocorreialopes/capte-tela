/* ==========================================================================
   settings.js — preferências do usuário (localStorage) com padrões seguros
   ========================================================================== */

const PrintFacilSettings = (() => {
  const KEY = 'printfacil.settings.v1';

  const DEFAULTS = {
    fabEnabled: true,
    fabSize: 60,
    fabOpacity: 100,
    fabDock: 'bottom-right',   // posição inicial usada ao redefinir
    fabPos: null,              // { x: 0..1, y: 0..1 } relativo à viewport
    vibrate: true,
    format: 'png',
    quality: 90,
    theme: 'dark'
  };

  let state = { ...DEFAULTS };
  const listeners = new Set();

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Não foi possível salvar as preferências:', err);
    }
  }

  function get() {
    return { ...state };
  }

  function set(patch, options = {}) {
    state = { ...state, ...patch };
    save();
    applyTheme();
    if (!options.silent) listeners.forEach((fn) => fn(get()));
    return get();
  }

  function resetPosition() {
    set({ fabPos: null });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function applyTheme() {
    const theme = state.theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f5fb' : '#080a13');
  }

  function init() {
    state = read();
    applyTheme();
    return get();
  }

  return { init, get, set, subscribe, resetPosition, applyTheme, DEFAULTS };
})();

window.PrintFacilSettings = PrintFacilSettings;
