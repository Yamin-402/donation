package com.donationledger.api.security;

import com.donationledger.api.config.AppProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
  @Bean
  SecurityFilterChain securityFilterChain(
    HttpSecurity http,
    SessionAuthenticationFilter sessionFilter,
    GoogleOAuthSuccessHandler googleSuccessHandler,
    GoogleOAuthFailureHandler googleFailureHandler,
    AppProperties properties
  ) throws Exception {
    CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfRepository.setCookieCustomizer(builder -> builder.sameSite("Strict"));

    http
      .csrf(csrf -> csrf.csrfTokenRepository(csrfRepository))
      .cors(AbstractHttpConfigurer::disable)
      .httpBasic(AbstractHttpConfigurer::disable)
      .formLogin(AbstractHttpConfigurer::disable)
      .logout(AbstractHttpConfigurer::disable)
      .authorizeHttpRequests(authorize -> authorize
        .requestMatchers(HttpMethod.GET, "/api/health", "/api/auth/csrf", "/api/auth/providers").permitAll()
        .requestMatchers("/api/auth/login", "/api/auth/register", "/oauth2/**", "/login/oauth2/**").permitAll()
        .requestMatchers("/api/admin/**").hasRole("ADMIN")
        .requestMatchers("/api/**").authenticated()
        .anyRequest().permitAll()
      )
      .exceptionHandling(exceptions -> exceptions
        .authenticationEntryPoint((request, response, exception) -> response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Sign in required."))
      )
      .addFilterBefore(sessionFilter, UsernamePasswordAuthenticationFilter.class);

    if (properties.hasGoogleOAuth()) {
      http.oauth2Login(oauth -> oauth
        .successHandler(googleSuccessHandler)
        .failureHandler(googleFailureHandler)
      );
    }

    return http.build();
  }
}
