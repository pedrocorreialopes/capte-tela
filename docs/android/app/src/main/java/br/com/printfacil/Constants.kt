package br.com.printfacil

/**
 * Constantes compartilhadas entre a interface e a camada nativa.
 */
object Constants {
    const val TAG = "PrintFacil"

    /** Nome do objeto injetado no WebView (window.PrintFacilNative). */
    const val BRIDGE_NAME = "PrintFacilNative"

    /** Função global de retorno chamada pela camada nativa com o PNG em base64. */
    const val JS_CAPTURE_CALLBACK = "__printFacilOnNativeCapture"

    const val NOTIFICATION_CHANNEL_ID = "printfacil_floating"
    const val NOTIFICATION_ID = 4711

    const val REQ_OVERLAY = 1001
    const val REQ_PROJECTION = 1002
    const val REQ_NOTIFICATIONS = 1003

    const val ACTION_SHOW_BUTTON = "br.com.printfacil.action.SHOW_BUTTON"
    const val ACTION_HIDE_BUTTON = "br.com.printfacil.action.HIDE_BUTTON"
    const val ACTION_CAPTURE = "br.com.printfacil.action.CAPTURE"
    const val ACTION_STOP = "br.com.printfacil.action.STOP_SERVICE"
}
