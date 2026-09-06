package com.donationledger.api.web;

import com.donationledger.api.config.AppProperties;
import com.donationledger.api.data.LedgerRepository;
import com.donationledger.api.model.AppUser;
import com.donationledger.api.security.PasswordService;
import com.donationledger.api.security.SessionService;
import com.donationledger.api.service.LedgerService.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
  private static final Pattern USERNAME = Pattern.compile("^[a-z0-9_]{3,30}$");
  private final LedgerRepository repository;
  private final PasswordService passwords;
  private final SessionService sessions;
  private final AppProperties properties;

  public AuthController(LedgerRepository repository, PasswordService passwords, SessionService sessions, AppProperties properties) {
    this.repository = repository;
    this.passwords = passwords;
    this.sessions = sessions;
    this.properties = properties;
  }

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken());
  }

  @GetMapping("/providers")
  public Map<String, Boolean> providers() {
    return Map.of("googleEnabled", properties.hasGoogleOAuth());
  }

  @GetMapping("/me")
  public Map<String, Object> me(Authentication authentication) {
    return Map.of("user", user(authentication), "currencyCode", properties.getCurrencyCode());
  }

  @PostMapping("/register")
  public Map<String, Object> register(@RequestBody RegisterRequest request, HttpServletResponse response) {
    String email = normalizeEmail(request.email());
    String username = normalizeUsername(request.username());
    String password = request.password() == null ? "" : request.password();

    if (!EMAIL.matcher(email).matches()) {
      throw new ApiException(400, "Enter a valid email address.");
    }
    if (!USERNAME.matcher(username).matches()) {
      throw new ApiException(400, "Username must use 3-30 lowercase letters, numbers, or underscores.");
    }
    if (password.length() < 8) {
      throw new ApiException(400, "Password must have at least 8 characters.");
    }
    if (!password.equals(request.confirmPassword())) {
      throw new ApiException(400, "Password confirmation does not match.");
    }
    if (repository.emailExists(email, null)) {
      throw new ApiException(400, "That email is already registered.");
    }
    if (repository.usernameExists(username, null)) {
      throw new ApiException(400, "That username is already in use.");
    }
    if (request.adminCode() != null && !request.adminCode().isBlank() && !request.adminCode().trim().equals(properties.getAdminSignupCode())) {
      throw new ApiException(400, "The admin code is not correct.");
    }

    String role = request.adminCode() != null && !request.adminCode().isBlank() ? "admin" : "user";
    AppUser created = repository.createUser(email, username, passwords.hash(password), role);
    sessions.create(created.id(), response);
    return Map.of("user", created);
  }

  @PostMapping("/login")
  public Map<String, Object> login(@RequestBody LoginRequest request, HttpServletResponse response) {
    String identifier = request.email() == null ? "" : request.email().trim().toLowerCase();
    String password = request.password() == null ? "" : request.password();
    var loginUser = repository.findUserForLogin(identifier)
      .orElseThrow(() -> new ApiException(400, "Incorrect email or password."));

    if (!passwords.matches(password, loginUser.passwordHash())) {
      throw new ApiException(400, "Incorrect email or password.");
    }
    if (passwords.requiresUpgrade(loginUser.passwordHash())) {
      repository.updatePassword(loginUser.id(), passwords.hash(password));
    }

    AppUser currentUser = repository.findUser(loginUser.id()).orElse(loginUser.asAppUser());
    sessions.create(currentUser.id(), response);
    return Map.of("user", currentUser, "needsEmail", currentUser.email() == null);
  }

  @PostMapping("/logout")
  public Map<String, Boolean> logout(HttpServletRequest request, HttpServletResponse response) {
    sessions.destroy(request, response);
    return Map.of("signedOut", true);
  }

  private AppUser user(Authentication authentication) {
    if (authentication == null || !(authentication.getPrincipal() instanceof AppUser currentUser)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED.value(), "Sign in required.");
    }
    return currentUser;
  }

  private String normalizeEmail(String email) {
    return email == null ? "" : email.trim().toLowerCase();
  }

  private String normalizeUsername(String username) {
    return username == null ? "" : username.trim().toLowerCase();
  }

  public record RegisterRequest(String email, String username, String password, String confirmPassword, String adminCode) { }
  public record LoginRequest(String email, String password) { }
}
