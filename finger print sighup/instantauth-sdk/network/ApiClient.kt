package com.instantauth.sdk.network

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object ApiClient {

    lateinit var service: AuthService

    fun init(baseUrl: String) {

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        service = retrofit.create(AuthService::class.java)
    }
}
