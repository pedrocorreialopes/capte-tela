package br.com.printfacil

import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings

/**
 * Estado nativo mínimo (não substitui os ajustes da interface, que vivem
 * no localStorage do app).
 */
object Prefs {
    private const val FILE = "printfacil_native"
    private const val KEY_FLOATING = "floating_enabled"
    private const val KEY_POS_X = "bubble_x"
    private const val KEY_POS_Y = "bubble_y"

    private fun sp(context: Context): SharedPreferences =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun isFloatingEnabled(context: Context): Boolean =
        sp(context).getBoolean(KEY_FLOATING, false)

    fun setFloatingEnabled(context: Context, enabled: Boolean) {
        sp(context).edit().putBoolean(KEY_FLOATING, enabled).apply()
    }

    fun hasOverlay(context: Context): Boolean = Settings.canDrawOverlays(context)

    fun bubblePosition(context: Context): Pair<Float, Float> {
        val prefs = sp(context)
        return prefs.getFloat(KEY_POS_X, -1f) to prefs.getFloat(KEY_POS_Y, -1f)
    }

    fun setBubblePosition(context: Context, x: Float, y: Float) {
        sp(context).edit().putFloat(KEY_POS_X, x).putFloat(KEY_POS_Y, y).apply()
    }
}
