package com.donationledger.api.security;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
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
  SecurityFilterChain securityFilterChain(HttpSecurity http, SessionAuthenticationFilter sessionFilter) throws Exception {
    CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
    csrfRepository.setCookieCustomizer(builder -> builder.sameSite("Strict"));

    return http
      .csrf(csrf -> csrf.csrfTokenRepository(csrfRepository))
      .cors(AbstractHttpConfigurer::disable)
      .httpBasic(AbstractHttpConfigurer::disable)
      .formLogin(AbstractHttpConfigurer::disable)
      .logout(AbstractHttpConfigurer::disable)
      .authorizeHttpRequests(authorize -> authorize
        .requestMatchers(HttpMethod.GET, "/api/health", "/api/auth/csrf").permitAll()
        .requestMatchers("/api/auth/login", "/api/auth/register").permitAll()
        .requestMatchers("/api/admin/**").hasRole("ADMIN")
        .requestMatchers("/api/**").authenticated()
        .anyRequest().permitAll()
      )
      .exceptionHandling(exceptions -> exceptions
        .authenticationEntryPoint((request, response, exception) -> response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Sign in required."))
      )
      .addFilterBefore(sessionFilter, UsernamePasswordAuthenticationFilter.class)
      .build();
  }
}
