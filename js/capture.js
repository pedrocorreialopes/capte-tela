/* ==========================================================================
   capture.js — captura de tela REAL
   • Navegador: Screen Capture API (navigator.mediaDevices.getDisplayMedia)
   • Android nativo: MediaProjection via ponte (js/native.js)
   • Extra: colar um print já copiado (Clipboard API)
   Jamais simula uma captura falsa: se a plataforma não permitir, informa o erro.
   ========================================================================== */

const PrintFacilCapture = (() => {
  let activeStream = null;
  let isBusy = false;

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function supported() {
    return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
  }

  function clipSupported() {
    return !!(navigator.clipboard && typeof navigator.clipboard.read === 'function' && window.isSecureContext);
  }

  function hasNative() {
    return PrintFacilBridge.available();
  }

  function stopStream() {
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      activeStream = null;
    }
  }

  /** Espera o vídeo ter um frame decodificado. */
  function waitForFrame(video) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      if (video.readyState >= 2 && video.videoWidth > 0) {
        requestAnimationFrame(() => requestAnimationFrame(finish));
        return;
      }
      video.onloadedmetadata = () => requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 2500);
    });
  }

  async function encodeCanvas(canvas, format, quality) {
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const qualityArg = format === 'jpeg' ? Math.min(1, Math.max(0.4, quality / 100)) : undefined;

    if (canvas.toBlob) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, qualityArg));
      if (blob) return { blob, mime: blob.type || mime };
    }
    throw new Error('Não foi possível gerar a imagem.');
  }

  function makeThumb(source, maxWidth = 480) {
    const scale = Math.min(1, maxWidth / Math.max(source.width, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `shot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Monta o registro que vai para o IndexedDB a partir de um Blob de imagem.
   * Blobs ficam no IndexedDB (nunca Base64 no banco).
   */
  async function buildRecord(blob, options = {}) {
    const settings = PrintFacilSettings.get();
    const bitmap = await createImageBitmap(blob);

    let outputBlob = blob;
    let mime = blob.type || 'image/png';
    let bytes = blob.size;
    let width = bitmap.width;
    let height = bitmap.height;

    const wantJpeg = settings.format === 'jpeg';
    const reencode = options.forceFormat ? true : wantJpeg;

    if (reencode && bitmap.width && bitmap.height) {
      const full = document.createElement('canvas');
      full.width = bitmap.width;
      full.height = bitmap.height;
      const ctx = full.getContext('2d');
      if (wantJpeg) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, full.width, full.height);
      }
      ctx.drawImage(bitmap, 0, 0);
      const encoded = await encodeCanvas(full, settings.format, settings.quality);
      outputBlob = encoded.blob;
      mime = encoded.mime;
      bytes = outputBlob.size;
      width = full.width;
      height = full.height;
    }

    const thumbCanvas = makeThumb(bitmap);
    const thumbBlob = await new Promise((resolve) => thumbCanvas.toBlob(resolve, 'image/jpeg', 0.72));

    if (bitmap.close) bitmap.close();

    return {
      id: uid(),
      createdAt: Date.now(),
      width,
      height,
      mime,
      bytes,
      thumbBytes: thumbBlob ? thumbBlob.size : 0,
      source: options.source || 'display',
      note: options.note || '',
      blob: outputBlob,
      thumb: thumbBlob || outputBlob
    };
  }

  /** Captura via navegador: pede autorização e retorna um Blob da imagem. */
  async function captureBrowser(onStatus) {
    if (!supported()) {
      throw new Error('Este navegador não oferece a API de captura de tela (getDisplayMedia).');
    }
    if (!window.isSecureContext) {
      throw new Error('A captura exige HTTPS ou localhost. Abra o app em uma conexão segura.');
    }

    onStatus && onStatus({ title: 'Aguardando autorização…', msg: 'Escolha a tela, janela ou aba e confirme no aviso do sistema.' });

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include'
      });
    } catch (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        const cancel = new Error('Captura cancelada: você não autorizou o compartilhamento da tela.');
        cancel.code = 'cancelled';
        throw cancel;
      }
      if (err && err.name === 'NotFoundError') {
        throw new Error('Nenhuma tela disponível para capturar.');
      }
      throw new Error('Não foi possível iniciar a captura: ' + (err && err.message ? err.message : err));
    }

    activeStream = stream;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        // usuário parou o compartilhamento pelo aviso do sistema
        stopStream();
      });
    }

    try {
      await video.play();
    } catch {
      /* alguns navegadores exigem interação; o frame ainda pode estar disponível */
    }

    await waitForFrame(video);
    onStatus && onStatus({ title: 'Capturando…', msg: 'Registrando o quadro da tela autorizada.' });

    const settings = track && track.getSettings ? track.getSettings() : {};
    const width = video.videoWidth || settings.width || window.screen.width;
    const height = video.videoHeight || settings.height || window.screen.height;

    if (!width || !height) {
      stopStream();
      throw new Error('Não foi possível ler o quadro da tela autorizada.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const { blob } = await encodeCanvas(canvas, 'png', 100);

    stopStream();
    video.srcObject = null;

    return blob;
  }

  /** Captura nativa via MediaProjection (app Android). */
  async function captureNativePath(onStatus) {
    onStatus && onStatus({ title: 'Autorize a captura', msg: 'O Android pedirá permissão para capturar a tela do sistema.' });
    return PrintFacilBridge.captureNative();
  }

  /** Lê uma imagem da área de transferência (print copiado pelo sistema). */
  async function captureClipboard() {
    if (!clipSupported()) {
      throw new Error('A leitura da área de transferência não é suportada aqui. Use Ctrl+V ou o botão de captura.');
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        return blob;
      }
    }
    throw new Error('Nenhuma imagem na área de transferência. Copie um print primeiro.');
  }

  /**
   * Executa uma captura completa.
   * @returns {Promise<Blob>}
   */
  async function grab(onStatus) {
    if (isBusy) throw new Error('Já existe uma captura em andamento.');
    isBusy = true;
    try {
      if (hasNative()) return await captureNativePath(onStatus);
      return await captureBrowser(onStatus);
    } finally {
      isBusy = false;
    }
  }

  function busy() {
    return isBusy;
  }

  return {
    supported,
    clipSupported,
    hasNative,
    grab,
    captureClipboard,
    buildRecord,
    makeThumb,
    encodeCanvas,
    stopStream,
    busy,
    delay
  };
})();

window.PrintFacilCapture = PrintFacilCapture;
