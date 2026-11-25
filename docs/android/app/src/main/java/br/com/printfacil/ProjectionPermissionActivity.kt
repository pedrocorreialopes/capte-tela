package br.com.printfacil

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/**
 * Activity transparente que solicita o consentimento de captura do sistema
 * (o diálogo do próprio Android) e devolve o resultado ao ScreenCaptureBus.
 */
class ProjectionPermissionActivity : AppCompatActivity() {

    private val launcher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode == Activity.RESULT_OK && data != null) {
                ScreenCaptureBus.setPermission(result.resultCode, data)
                // captura imediatamente após a autorização
                ScreenCaptureBus.captureNow(applicationContext)
            } else {
                val target = WebViewHolder.webView
                if (target != null) {
                    WebAppBridge.deliverCapture(
                        target,
                        null,
                        "Captura não autorizada pelo usuário."
                    )
                } else {
                    Toast.makeText(
                        this,
                        getString(R.string.projection_denied),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
            finish()
            overridePendingTransition(0, 0)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Nenhum layout: só o diálogo do sistema. Se houver um consentimento
        // recente reaproveitável, captura direto.
        if (ScreenCaptureBus.hasPermission()) {
            ScreenCaptureBus.captureNow(this)
            finish()
            return
        }

        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        launcher.launch(manager.createScreenCaptureIntent())
    }

    companion object {
        fun intent(context: Context): Intent =
            Intent(context, ProjectionPermissionActivity::class.java)
    }
}
