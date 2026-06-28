package com.brittrade.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = bridge.getWebView();
        webView.addJavascriptInterface(new FingerprintBridge(this), "FingerprintBridge");
    }
}
