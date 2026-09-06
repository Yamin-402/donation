package com.donationledger.api.security;

import com.donationledger.api.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;

@Component
public class GoogleOAuthFailureHandler implements AuthenticationFailureHandler {
  private final AppProperties properties;

  public GoogleOAuthFailureHandler(AppProperties properties) {
    this.properties = properties;
  }

  @Override
  public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
    throws IOException {
    if (request.getSession(false) != null) {
      request.getSession(false).invalidate();
    }
    SecurityContextHolder.clearContext();
    String frontendUrl = properties.getFrontendUrl();
    String baseUrl = frontendUrl == null || frontendUrl.isBlank()
      ? request.getScheme() + "://" + request.getServerName() + (request.getServerPort() == 80 || request.getServerPort() == 443 ? "" : ":" + request.getServerPort())
      : frontendUrl.replaceAll("/$", "");
    response.sendRedirect(baseUrl + "/#/login?error=google_sign_in_failed");
  }
}
