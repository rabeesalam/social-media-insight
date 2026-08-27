package com.puresquare.socialinsight.data

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.UUID

/**
 * Device identity (device_uuid + device_secret) is the whole security boundary between this app
 * and Supabase (ADR-0002) — every device_rpc_functions.sql call re-validates the secret against a
 * server-side hash, so nothing more sensitive than "this one device's own rows" leaks if the APK
 * is decompiled. Stored Android-Keystore-backed, never plain SharedPreferences.
 */
class DeviceIdentity(context: Context) {
    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context,
            "device_identity",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    val deviceUuid: String
        get() = prefs.getString(KEY_UUID, null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_UUID, it).apply()
        }

    var deviceSecret: String?
        get() = prefs.getString(KEY_SECRET, null)
        set(value) = prefs.edit().putString(KEY_SECRET, value).apply()

    val isRegistered: Boolean
        get() = deviceSecret != null

    fun deviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
    fun androidVersion(): String = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
    fun deviceModel(): String = Build.MODEL ?: "unknown"

    companion object {
        private const val KEY_UUID = "device_uuid"
        private const val KEY_SECRET = "device_secret"
    }
}

/** Convenience: throws if register_device hasn't succeeded yet — callers should never reach data
 * screens before device registration completes (see SocialInsightApp / MainActivity startup). */
fun DeviceIdentity.requireSecret(): String =
    deviceSecret ?: error("Device not registered yet")
