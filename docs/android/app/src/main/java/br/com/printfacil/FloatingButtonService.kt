package br.com.printfacil

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Serviço em primeiro plano que mantém o botão flutuante visível SOBRE TODOS
 * OS APLICATIVOS (SYSTEM_ALERT_WINDOW) e dispara a captura por MediaProjection.
 *
 * Um toque = captura. Arrastar = reposicionar (posição persistida).
 */
class FloatingButtonService : Service() {

    private lateinit var windowManager: WindowManager
    private var bubbleView: View? = null
    private var params: WindowManager.LayoutParams? = null

    private var downX = 0f
    private var downY = 0f
    private var touchX = 0f
    private var touchY = 0f
    private var dragging = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            Constants.ACTION_STOP -> {
                hideBubble()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            Constants.ACTION_CAPTURE -> {
                triggerCapture()
                return START_STICKY
            }
            else -> {
                startInForeground()
                showBubble()
            }
        }
        return START_STICKY
    }

    /* --------------------------- notificação --------------------------- */

    private fun startInForeground() {
        createChannel()

        val openIntent = PendingIntent.getActivity(
            this,
            0,
            MainActivity.intentFor(this),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, FloatingButtonService::class.java).apply { action = Constants.ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(R.drawable.ic_stat_camera)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(0, getString(R.string.notif_stop), stopIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                Constants.NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(Constants.NOTIFICATION_ID, notification)
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                Constants.NOTIFICATION_CHANNEL_ID,
                getString(R.string.notif_channel),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notif_channel_desc)
                setShowBadge(false)
            }
            manager?.createNotificationChannel(channel)
        }
    }

    /* ------------------------------ bolha ------------------------------ */

    private fun showBubble() {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        if (bubbleView != null) return

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            val (savedX, savedY) = Prefs.bubblePosition(this@FloatingButtonService)
            if (savedX >= 0f && savedY >= 0f) {
                x = savedX.toInt()
                y = savedY.toInt()
            } else {
                x = 24
                y = resources.displayMetrics.heightPixels / 2
            }
        }

        val view = LayoutInflater.from(this).inflate(R.layout.view_floating_bubble, null)
        applyBubbleStyle(view)

        view.setOnTouchListener { _, event -> handleTouch(event, view) }

        windowManager.addView(view, layoutParams)
        bubbleView = view
        params = layoutParams
        Prefs.setFloatingEnabled(this, true)
    }

    private fun applyBubbleStyle(view: View) {
        val sizePx = (56 * resources.displayMetrics.density).toInt()
        val circle = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            colors = intArrayOf(0xFF7C6CFF.toInt(), 0xFF22D3EE.toInt())
            gradientType = GradientDrawable.LINEAR_GRADIENT
            orientation = GradientDrawable.Orientation.TL_BR
            setSize(sizePx, sizePx)
        }
        view.background = circle
        view.elevation = 12f * resources.displayMetrics.density
        val lp = view.layoutParams
        if (lp != null) {
            lp.width = sizePx
            lp.height = sizePx
            view.layoutParams = lp
        }
        view.layoutParams?.let {
            it.width = sizePx
            it.height = sizePx
        }
    }

    private fun handleTouch(event: MotionEvent, view: View): Boolean {
        val layoutParams = params ?: return false

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                downX = layoutParams.x.toFloat()
                downY = layoutParams.y.toFloat()
                touchX = event.rawX
                touchY = event.rawY
                dragging = false
                view.animate().scaleX(0.92f).scaleY(0.92f).setDuration(90).start()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = event.rawX - touchX
                val dy = event.rawY - touchY
                if (hypot(dx.toDouble(), dy.toDouble()) > 12) {
                    dragging = true
                }
                if (dragging) {
                    layoutParams.x = (downX + dx).toInt()
                    layoutParams.y = (downY + dy).toInt()
                    clampToScreen(layoutParams)
                    bubbleView?.let {
                        runCatching { windowManager.updateViewLayout(it, layoutParams) }
                    }
                }
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                view.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
                if (dragging) {
                    clampToScreen(layoutParams)
                    Prefs.setBubblePosition(this, layoutParams.x.toFloat(), layoutParams.y.toFloat())
                } else if (event.action == MotionEvent.ACTION_UP) {
                    view.performClick()
                    triggerCapture()
                }
                return true
            }
        }
        return false
    }

    private fun clampToScreen(layoutParams: WindowManager.LayoutParams) {
        val metrics = resources.displayMetrics
        val size = (60 * metrics.density).toInt()
        layoutParams.x = layoutParams.x.coerceIn(0, (metrics.widthPixels - size).coerceAtLeast(0))
        layoutParams.y = layoutParams.y.coerceIn(0, (metrics.heightPixels - size).coerceAtLeast(0))
    }

    /* ----------------------------- captura ----------------------------- */

    private fun triggerCapture() {
        if (bubbleView != null) {
            bubbleView?.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY)
        }
        // Mantém o WebView da interface como destino da imagem; se o app estiver
        // fechado, abre a interface para receber a captura.
        if (WebViewHolder.webView == null) {
            val intent = MainActivity.intentFor(this, "inicio").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        }
        ScreenCaptureBus.requestCapture(this)
    }

    private fun hideBubble() {
        bubbleView?.let { view ->
            runCatching { windowManager.removeView(view) }
        }
        bubbleView = null
        Prefs.setFloatingEnabled(this, false)
    }

    override fun onDestroy() {
        hideBubble()
        super.onDestroy()
    }

    companion object {
        fun start(context: Context) {
            val intent = Intent(context, FloatingButtonService::class.java).apply {
                action = Constants.ACTION_SHOW_BUTTON
            }
            androidx.core.content.ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, FloatingButtonService::class.java).apply {
                action = Constants.ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
