package com.donationledger.api.config;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class SchemaMigration {
  private final JdbcTemplate jdbc;

  public SchemaMigration(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void addPaymentProfileReference() {
    Integer count = jdbc.queryForObject(
      "SELECT COUNT(*) FROM pg_constraint WHERE conname = 'donations_payment_profile_fk'",
      Integer.class
    );

    if (count != null && count == 0) {
      jdbc.execute(
        """
          ALTER TABLE donations
          ADD CONSTRAINT donations_payment_profile_fk
          FOREIGN KEY (payment_profile_id) REFERENCES payment_profiles(id) ON DELETE SET NULL
        """
      );
    }
  }
}
