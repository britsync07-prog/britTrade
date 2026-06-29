import os
import json

base_dir = r"e:\tools\finger print sighup"

files = {
    "fingerprint-auth-server/pom.xml": """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.1.5</version>
        <relativePath/> <!-- lookup parent from repository -->
    </parent>
    <groupId>com</groupId>
    <artifactId>auth</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>fingerprint-auth-server</name>
    <description>Fingerprint Auth Server</description>
    <properties>
        <java.version>17</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>0.11.5</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>0.11.5</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>0.11.5</version>
            <scope>runtime</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>""",
    "fingerprint-auth-server/src/main/resources/application.yml": """server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/authdb
    username: postgres
    password: password

  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
""",
    "fingerprint-auth-server/src/main/java/com/auth/AuthApplication.java": """package com.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AuthApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthApplication.class, args);
    }
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/entity/User.java": """package com.auth.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "users")
@Data
public class User {
    @Id
    @GeneratedValue
    private UUID id;
    private boolean isUpgraded = false;
    private String passwordHash;
    private LocalDateTime createdAt = LocalDateTime.now();
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/entity/Device.java": """package com.auth.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "devices")
@Data
public class Device {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private UUID userId;
    private String deviceToken;
    private String deviceInfo;
    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime lastActive;
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/dto/AuthResponse.java": """package com.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.UUID;

@Data
@AllArgsConstructor
public class AuthResponse {
    private UUID userId;
    private String deviceToken;
    private String sessionToken;
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/dto/RegisterRequest.java": """package com.auth.dto;

import lombok.Data;

@Data
public class RegisterRequest {
    private String deviceInfo;
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/repository/UserRepository.java": """package com.auth.repository;

import com.auth.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {}
""",
    "fingerprint-auth-server/src/main/java/com/auth/repository/DeviceRepository.java": """package com.auth.repository;

import com.auth.entity.Device;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface DeviceRepository extends JpaRepository<Device, Long> {
    Optional<Device> findByDeviceToken(String token);
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/security/JwtService.java": """package com.auth.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final String SECRET = "CHANGE_THIS_SECRET_TO_A_VERY_LONG_AND_SECURE_STRING_FOR_HS256";

    public String generate(UUID userId) {
        return Jwts.builder()
                .setSubject(userId.toString())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 3600000))
                .signWith(SignatureAlgorithm.HS256, SECRET.getBytes())
                .compact();
    }
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/service/AuthService.java": """package com.auth.service;

import com.auth.dto.AuthResponse;
import com.auth.dto.RegisterRequest;
import com.auth.entity.Device;
import com.auth.entity.User;
import com.auth.repository.DeviceRepository;
import com.auth.repository.UserRepository;
import com.auth.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepo;
    private final DeviceRepository deviceRepo;
    private final JwtService jwt;

    public AuthResponse register(RegisterRequest req) {
        User user = new User();
        userRepo.save(user);

        String deviceToken = UUID.randomUUID().toString();

        Device device = new Device();
        device.setUserId(user.getId());
        device.setDeviceToken(deviceToken);
        device.setDeviceInfo(req.getDeviceInfo());
        deviceRepo.save(device);

        String session = jwt.generate(user.getId());

        return new AuthResponse(user.getId(), deviceToken, session);
    }

    public AuthResponse login(String deviceToken) {
        Device device = deviceRepo.findByDeviceToken(deviceToken)
                .orElseThrow(() -> new RuntimeException("Device not found"));

        String session = jwt.generate(device.getUserId());

        return new AuthResponse(device.getUserId(), deviceToken, session);
    }
}
""",
    "fingerprint-auth-server/src/main/java/com/auth/controller/AuthController.java": """package com.auth.controller;

import com.auth.dto.AuthResponse;
import com.auth.dto.RegisterRequest;
import com.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService service;

    @PostMapping("/register")
    public AuthResponse register(@RequestBody RegisterRequest req) {
        return service.register(req);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody Map<String, String> req) {
        return service.login(req.get("device_token"));
    }
}
""",
    "fingerprint-auth-server/Dockerfile": """FROM openjdk:17
COPY target/app.jar app.jar
ENTRYPOINT ["java","-jar","/app.jar"]
""",

    "instantauth-sdk/core/InstantAuth.kt": """package com.instantauth.sdk.core

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
""",
    "instantauth-sdk/core/AuthManager.kt": """package com.instantauth.sdk.core

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

            override fun onFailure(call: Call<AuthResponse>, t: Throwable) {}
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

            override fun onFailure(call: Call<AuthResponse>, t: Throwable) {}
        })
    }
}
""",
    "instantauth-sdk/ui/InstantAuthButton.kt": """package com.instantauth.sdk.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun InstantAuthButton(onClick: () -> Unit) {
    Button(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.White
        ),
        border = BorderStroke(1.dp, Color(0xFF4DA6FF))
    ) {
        Text(
            text = "Continue Instantly",
            color = Color.Black
        )
    }
}
""",
    "instantauth-sdk/biometric/BiometricHelper.kt": """package com.instantauth.sdk.biometric

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
""",
    "instantauth-sdk/storage/SecureStorage.kt": """package com.instantauth.sdk.storage

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
""",
    "instantauth-sdk/network/ApiClient.kt": """package com.instantauth.sdk.network

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
""",
    "instantauth-sdk/network/AuthService.kt": """package com.instantauth.sdk.network

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
""",
    "instantauth-sdk/model/AuthResponse.kt": """package com.instantauth.sdk.model

data class AuthResponse(
    val userId: String,
    val deviceToken: String,
    val sessionToken: String
)
""",
    "instantauth-sdk/README.md": """# InstantAuth SDK – Quick Start

🔹 Step 1: Add SDK
```gradle
implementation 'com.instantauth:sdk:1.0.0'
```

🔹 Step 2: Initialize
```kotlin
InstantAuth.init(
    key = "YOUR_API_KEY",
    url = "https://api.yourdomain.com"
)
```

🔹 Step 3: Add Button
```kotlin
InstantAuthButton {
    AuthManager.startAuth(this) { sessionToken ->
        // user logged in
    }
}
```

🔹 Step 4: Done 🎉
That’s it.
No forms. No password.
"""
}

for path, content in files.items():
    full_path = os.path.join(base_dir, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Setup completed!")
