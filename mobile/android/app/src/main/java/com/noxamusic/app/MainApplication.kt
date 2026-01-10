package com.noxamusic.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.noxamusic.app.BuildConfig

class MainApplication : Application(), ReactApplication {
  private val defaultReactNativeHost: DefaultReactNativeHost by lazy {
    object : DefaultReactNativeHost(this) {
      override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

      override fun getPackages() =
        PackageList(this@MainApplication).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }

      override fun getJSMainModuleName(): String = "index"
    }
  }

  override val reactNativeHost: ReactNativeHost
    get() = defaultReactNativeHost

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      reactNativeHost = defaultReactNativeHost,
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
