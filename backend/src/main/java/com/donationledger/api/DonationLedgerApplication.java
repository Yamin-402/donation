package com.donationledger.api;

import com.donationledger.api.config.AppProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class DonationLedgerApplication {
  public static void main(String[] args) {
    SpringApplication.run(DonationLedgerApplication.class, args);
  }
}
