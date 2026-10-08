package com.luckynate.quivermobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class MainActivity : Activity() {
    external fun nativeInit()
    external fun nativeResize(width: Int, height: Int)
    external fun nativeDraw()
    external fun nativeOrbit(dx: Float, dy: Float, zoom: Float)
    external fun nativeMove(x: Float, y: Float)

    private val updateHandler = Handler(Looper.getMainLooper())
    private var checkingUpdates = false
    private var promptedVersion = 0
    private val updateTicker = object : Runnable {
        override fun run() {
            checkUpdates()
            updateHandler.postDelayed(this, 5 * 60 * 1000L)
        }
    }
    private lateinit var surface: GLSurfaceView
    private var lastX = 0f
    private var lastY = 0f
    private var lastSpan = 0f
    private var leftStartX = 0f
    private var leftStartY = 0f
    private var leftStick = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        surface = GLSurfaceView(this).apply {
            setEGLContextClientVersion(3)
            setRenderer(object : GLSurfaceView.Renderer {
                override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) = nativeInit()
                override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) = nativeResize(width, height)
                override fun onDrawFrame(gl: GL10?) = nativeDraw()
            })
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
            setOnTouchListener { _, event -> handleTouch(event) }
        }
        setContentView(surface)
    }

    private fun handleTouch(e: MotionEvent): Boolean {
        val x = e.getX(0)
        val y = e.getY(0)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                lastX = x; lastY = y
                if (e.actionMasked == MotionEvent.ACTION_DOWN) {
                    leftStick = x < surface.width * 0.5f
                    leftStartX = x; leftStartY = y
                }
                lastSpan = if (e.pointerCount >= 2) span(e) else 0f
            }
            MotionEvent.ACTION_MOVE -> {
                if (e.pointerCount >= 2) {
                    val newSpan = span(e)
                    if (lastSpan > 0f && newSpan > 0f) {
                        val zoom = (lastSpan / newSpan).coerceIn(0.7f, 1.4f)
                        surface.queueEvent { nativeOrbit(0f, 0f, zoom) }
                    }
                    lastSpan = newSpan
                } else if (leftStick) {
                    val sx = ((x - leftStartX) / 90f).coerceIn(-1f, 1f)
                    val sy = ((leftStartY - y) / 90f).coerceIn(-1f, 1f)
                    surface.queueEvent { nativeMove(sx, sy) }
                } else {
                    val dx = (x - lastX) * 0.007f
                    val dy = (y - lastY) * 0.007f
                    surface.queueEvent { nativeOrbit(-dx, dy, 1f) }
                }
                lastX = x; lastY = y
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                lastSpan = 0f
                surface.queueEvent { nativeMove(0f, 0f) }
            }
        }
        return true
    }

    private fun span(e: MotionEvent): Float {
        val dx = e.getX(0) - e.getX(1)
        val dy = e.getY(0) - e.getY(1)
        return kotlin.math.sqrt(dx * dx + dy * dy)
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

    companion object {
        init { System.loadLibrary("quivermobile") }
    }
}
