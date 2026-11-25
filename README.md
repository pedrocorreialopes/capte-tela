# Print Fácil — captura de tela

Aplicativo de captura de tela com **botão flutuante**: um toque = print na galeria.
Construído em **HTML5, CSS3 e JavaScript puro**, instalável como **PWA**, com uma
**camada nativa Android (Kotlin)** pronta para gerar o **APK** com botão sobre outros
aplicativos (`SYSTEM_ALERT_WINDOW` + `MediaProjection`).

> Especificação de origem: `docs/especificacao-print-facil.pdf`.

---

## 1. Como abrir

| Entrada | Caminho |
| --- | --- |
| App (PWA) | `index.html` |
| Views por URL | `index.html#inicio`, `index.html#galeria`, `index.html#ajustes` |
| Deep link alternativo | `index.html?view=galeria` (usado pelo WebView do APK) |
| Manifesto PWA | `manifest.webmanifest` |
| Service worker | `sw.js` |
| Camada Android | `docs/android/` |

---

## 2. O que está implementado

### Botão flutuante (requisito 2)
- Ícone de câmera, formato circular, gradiente com sombra suave e profundidade.
- Sempre visível enquanto o app estiver ativo, por cima da interface.
- **Arrastável** com o dedo/mouse para qualquer região da tela (Pointer Events + `pointercapture`).
- **Lembra a última posição** (`localStorage`, coordenadas normalizadas 0–1 → sobrevive a rotação e redimensionamento).
- Animação suave ao pressionar (escala + anel de pulso) e vibração opcional.
- Tamanho (44–88 px) e transparência (35–100%) configuráveis em Ajustes.
- Posição inicial escolhível (4 cantos) + botão “Redefinir posição”.
- Ligável/desligável sem recarregar a página.

### Captura real (requisito 3)
- Navegador: **Screen Capture API** (`navigator.mediaDevices.getDisplayMedia`), respeitando a autorização do usuário a cada sessão.
- Android nativo: **MediaProjection** via ponte JavaScript (`window.PrintFacilNative.captureScreen()`).
- Formato **PNG** (sem perda) ou **JPG** com qualidade 40–100%.
- Fluxo: prévia → **Salvar / Compartilhar / Baixar / Descartar**.
- **Nenhuma captura simulada**: se a plataforma negar a permissão, o app mostra o erro real e explica o motivo (HTTPS ausente, navegador sem suporte, cancelamento).
- Extra: **colar print** da área de transferência (botão “Colar print” ou `Ctrl+V`).

### Minhas Capturas (requisito 4)
- Miniaturas em grade, **agrupadas por data** (Hoje / Ontem / data completa).
- Data e horário + dimensões em cada item.
- Visualização em tela cheia com navegação (setas do teclado e botões ‹ ›).
- Compartilhar (`navigator.share` com arquivos; fallback: copiar para a área de transferência, depois download).
- Download com nome `print-facil_AAAA-MM-DD_HHMMSS.png|jpg`.
- Exclusão individual e **seleção múltipla** com exclusão/compartilhamento/download em lote.
- Faixa de “Últimas capturas” na tela inicial.

### Ajustes (requisito 5)
Botão flutuante on/off · tamanho · transparência · posição inicial · vibração ·
formato PNG/JPG · qualidade · **tema claro/escuro** · informação de uso de
armazenamento · instalar app · apagar tudo (com confirmação).

### Interface (requisito 6)
Design escuro por padrão (com tema claro completo), tipografia Plus Jakarta
Sans/Inter, logotipo, indicador de disponibilidade da captura no topo, botão
principal de captura, acesso à galeria e aos ajustes, tab bar inferior,
toasts, modais acessíveis (`aria-modal`, foco devolvido, `Esc` fecha) e
`prefers-reduced-motion` respeitado.

### Requisitos técnicos (requisito 7)
- JavaScript puro, sem framework; código modular em `js/`.
- Responsivo de 320 px ao desktop (grid fluido, `env(safe-area-inset-*)` para notch).
- PWA instalável: manifest com ícones `any` + `maskable`, `display: standalone`, atalhos.
- **Offline** para o app shell e para as capturas já salvas (service worker cache-first).
- Tratamento de erros e permissões em todos os caminhos de captura.
- **Nenhuma imagem é enviada para servidores**; sem backend, sem analytics.

---

## 3. Armazenamento (100% local)

| Dado | Onde | Chave / store |
| --- | --- | --- |
| Imagem completa (Blob) + miniatura (Blob) + metadados | **IndexedDB** | banco `printfacil`, store `shots` (índice `createdAt`) |
| Preferências (botão, tema, formato, qualidade…) | `localStorage` | `printfacil.settings.v1` |
| Estado nativo (bolha ativa, posição da bolha) | `SharedPreferences` (Android) | `printfacil_native` |

