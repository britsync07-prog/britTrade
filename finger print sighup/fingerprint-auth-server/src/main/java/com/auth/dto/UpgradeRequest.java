package com.auth.dto;

import lombok.Data;
import java.util.UUID;

@Data
public class UpgradeRequest {
    private UUID userId;
    private String email;
    private String password;
}
