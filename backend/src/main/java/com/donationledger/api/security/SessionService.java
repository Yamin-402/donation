package com.donationledger.api.security;

import com.donationledger.api.config.AppProperties;
import com.donationledger.api.model.AppUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.http.ResponseCookie;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SessionService {
  public static final String COOKIE_NAME = "donation_session";
  private final JdbcTemplate jdbcTemplate;
  private final AppProperties properties;
  private final SecureRandom random = new SecureRandom();

  public SessionService(JdbcTemplate jdbcTemplate, AppProperties properties) {
    this.jdbcTemplate = jdbcTemplate;
    this.properties = properties;
  }

  public void create(long userId, HttpServletResponse response) {
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String sessionId = HexFormat.of().formatHex(bytes);
    OffsetDateTime expiresAt = OffsetDateTime.now().plusDays(properties.getSessionDays());

    jdbcTemplate.update("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", sessionId, userId, expiresAt);
    writeCookie(response, sessionId, properties.getSessionDays() * 24 * 60 * 60);
  }

  public void destroy(HttpServletRequest request, HttpServletResponse response) {
    String sessionId = readCookie(request);
    if (sessionId != null) {
      jdbcTemplate.update("DELETE FROM sessions WHERE id = ?", sessionId);
    }
    writeCookie(response, "", 0);
  }

  public Optional<AppUser> findCurrentUser(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return Optional.empty();
    }

    return jdbcTemplate.query(
      """
        SELECT users.id, users.username, users.email, users.role, users.daily_target
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ? AND sessions.expires_at > NOW()
      """,
      (resultSet, rowNumber) -> new AppUser(
        resultSet.getLong("id"),
        resultSet.getString("username"),
        resultSet.getString("email"),
        resultSet.getString("role"),
        resultSet.getBigDecimal("daily_target")
      ),
      sessionId
    ).stream().findFirst();
  }

  public String readCookie(HttpServletRequest request) {
    if (request.getCookies() == null) {
      return null;
    }

    for (var cookie : request.getCookies()) {
      if (COOKIE_NAME.equals(cookie.getName())) {
        return cookie.getValue();
      }
    }
    return null;
  }

  private void writeCookie(HttpServletResponse response, String value, int maxAge) {
    ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, value)
      .path("/")
      .httpOnly(true)
      .secure(properties.isCookieSecure())
      .sameSite("Strict")
      .maxAge(maxAge)
      .build();
    response.addHeader("Set-Cookie", cookie.toString());
  }
}
