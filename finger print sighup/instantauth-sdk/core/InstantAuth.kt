package com.instantauth.sdk.core

import com.instantauth.sdk.network.ApiClient

object InstantAuth {

    private lateinit var apiKey: String
    private lateinit var baseUrl: String

    fun init(key: String, url: String) {
        apiKey = key
        baseUrl = url
        ApiClient.init(url)
    }
}
