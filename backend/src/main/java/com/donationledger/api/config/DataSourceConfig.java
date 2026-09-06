package com.donationledger.api.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataSourceConfig {
  @Bean
  DataSource dataSource(AppProperties properties) {
    String databaseUrl = properties.getDatabaseUrl();

    if (databaseUrl == null || databaseUrl.isBlank()) {
      throw new IllegalStateException("DATABASE_URL is required.");
    }

    HikariDataSource dataSource = new HikariDataSource();

    if (databaseUrl.startsWith("jdbc:")) {
      dataSource.setJdbcUrl(databaseUrl);
    } else {
      URI uri = URI.create(databaseUrl.replaceFirst("^postgres://", "postgresql://"));
      String host = uri.getHost();
      int port = uri.getPort() == -1 ? 5432 : uri.getPort();
      String path = uri.getRawPath() == null ? "" : uri.getRawPath();
      String query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();

      if (host == null || path.isBlank() || "/".equals(path)) {
        throw new IllegalStateException("DATABASE_URL must include a host and database name.");
      }

      dataSource.setJdbcUrl("jdbc:postgresql://" + host + ":" + port + path + query);

      if (uri.getRawUserInfo() != null) {
        String[] credentials = uri.getRawUserInfo().split(":", 2);
        dataSource.setUsername(decode(credentials[0]));
        if (credentials.length == 2) {
          dataSource.setPassword(decode(credentials[1]));
        }
      }
    }

    if (properties.isDatabaseSsl()) {
      dataSource.addDataSourceProperty("sslmode", "require");
    }

    dataSource.setMaximumPoolSize(8);
    dataSource.setMinimumIdle(1);
    return dataSource;
  }

  private String decode(String value) {
    return URLDecoder.decode(value, StandardCharsets.UTF_8);
  }
}
