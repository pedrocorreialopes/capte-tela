package br.com.printfacil

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.ByteArrayOutputStream

/**
 * Executa uma captura de tela real usando MediaProjection.
 *
 * Fluxo obrigatório do Android:
 *  1. A activity de consentimento obtém um Intent de permissão.
 *  2. Este objeto cria o MediaProjection com esse Intent.
 *  3. Uma VirtualDisplay + ImageReader recebem o quadro da tela.
 *  4. O bitmap é comprimido em PNG e entregue ao WebView.
 *
 * Nada é simulado: se a permissão for negada, o app informa o usuário.
 */
object ScreenCaptureBus {

    private var pendingResultCode: Int = Activity.RESULT_CANCELED
    private var pendingData: Intent? = null

    /** Guarda o consentimento recebido pela ProjectionPermissionActivity. */
    fun setPermission(resultCode: Int, data: Intent?) {
        pendingResultCode = resultCode
        pendingData = data
    }

    fun hasPermission(): Boolean = pendingData != null && pendingResultCode == Activity.RESULT_OK

    /** Inicia o fluxo: pede consentimento e depois captura. */
    fun requestCapture(context: Context) {
        if (!hasPermission()) {
            // pede consentimento; a captura acontece no retorno (onResult)
            val intent = Intent(context, ProjectionPermissionActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return
        }
        captureNow(context)
    }

    /** Captura efetiva, uma sessão por captura (padrão recomendado Android 14+). */
    fun captureNow(context: Context) {
        val resultCode = pendingResultCode
        val data = pendingData
        val webView = WebViewHolder.webView

        if (data == null || resultCode != Activity.RESULT_OK) {
            WebAppBridge.deliverCapture(
                webView ?: return,
                null,
                "Permissão de captura não concedida."
            )
            return
        }

        val projectionManager =
            context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        val projection: MediaProjection
        try {
            projection = projectionManager.getMediaProjection(resultCode, data)
        } catch (err: Exception) {
            WebAppBridge.deliverCapture(webView ?: return, null, "Falha ao iniciar o MediaProjection.")
            return
        }

        // Um consentimento só pode ser usado uma vez em versões recentes
        pendingData = null
        pendingResultCode = Activity.RESULT_CANCELED

        val metrics = realMetrics(context)
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val density = metrics.densityDpi

        val handler = Handler(Looper.getMainLooper())
        var virtualDisplay: VirtualDisplay? = null
        var imageReader: ImageReader? = null
        var projectionStopped = false

        fun cleanup() {
            try { virtualDisplay?.release() } catch (_: Exception) {}
            try { imageReader?.close() } catch (_: Exception) {}
            virtualDisplay = null
            imageReader = null
            if (!projectionStopped) {
                projectionStopped = true
                try { projection.stop() } catch (_: Exception) {}
            }
        }

        try {
            imageReader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 2)

            var delivered = false
            imageReader.setOnImageAvailableListener({ reader ->
                if (delivered) return@setOnImageAvailableListener
                var image: Image? = null
                try {
                    image = reader.acquireLatestImage()
                    if (image == null) return@setOnImageAvailableListener
                    delivered = true

                    val plane = image.planes[0]
                    val pixelStride = plane.pixelStride
                    val rowStride = plane.rowStride
                    val rowPadding = rowStride - pixelStride * width

                    var bitmap = Bitmap.createBitmap(
                        width + rowPadding / pixelStride,
                        height,
                        Bitmap.Config.ARGB_8888
                    )
                    bitmap.copyPixelsFromBuffer(plane.buffer)

                    // remove o padding da linha
                    if (rowPadding != 0) {
                        bitmap = Bitmap.createBitmap(bitmap, 0, 0, width, height)
                    }

                    val out = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    val png = out.toByteArray()
                    bitmap.recycle()
                    out.close()

                    handler.post {
                        val target = WebViewHolder.webView
                        if (target != null) {
                            WebAppBridge.deliverCapture(target, png, null)
                        }
                        cleanup()
                    }
                } catch (err: Exception) {
                    handler.post {
                        val target = WebViewHolder.webView
                        if (target != null) {
                            WebAppBridge.deliverCapture(target, null, "Erro ao ler o quadro da tela.")
                        }
                        cleanup()
                    }
                } finally {
                    try { image?.close() } catch (_: Exception) {}
                }
            }, handler)

            virtualDisplay = projection.createVirtualDisplay(
                "PrintFacilCapture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.surface,
                null,
                handler
            )

            // o Android 14 exige um callback registrado antes da captura
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                projection.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() {
                        cleanup()
                    }
                }, handler)
            }

            // tempo máximo de espera pelo primeiro quadro
            handler.postDelayed({
                if (!delivered) {
                    val target = WebViewHolder.webView
                    if (target != null) {
                        // fallback: tenta uma captura de View como último recurso? Não:
                        // o requisito proíbe simular. Informa o erro real.
                        WebAppBridge.deliverCapture(
                            target,
                            null,
                            "A tela não enviou nenhum quadro a tempo."
                        )
                    }
                    cleanup()
                }
            }, 4000)
        } catch (err: Exception) {
            cleanup()
            val target = WebViewHolder.webView
            if (target != null) {
                WebAppBridge.deliverCapture(target, null, "Falha ao capturar: ${err.message}")
            }
        }
    }

    private fun realMetrics(context: Context): DisplayMetrics {
        val metrics = DisplayMetrics()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val wm = context.getSystemService(WindowManager::class.java)
            val bounds = wm?.maximumWindowMetrics?.bounds
            if (bounds != null) {
                metrics.widthPixels = bounds.width()
                metrics.heightPixels = bounds.height()
            }
            metrics.densityDpi = context.resources.displayMetrics.densityDpi
            if (metrics.widthPixels == 0) {
                @Suppress("DEPRECATION")
                wm?.defaultDisplay?.getRealMetrics(metrics)
            }
        } else {
            @Suppress("DEPRECATION")
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
        }
        return metrics
    }
}

/** Referência fraca ao WebView ativo, para entregar a captura. */
object WebViewHolder {
    @Volatile
    var webView: android.webkit.WebView? = null
}
