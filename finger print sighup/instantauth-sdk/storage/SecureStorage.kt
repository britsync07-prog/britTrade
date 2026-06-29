package com.instantauth.sdk.storage

import android.content.Context

object SecureStorage {

    fun save(ctx: Context, key: String, value: String) {
        val prefs = ctx.getSharedPreferences("instantauth", Context.MODE_PRIVATE)
        prefs.edit().putString(key, value).apply()
    }

    fun get(ctx: Context, key: String): String? {
        val prefs = ctx.getSharedPreferences("instantauth", Context.MODE_PRIVATE)
        return prefs.getString(key, null)
    }
}
