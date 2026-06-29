package com.auth.controller;

import com.auth.dto.AuthResponse;
import com.auth.dto.RegisterRequest;
import com.auth.dto.UpgradeRequest;
import com.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public AuthResponse register(@RequestBody RegisterRequest req) {
        return authService.register(req);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody Map<String, String> req) {
        return authService.login(req.get("device_token"));
    }

    @PostMapping("/upgrade")
    public ResponseEntity<String> upgrade(@RequestBody UpgradeRequest req) {
        authService.upgrade(req.getUserId(), req.getEmail(), req.getPassword());
        return ResponseEntity.ok("Account successfully upgraded.");
    }
}
