package br.com.printfacil

import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * Ponte JavaScript <-> Kotlin.
 * Injetada como window.PrintFacilNative.
 *
 * Contrato esperado pelo front-end (js/native.js):
 *  - isNativeApp(): boolean
 *  - version(): string
 *  - hasOverlayPermission(): boolean
 *  - requestOverlayPermission(): void
 *  - startFloatingButton() / stopFloatingButton(): void
 *  - vibrate(ms): void
 *  - captureScreen(): void  -> chama window.__printFacilOnNativeCapture(json)
 *  - getState(): string (JSON)
 */
class WebAppBridge(
    private val activity: MainActivity,
    private val webView: WebView
) {

    @JavascriptInterface
    fun isNativeApp(): Boolean = true

    @JavascriptInterface
    fun version(): String = "1.0.0"

    @JavascriptInterface
    fun hasOverlayPermission(): Boolean = Prefs.hasOverlay(activity)

    @JavascriptInterface
    fun requestOverlayPermission() {
        activity.requestOverlayPermission()
    }

    @JavascriptInterface
    fun startFloatingButton() {
        activity.runOnUiThread { activity.startFloatingService() }
    }

    @JavascriptInterface
    fun stopFloatingButton() {
        activity.runOnUiThread { activity.stopFloatingService() }
    }

    @JavascriptInterface
    fun vibrate(ms: Int) {
        activity.vibrate(ms.toLong())
    }

    /**
     * Solicita uma captura real via MediaProjection.
     * O resultado chega por [deliverCapture].
     */
    @JavascriptInterface
    fun captureScreen() {
        ScreenCaptureBus.requestCapture(activity)
    }

    @JavascriptInterface
    fun getState(): String {
        val json = JSONObject()
            .put("native", true)
            .put("version", version())
            .put("overlay", hasOverlayPermission())
            .put("floating", Prefs.isFloatingEnabled(activity))
            .put("sdk", android.os.Build.VERSION.SDK_INT)
        return json.toString()
    }

    /** Atualiza o front-end quando uma permissão é concedida/revogada. */
    fun notifyState() {
        activity.runOnUiThread {
            webView.evaluateJavascript(
                "if (window.PrintFacilApp) { window.PrintFacilApp.refreshStatus(); }",
                null
            )
        }
    }

    companion object {
        private const val MAX_PAYLOAD = 40 * 1024 * 1024

        /** Entrega o PNG capturado para o JavaScript como base64. */
        fun deliverCapture(webView: WebView, png: ByteArray?, error: String?) {
            val payload: String = if (png == null) {
                JSONObject().put("ok", false).put("error", error ?: "Captura indisponível.").toString()
            } else {
                if (png.size > MAX_PAYLOAD) {
                    JSONObject().put("ok", false).put("error", "Imagem muito grande.").toString()
                } else {
                    JSONObject()
                        .put("ok", true)
                        .put("mime", "image/png")
                        .put("base64", Base64.encodeToString(png, Base64.NO_WRAP))
                        .toString()
                }
            }

            // JSON.stringify evita problemas de escape no evaluateJavascript
            webView.post {
                webView.evaluateJavascript(
                    "(function(){try{" +
                        "var cb=window.${Constants.JS_CAPTURE_CALLBACK};" +
                        "if(typeof cb==='function'){cb(JSON.parse(${JSONObject.quote(payload)}));}" +
                        "}catch(e){console.warn('bridge',e);} })();",
                    null
                )
            }
        }
    }
}
