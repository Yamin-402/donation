package com.donationledger.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.InMemoryOAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

@Configuration
@Conditional(GoogleOAuthEnabledCondition.class)
public class GoogleOAuthConfiguration {
  @Bean
  ClientRegistrationRepository clientRegistrationRepository(AppProperties properties) {
    ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
      .clientId(properties.getGoogleClientId())
      .clientSecret(properties.getGoogleClientSecret())
      .scope("openid", "profile", "email")
      .build();
    return new InMemoryClientRegistrationRepository(google);
  }

  @Bean
  OAuth2AuthorizedClientService authorizedClientService(ClientRegistrationRepository registrations) {
    return new InMemoryOAuth2AuthorizedClientService(registrations);
  }
}
