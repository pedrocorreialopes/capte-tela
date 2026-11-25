package br.com.printfacil

import android.Manifest
import android.animation.ObjectAnimator
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Tela principal: carrega a interface web (HTML/CSS/JS) dentro de um WebView
 * servido por uma origem https segura, e conecta a ponte nativa.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: WebAppBridge

    private val overlayPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            val granted = Settings.canDrawOverlays(this)
            bridge.notifyState()
            if (granted) {
                startFloatingService()
                toast(getString(R.string.overlay_granted))
            } else {
                toast(getString(R.string.overlay_denied))
            }
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startFloatingService()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        WebViewSetup.configure(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(WebViewSetup.DOMAIN)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = LocalContentWebViewClient(assetLoader)

        bridge = WebAppBridge(this, webView)
        webView.addJavascriptInterface(bridge, Constants.BRIDGE_NAME)

        // permite que a captura disparada pela bolha volte para esta interface
        WebViewHolder.webView = webView

        webView.loadUrl(WebViewSetup.entryUrl(extraView(intent)))

        // Reconecta o serviço se o botão global já estava ativo
        if (Settings.canDrawOverlays(this) && Prefs.isFloatingEnabled(this)) {
            startFloatingService(quiet = true)
        }
    }

    private fun extraView(intent: Intent?): String? = intent?.getStringExtra("view")

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val view = extraView(intent)
        if (view != null) {
            webView.evaluateJavascript(
                "window.PrintFacilApp && window.PrintFacilApp.go('$view');", null
            )
        }
    }

    /** Chamado pela ponte quando o usuário quer o botão sobre outros apps. */
    fun requestOverlayPermission() = runOnUiThread {
        if (Settings.canDrawOverlays(this)) {
            startFloatingService()
            return@runOnUiThread
        }
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        )
        overlayPermissionLauncher.launch(intent)
    }

    /** Inicia o serviço em primeiro plano que mantém a bolha flutuante. */
    fun startFloatingService(quiet: Boolean = false) {
        if (!Settings.canDrawOverlays(this)) {
            if (!quiet) requestOverlayPermission()
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }

        Prefs.setFloatingEnabled(this, true)
        val intent = Intent(this, FloatingButtonService::class.java).apply {
            action = Constants.ACTION_SHOW_BUTTON
        }
        ContextCompat.startForegroundService(this, intent)
        if (!quiet) toast(getString(R.string.floating_started))
    }

    fun stopFloatingService() {
        Prefs.setFloatingEnabled(this, false)
        val intent = Intent(this, FloatingButtonService::class.java).apply {
            action = Constants.ACTION_STOP
        }
        startService(intent)
        toast(getString(R.string.floating_stopped))
    }

    /**
     * Abre a tela de consentimento do MediaProjection.
     * O resultado volta para o serviço (se ativo) ou para esta activity.
     */
    fun requestProjectionPermission() {
        val intent = Intent(this, ProjectionPermissionActivity::class.java)
        startActivity(intent)
    }

    fun vibrate(ms: Long) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = getSystemService(VibratorManager::class.java)
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(android.os.Vibrator::class.java)
        }
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.vibrate(
                android.os.VibrationEffect.createOneShot(
                    ms.coerceIn(1, 400),
                    android.os.VibrationEffect.DEFAULT_AMPLITUDE
                )
            )
        }
        webView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
    }

    fun animateBubble() {
        ObjectAnimator.ofFloat(webView, "alpha", 1f, 0.92f, 1f).setDuration(160).start()
    }

    fun toast(message: String) = runOnUiThread {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    override fun onResume() {
        super.onResume()
        bridge.notifyState()
    }

    override fun onDestroy() {
        if (WebViewHolder.webView === webView) WebViewHolder.webView = null
        webView.removeJavascriptInterface(Constants.BRIDGE_NAME)
        WebViewSetup.dispose(webView)
        super.onDestroy()
    }

    companion object {
        fun intentFor(context: android.content.Context, view: String? = null): Intent =
            Intent(context, MainActivity::class.java).apply {
                view?.let { putExtra("view", it) }
            }
    }
}
