package com.brittrade.app;

import androidx.fragment.app.FragmentActivity;
import android.webkit.JavascriptInterface;

import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

public class FingerprintBridge {

    private final FragmentActivity activity;

    public FingerprintBridge(FragmentActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public void authenticate() {
        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("BritTrade Fingerprint Login")
                .setSubtitle("Verify your identity to continue")
                .setNegativeButtonText("Cancel")
                .build();

            BiometricPrompt prompt = new BiometricPrompt(activity,
                ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        evaluateJs("window.FingerprintBridgeOnSuccess()");
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        evaluateJs("window.FingerprintBridgeOnError('" + escapeJs(errString.toString()) + "')");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        evaluateJs("window.FingerprintBridgeOnError('Authentication failed')");
                    }
                });

            prompt.authenticate(info);
        });
    }

    private void evaluateJs(String js) {
        if (activity instanceof com.getcapacitor.BridgeActivity) {
            com.getcapacitor.BridgeActivity cap = (com.getcapacitor.BridgeActivity) activity;
            cap.getBridge().getWebView().post(() ->
                cap.getBridge().getWebView().evaluateJavascript(js, null)
            );
        }
    }

    private String escapeJs(String s) {
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r");
    }
}
