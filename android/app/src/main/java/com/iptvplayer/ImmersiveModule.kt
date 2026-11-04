package com.iptvplayer

import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Tam ekran video için gerçek "immersive" mod: sistem çubukları gizlenir ve içerik
 * ekran çentiğinin (cutout) altına/yanına kadar uzatılır.
 */
class ImmersiveModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "Immersive"

  // JS tarafı hangi marka (pasha / paris) olduğunu buradan okur
  override fun getConstants(): MutableMap<String, Any> = hashMapOf("brand" to BuildConfig.BRAND)

  @ReactMethod
  fun set(on: Boolean) {
    val activity = ctx.currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val lp = window.attributes
        lp.layoutInDisplayCutoutMode =
          if (!on) WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
          else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
          else WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        window.attributes = lp
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        window.setDecorFitsSystemWindows(!on)
        val c = window.insetsController
        if (c != null) {
          if (on) {
            c.systemBarsBehavior =
              android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            c.hide(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
          } else {
            c.show(WindowInsets.Type.systemBars())
          }
        }
      } else {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
          if (on)
            (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
              View.SYSTEM_UI_FLAG_FULLSCREEN or
              View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
              View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
              View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
              View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
          else View.SYSTEM_UI_FLAG_VISIBLE
      }
    }
  }
}

class ImmersivePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext) =
    listOf(ImmersiveModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
