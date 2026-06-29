package com.instantauth.sdk.core

import android.app.Activity
import com.instantauth.sdk.biometric.BiometricHelper
import com.instantauth.sdk.storage.SecureStorage
import com.instantauth.sdk.network.ApiClient
import com.instantauth.sdk.model.AuthResponse
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

object AuthManager {

    fun startAuth(activity: Activity, onSuccess: (String) -> Unit) {
        BiometricHelper.authenticate(activity) {
            val token = SecureStorage.get(activity, "device_token")

            if (token == null) {
                register(activity, onSuccess)
            } else {
                login(activity, token, onSuccess)
            }
        }
    }

    private fun register(activity: Activity, onSuccess: (String) -> Unit) {
        val body = mapOf("deviceInfo" to "Android")

        ApiClient.service.register(body).enqueue(object : Callback<AuthResponse> {
            override fun onResponse(call: Call<AuthResponse>, res: Response<AuthResponse>) {
                val data = res.body()
                if (data != null) {
                    SecureStorage.save(activity, "device_token", data.deviceToken)
                    onSuccess(data.sessionToken)
                }
            }

            override fun onFailure(call: Call<AuthResponse>, t: Throwable) {
                // Handle failure
            }
        })
    }

    private fun login(activity: Activity, token: String, onSuccess: (String) -> Unit) {
        val body = mapOf("device_token" to token)

        ApiClient.service.login(body).enqueue(object : Callback<AuthResponse> {
            override fun onResponse(call: Call<AuthResponse>, res: Response<AuthResponse>) {
                val data = res.body()
                if (data != null) {
                    onSuccess(data.sessionToken)
                }
            }

            override fun onFailure(call: Call<AuthResponse>, t: Throwable) {
                // Handle failure
            }
        })
    }
}
