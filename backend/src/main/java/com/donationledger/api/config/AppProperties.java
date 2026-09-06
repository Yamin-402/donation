package com.donationledger.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {
  private String currencyCode = "USD";
  private String adminSignupCode = "2664";
  private int sessionDays = 14;
  private boolean cookieSecure;
  private String databaseUrl;
  private boolean databaseSsl;
  private String googleClientId;
  private String googleClientSecret;
  private String frontendUrl;

  public String getCurrencyCode() { return currencyCode; }
  public void setCurrencyCode(String currencyCode) { this.currencyCode = currencyCode; }
  public String getAdminSignupCode() { return adminSignupCode; }
  public void setAdminSignupCode(String adminSignupCode) { this.adminSignupCode = adminSignupCode; }
  public int getSessionDays() { return sessionDays; }
  public void setSessionDays(int sessionDays) { this.sessionDays = sessionDays; }
  public boolean isCookieSecure() { return cookieSecure; }
  public void setCookieSecure(boolean cookieSecure) { this.cookieSecure = cookieSecure; }
  public String getDatabaseUrl() { return databaseUrl; }
  public void setDatabaseUrl(String databaseUrl) { this.databaseUrl = databaseUrl; }
  public boolean isDatabaseSsl() { return databaseSsl; }
  public void setDatabaseSsl(boolean databaseSsl) { this.databaseSsl = databaseSsl; }
  public String getGoogleClientId() { return googleClientId; }
  public void setGoogleClientId(String googleClientId) { this.googleClientId = googleClientId; }
  public String getGoogleClientSecret() { return googleClientSecret; }
  public void setGoogleClientSecret(String googleClientSecret) { this.googleClientSecret = googleClientSecret; }
  public String getFrontendUrl() { return frontendUrl; }
  public void setFrontendUrl(String frontendUrl) { this.frontendUrl = frontendUrl; }

  public boolean hasGoogleOAuth() {
    return hasText(googleClientId) && hasText(googleClientSecret);
  }

  private boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
