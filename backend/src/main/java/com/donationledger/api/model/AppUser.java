package com.donationledger.api.model;

import java.math.BigDecimal;

public record AppUser(long id, String username, String email, String role, BigDecimal dailyTarget) {
  public boolean isAdmin() {
    return "admin".equals(role);
  }
}
