package br.com.printfacil

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * Configuração única do WebView: origem https segura para a interface local,
 * permitindo localStorage, IndexedDB e Clipboard API.
 */
object WebViewSetup {

    /** Domínio virtual servido por WebViewAssetLoader (origem segura). */
    const val DOMAIN = "appassets.androidplatform.net"

    fun entryUrl(view: String? = null): String {
        val base = "https://$DOMAIN/assets/www/index.html"
        return if (view.isNullOrBlank()) base else "$base?view=$view"
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun configure(webView: WebView) {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.mediaPlaybackRequiresUserGesture = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setSupportZoom(false)
        settings.textZoom = 100
        settings.userAgentString = "${settings.userAgentString} PrintFacilApp/1.0"

        webView.isVerticalScrollBarEnabled = false
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER
        webView.setBackgroundColor(0xFF080A13.toInt())

        // A interface é local: não abrir links externos dentro do WebView
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: android.webkit.WebResourceRequest
            ): Boolean {
                val url = request.url
                return url.host != DOMAIN
            }
        }
    }

    fun dispose(webView: WebView) {
        webView.stopLoading()
        webView.loadUrl("about:blank")
        Handler(Looper.getMainLooper()).post { webView.destroy() }
    }
}

/** Intercepta apenas a origem local; nada é carregado da rede além das fontes. */
class LocalContentWebViewClient(
    private val assetLoader: WebViewAssetLoader
) : WebViewClient() {

    override fun shouldInterceptRequest(
        view: WebView,
        request: android.webkit.WebResourceRequest
    ): android.webkit.WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
}
