package com.donationledger.api.web;

import com.donationledger.api.config.AppProperties;
import com.donationledger.api.data.LedgerRepository;
import com.donationledger.api.model.AppUser;
import com.donationledger.api.service.LedgerService;
import com.donationledger.api.service.LedgerService.ApiException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class LedgerController {
  private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
  private static final Pattern USERNAME = Pattern.compile("^[a-z0-9_]{3,30}$");
  private final LedgerRepository repository;
  private final LedgerService ledger;
  private final AppProperties properties;

  public LedgerController(LedgerRepository repository, LedgerService ledger, AppProperties properties) {
    this.repository = repository;
    this.ledger = ledger;
    this.properties = properties;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "ok");
  }

  @GetMapping("/dashboard")
  public Map<String, Object> dashboard(Authentication authentication) {
    return ledger.dashboard(user(authentication));
  }

  @GetMapping("/history")
  public Map<String, Object> history(Authentication authentication) {
    return Map.of("donations", repository.findHistory(user(authentication).id(), 250));
  }

  @GetMapping("/transparency")
  public Map<String, Object> transparency() {
    return Map.of("summary", repository.getTransparencySummary(), "adjustments", repository.findAdjustments());
  }

  @PostMapping("/donations")
  public Map<String, Object> donate(Authentication authentication, @RequestBody DonationRequest request) {
    AppUser currentUser = user(authentication);
    BigDecimal amount = money(request.amount());
    String method = normalizeMethod(request.paymentMethod());
    String paymentReference = trim(request.paymentReference());

    if (amount == null || amount.signum() <= 0) {
      throw new ApiException(400, "Enter an amount greater than zero.");
    }
    if (!ledger.isPaymentMethod(method)) {
      throw new ApiException(400, "Choose Vodafone Cash, InstaPay, or Telda.");
    }
    if (paymentReference.isBlank() || paymentReference.length() > 120) {
      throw new ApiException(400, "Enter a phone number or account identifier up to 120 characters.");
    }
    if (trim(request.donorNote()).length() > 1000) {
      throw new ApiException(400, "The note is too long.");
    }

    long donationId = ledger.createDonation(currentUser, amount, method, paymentReference, trim(request.donorNote()));
    return Map.of("id", donationId, "message", "Donation submitted for validation.");
  }

  @GetMapping("/profile")
  public Map<String, Object> profile(Authentication authentication) {
    AppUser currentUser = user(authentication);
    return Map.of("user", currentUser, "paymentProfiles", repository.findPaymentProfiles(currentUser.id()), "currencyCode", properties.getCurrencyCode());
  }

  @PutMapping("/profile")
  public Map<String, Object> updateProfile(Authentication authentication, @RequestBody ProfileRequest request) {
    AppUser currentUser = user(authentication);
    String email = trim(request.email()).toLowerCase();
    String username = trim(request.username()).toLowerCase();
    BigDecimal dailyTarget = moneyAllowingZero(request.dailyTarget());

    if (!EMAIL.matcher(email).matches()) {
      throw new ApiException(400, "Enter a valid email address.");
    }
    if (!USERNAME.matcher(username).matches()) {
      throw new ApiException(400, "Username must use 3-30 lowercase letters, numbers, or underscores.");
    }
    if (dailyTarget == null || dailyTarget.signum() < 0) {
      throw new ApiException(400, "Daily amount must be zero or greater.");
    }
    if (repository.emailExists(email, currentUser.id())) {
      throw new ApiException(400, "That email is already registered.");
    }
    if (repository.usernameExists(username, currentUser.id())) {
      throw new ApiException(400, "That username is already in use.");
    }
    return Map.of("user", repository.updateProfile(currentUser.id(), email, username, dailyTarget));
  }

  @PostMapping("/profile/payment-profiles")
  public Map<String, Object> addPaymentProfile(Authentication authentication, @RequestBody PaymentProfileRequest request) {
    AppUser currentUser = user(authentication);
    String method = normalizeMethod(request.paymentMethod());
    String identifier = trim(request.accountIdentifier());
    String label = trim(request.label());

    if (!ledger.isPaymentMethod(method)) {
      throw new ApiException(400, "Choose a supported payment method.");
    }
    if (identifier.isBlank() || identifier.length() > 120) {
      throw new ApiException(400, "Enter an account identifier up to 120 characters.");
    }
    if (label.length() > 80) {
      throw new ApiException(400, "The profile label is too long.");
    }

    long profileId = ledger.savePaymentProfile(currentUser, method, identifier, label, request.makeDefault());
    return Map.of("id", profileId, "paymentProfiles", repository.findPaymentProfiles(currentUser.id()));
  }

  @DeleteMapping("/profile/payment-profiles/{id}")
  public Map<String, Boolean> deletePaymentProfile(Authentication authentication, @PathVariable long id) {
    repository.deletePaymentProfile(user(authentication).id(), id);
    return Map.of("deleted", true);
  }

  private AppUser user(Authentication authentication) {
    if (authentication == null || !(authentication.getPrincipal() instanceof AppUser currentUser)) {
      throw new ApiException(401, "Sign in required.");
    }
    return currentUser;
  }

  private BigDecimal money(BigDecimal amount) {
    return amount == null ? null : amount.setScale(2, RoundingMode.HALF_UP);
  }

  private BigDecimal moneyAllowingZero(BigDecimal amount) {
    return money(amount);
  }

  private String normalizeMethod(String method) {
    return trim(method).toUpperCase();
  }

  private String trim(String value) {
    return value == null ? "" : value.trim();
  }

  public record DonationRequest(BigDecimal amount, String paymentMethod, String paymentReference, String donorNote) { }
  public record ProfileRequest(String email, String username, BigDecimal dailyTarget) { }
  public record PaymentProfileRequest(String paymentMethod, String accountIdentifier, String label, boolean makeDefault) { }
}
