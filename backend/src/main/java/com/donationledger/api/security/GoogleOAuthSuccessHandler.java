package com.donationledger.api.security;

import com.donationledger.api.config.AppProperties;
import com.donationledger.api.data.LedgerRepository;
import com.donationledger.api.model.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

@Component
public class GoogleOAuthSuccessHandler implements AuthenticationSuccessHandler {
  private final LedgerRepository repository;
  private final PasswordService passwords;
  private final SessionService sessions;
  private final AppProperties properties;

  public GoogleOAuthSuccessHandler(
    LedgerRepository repository,
    PasswordService passwords,
    SessionService sessions,
    AppProperties properties
  ) {
    this.repository = repository;
    this.passwords = passwords;
    this.sessions = sessions;
    this.properties = properties;
  }

  @Override
  public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
    throws IOException {
    if (!(authentication.getPrincipal() instanceof OAuth2User googleUser)) {
      clearOAuthState(request);
      redirect(response, request, "/#/login?error=google_sign_in_failed");
      return;
    }

    Map<String, Object> attributes = googleUser.getAttributes();
    String subject = text(attributes.get("sub"));
    String email = text(attributes.get("email")).toLowerCase(Locale.ROOT);

    if (subject.isBlank() || email.isBlank() || !isVerified(attributes.get("email_verified"))) {
      clearOAuthState(request);
      redirect(response, request, "/#/login?error=google_email_not_verified");
      return;
    }

    AppUser user = findOrCreateUser(email, subject);

    if (user == null) {
      clearOAuthState(request);
      redirect(response, request, "/#/login?error=google_account_conflict");
      return;
    }

    sessions.create(user.id(), response);
    clearOAuthState(request);
    redirect(response, request, "/#/donate");
  }

  private AppUser findOrCreateUser(String email, String subject) {
    var subjectMatch = repository.findUserByGoogleSubject(subject);
    if (subjectMatch.isPresent()) {
      return subjectMatch.get().user();
    }

    var emailMatch = repository.findUserByEmail(email);
    if (emailMatch.isPresent()) {
      if (emailMatch.get().googleSubject() != null && !emailMatch.get().googleSubject().equals(subject)) {
        return null;
      }
      repository.linkGoogleSubject(emailMatch.get().user().id(), subject);
      return emailMatch.get().user();
    }

    return repository.createGoogleUser(email, availableUsername(email), passwords.hash(UUID.randomUUID().toString()), subject);
  }

  private String availableUsername(String email) {
    String localPart = email.substring(0, email.indexOf('@'))
      .toLowerCase(Locale.ROOT)
      .replaceAll("[^a-z0-9_]", "_")
      .replaceAll("_+", "_");
    String base = localPart.replaceAll("^_+|_+$", "");

    if (base.length() < 3) {
      base = "donor";
    }
    if (base.length() > 24) {
      base = base.substring(0, 24);
    }

    String candidate = base;
    int counter = 2;
    while (repository.usernameExists(candidate, null)) {
      String suffix = "_" + counter++;
      candidate = base.substring(0, Math.min(base.length(), 30 - suffix.length())) + suffix;
    }
    return candidate;
  }

  private boolean isVerified(Object value) {
    return Boolean.TRUE.equals(value) || "true".equalsIgnoreCase(text(value));
  }

  private String text(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }

  private void redirect(HttpServletResponse response, HttpServletRequest request, String path) throws IOException {
    String frontendUrl = properties.getFrontendUrl();
    String baseUrl = frontendUrl == null || frontendUrl.isBlank()
      ? request.getScheme() + "://" + request.getServerName() + (request.getServerPort() == 80 || request.getServerPort() == 443 ? "" : ":" + request.getServerPort())
      : frontendUrl.replaceAll("/$", "");
    response.sendRedirect(baseUrl + path);
  }

  private void clearOAuthState(HttpServletRequest request) {
    if (request.getSession(false) != null) {
      request.getSession(false).invalidate();
    }
    SecurityContextHolder.clearContext();
  }
}
