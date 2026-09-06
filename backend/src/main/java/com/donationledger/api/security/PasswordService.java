package com.donationledger.api.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class PasswordService {
  private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);

  public String hash(String password) {
    return bcrypt.encode(password);
  }

  public boolean matches(String password, String storedHash) {
    if (storedHash == null || storedHash.isBlank()) {
      return false;
    }

    if (storedHash.startsWith("scrypt:")) {
      return legacyScryptMatches(password, storedHash);
    }

    return bcrypt.matches(password, storedHash);
  }

  public boolean requiresUpgrade(String storedHash) {
    return storedHash != null && storedHash.startsWith("scrypt:");
  }

  private boolean legacyScryptMatches(String password, String storedHash) {
    String[] parts = storedHash.split(":", 3);
    if (parts.length != 3 || parts[1].isBlank() || parts[2].isBlank()) {
      return false;
    }

    try {
      byte[] salt = parts[1].getBytes(StandardCharsets.UTF_8);
      byte[] expected = HexFormat.of().parseHex(parts[2]);
      byte[] actual = SCrypt.generate(password.getBytes(StandardCharsets.UTF_8), salt, 16384, 8, 1, 64);
      return MessageDigest.isEqual(expected, actual);
    } catch (IllegalArgumentException exception) {
      return false;
    }
  }
}
