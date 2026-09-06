package com.donationledger.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class SessionAuthenticationFilter extends OncePerRequestFilter {
  private final SessionService sessionService;

  public SessionAuthenticationFilter(SessionService sessionService) {
    this.sessionService = sessionService;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
    throws ServletException, IOException {
    SecurityContextHolder.clearContext();
    String sessionId = sessionService.readCookie(request);
    sessionService.findCurrentUser(sessionId).ifPresent(user -> {
      var authentication = new UsernamePasswordAuthenticationToken(
        user,
        null,
        List.of(new SimpleGrantedAuthority("ROLE_" + user.role().toUpperCase()))
      );
      SecurityContextHolder.getContext().setAuthentication(authentication);
    });
    chain.doFilter(request, response);
  }
}
