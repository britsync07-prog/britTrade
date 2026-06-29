package com.auth.service;

import com.auth.dto.AuthResponse;
import com.auth.dto.RegisterRequest;
import com.auth.entity.Device;
import com.auth.entity.User;
import com.auth.repository.DeviceRepository;
import com.auth.repository.UserRepository;
import com.auth.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepo;
    private final DeviceRepository deviceRepo;
    private final JwtService jwtService;

    public AuthResponse register(RegisterRequest req) {
        User user = new User();
        userRepo.save(user);

        String deviceToken = UUID.randomUUID().toString();

        Device device = new Device();
        device.setUserId(user.getId());
        device.setDeviceToken(deviceToken);
        device.setDeviceInfo(req.getDeviceInfo());
        deviceRepo.save(device);

        String session = jwtService.generateToken(user.getId());

        return new AuthResponse(user.getId(), deviceToken, session);
    }

    public AuthResponse login(String deviceToken) {
        Device device = deviceRepo.findByDeviceToken(deviceToken)
                .orElseThrow(() -> new RuntimeException("Device not found"));

        String session = jwtService.generateToken(device.getUserId());

        return new AuthResponse(device.getUserId(), deviceToken, session);
    }

    public void upgrade(UUID userId, String email, String password) {
        User user = userRepo.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        String hash = BCrypt.hashpw(password, BCrypt.gensalt());
        user.setEmail(email);
        user.setPasswordHash(hash);
        user.setUpgraded(true);
        userRepo.save(user);
    }
}
