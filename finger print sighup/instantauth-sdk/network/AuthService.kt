package com.instantauth.sdk.network

import com.instantauth.sdk.model.AuthResponse
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.POST

interface AuthService {

    @POST("/auth/register")
    fun register(@Body body: Map<String, String>): Call<AuthResponse>

    @POST("/auth/login")
    fun login(@Body body: Map<String, String>): Call<AuthResponse>
}
