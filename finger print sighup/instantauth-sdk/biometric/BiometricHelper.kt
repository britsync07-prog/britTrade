package com.instantauth.sdk.biometric

import android.app.Activity
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat

object BiometricHelper {

    fun authenticate(activity: Activity, onSuccess: () -> Unit) {

        val executor = ContextCompat.getMainExecutor(activity)

        val prompt = BiometricPrompt(activity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }
            })

        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Verify identity")
            .setNegativeButtonText("Cancel")
            .build()

        prompt.authenticate(info)
    }
}
