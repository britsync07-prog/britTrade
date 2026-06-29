package com.instantauth.sdk.model

data class AuthResponse(
    val userId: String,
    val deviceToken: String,
    val sessionToken: String
)
