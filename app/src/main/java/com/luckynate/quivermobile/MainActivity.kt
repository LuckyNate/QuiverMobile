package com.luckynate.quivermobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.view.Gravity
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : Activity() {
    private val updateHandler = Handler(Looper.getMainLooper())
    private var checkingUpdates = false
    private var promptedVersion = 0
    private val updateTicker = object : Runnable {
        override fun run() {
            checkUpdates()
            updateHandler.postDelayed(this, 5 * 60 * 1000L)
        }
    }
    private lateinit var web: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                request?.url?.let { assetLoader.shouldInterceptRequest(it) }
        }
        val frame = FrameLayout(this)
        frame.addView(web)
        val versionLabel = TextView(this).apply {
            text = "QuiverMobile v${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"
            setTextColor(Color.MAGENTA)
            textSize = 12f
            setPadding(12, 8, 12, 8)
            setBackgroundColor(0x88000000.toInt())
        }
        frame.addView(versionLabel, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.START
        ))
        setContentView(frame)
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    private fun checkUpdates() {
        if (checkingUpdates) return
        checkingUpdates = true
        Thread {
            try {
                val connection = URL("https://api.github.com/repos/LuckyNate/QuiverMobile/releases/latest")
                    .openConnection() as HttpURLConnection
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.setRequestProperty("Accept", "application/vnd.github+json")
                val json = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
                connection.disconnect()
                val available = json.optString("tag_name").removePrefix("v").toIntOrNull() ?: return@Thread
                if (available <= BuildConfig.VERSION_CODE || available <= promptedVersion) return@Thread
                val assets = json.getJSONArray("assets")
                var url: String? = null
                for (i in 0 until assets.length()) {
                    val asset = assets.getJSONObject(i)
                    if (asset.optString("name") == "QuiverMobile.apk") {
                        url = asset.getString("browser_download_url")
                        break
                    }
                }
                val download = url ?: return@Thread
                runOnUiThread {
                    if (!isFinishing && !isDestroyed && available > promptedVersion) {
                        promptedVersion = available
                        AlertDialog.Builder(this)
                        .setTitle("QuiverMobile update")
                        .setMessage("Version $available is available. Download and install?")
                        .setNegativeButton("Later", null)
                        .setPositiveButton("Update") { _, _ -> downloadUpdate(download) }
                        .show()
                    }
                }
            } catch (_: Exception) {
                // Offline or no published update: continue playing.
            } finally {
                runOnUiThread { checkingUpdates = false }
            }
        }.start()
    }

    private fun downloadUpdate(download: String) {
        Thread {
            try {
                val file = File(cacheDir, "updates/QuiverMobile.apk")
                file.parentFile?.mkdirs()
                val connection = URL(download).openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                connection.instanceFollowRedirects = true
                connection.inputStream.use { input -> file.outputStream().use { output -> input.copyTo(output) } }
                connection.disconnect()
                val uri: Uri = FileProvider.getUriForFile(this, "$packageName.files", file)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                runOnUiThread { startActivity(intent) }
            } catch (e: Exception) {
                runOnUiThread {
                    if (!isFinishing) AlertDialog.Builder(this)
                        .setMessage("Could not download update: ${e.message}")
                        .setPositiveButton("OK", null).show()
                }
            }
        }.start()
    }

    override fun onResume() {
        super.onResume()
        surface.onResume()
        updateHandler.removeCallbacks(updateTicker)
        updateHandler.post(updateTicker)
    }
    override fun onPause() {
        updateHandler.removeCallbacks(updateTicker)
        surface.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        updateHandler.removeCallbacks(updateTicker)
        updateHandler.post(updateTicker)
    }
    override fun onPause() {
        updateHandler.removeCallbacks(updateTicker)
        web.onPause()
        super.onPause()
    }
    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