Registro salvo em `shots`:

```
{ id, createdAt, width, height, mime, bytes, thumbBytes, source, note, blob, thumb }
```

`blob` e `thumb` são **Blobs** — nunca Base64 no banco. Se o IndexedDB estiver
indisponível (modo privado), o app avisa em vez de falhar silenciosamente.

---

## 4. Camada nativa Android (requisito 8) — `docs/android`

Projeto Gradle completo em Kotlin. A interface web é empacotada em `assets/www`
automaticamente (tarefa `syncWebAssets` copia `index.html`, `css/`, `js/`,
`assets/`, `manifest.webmanifest`, `sw.js` da raiz do repositório).

| Arquivo | Papel |
| --- | --- |
| `MainActivity.kt` | WebView com origem segura, permissões de sobreposição/notificação |
| `WebViewSetup.kt` | `WebViewAssetLoader` em `https://appassets.androidplatform.net` (necessário para localStorage/IndexedDB/Clipboard) |
| `WebAppBridge.kt` | Ponte JS↔Kotlin (`window.PrintFacilNative`) |
| `FloatingButtonService.kt` | Serviço em primeiro plano + bolha `TYPE_APPLICATION_OVERLAY` arrastável |
| `ScreenCaptureBus.kt` | `MediaProjection` + `VirtualDisplay` + `ImageReader` → PNG |
| `ProjectionPermissionActivity.kt` | Diálogo de consentimento do sistema |
| `Prefs.kt` | Estado nativo persistido |

Permissões declaradas: `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_MEDIA_PROJECTION`, `POST_NOTIFICATIONS`, `VIBRATE`, `INTERNET`.

### Contrato da ponte (já consumido por `js/native.js`)

```js
window.PrintFacilNative.isNativeApp()               // true
window.PrintFacilNative.version()                   // "1.0.0"
window.PrintFacilNative.hasOverlayPermission()      // boolean
window.PrintFacilNative.requestOverlayPermission()  // abre Settings.ACTION_MANAGE_OVERLAY_PERMISSION
window.PrintFacilNative.startFloatingButton()       // inicia o serviço/bolha
window.PrintFacilNative.stopFloatingButton()
window.PrintFacilNative.vibrate(ms)
window.PrintFacilNative.captureScreen()             // chama window.__printFacilOnNativeCapture({ok,base64})
window.PrintFacilNative.getState()                  // JSON de estado
```

O app detecta a ponte no boot e troca o rótulo do topo para
“App Android · MediaProjection”; sem ponte, mostra “Captura disponível” (PWA).

### Como gerar o APK

```bash
cd docs/android
# opcional: gradle wrapper (o build usa Gradle 8.7 / AGP 8.5.2 / Kotlin 1.9.24 / minSdk 26)
gradle wrapper --gradle-version 8.7

./gradlew assembleDebug        # APK de teste  → app/build/outputs/apk/debug/
./gradlew assembleRelease      # assinado, requer keystore
```

Para release, crie `keystore.properties` + `signingConfigs` no
`app/build.gradle.kts`. Depois instale com
`adb install -r app/build/outputs/apk/debug/app-debug.apk`.

**Fora do escopo desta entrega:** a compilação do APK. Este ambiente não tem
Android SDK/Gradle; o código-fonte nativo está completo e pronto para ser
compilado no Android Studio (o `.apk` precisa ser gerado lá ou em CI).

---

## 5. Testes executados

- Console limpo em `index.html` (sem erros).
- Render verificado por screenshot em **mobile (390 px)** e **desktop (1280 px)**:
  Início, Galeria com 6 capturas semeadas, Ajustes, tema claro, prévia da captura
  e modo de seleção múltipla.
- Capturas de teste geradas por canvas/Blob reais gravadas no IndexedDB para
  validar miniaturas, agrupamento por data e contadores.

---

## 6. Privacidade

Nenhuma imagem, métrica ou identificador sai do dispositivo. O `sw.js` só
armazena o app shell; as capturas ficam no IndexedDB. A única requisição externa
é o CSS de fontes (Google Fonts) — as fontes caem para `system-ui` offline.

---

## 7. Próximos passos sugeridos

1. Compilar e assinar o APK no Android Studio (camada nativa já pronta).
2. Opcional: anotação na prévia (setas, retângulo, desfoque) antes de salvar.
3. Opcional: exportar/importar a galeria em `.zip` para backup manual.
4. Opcional: OCR local (`TextDetector`) para copiar texto de um print.
