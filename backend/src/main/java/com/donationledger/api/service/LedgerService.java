package com.donationledger.api.service;

import com.donationledger.api.data.LedgerRepository;
import com.donationledger.api.model.AppUser;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LedgerService {
  public static final List<String> PAYMENT_METHODS = List.of("VODAFONE_CASH", "INSTAPAY", "TELDA");
  private final LedgerRepository repository;

  public LedgerService(LedgerRepository repository) {
    this.repository = repository;
  }

  public boolean isPaymentMethod(String method) {
    return PAYMENT_METHODS.contains(method);
  }

  public boolean isBalanceMethod(String method) {
    return isPaymentMethod(method) || "UNASSIGNED".equals(method);
  }

  public Map<String, Object> dashboard(AppUser user) {
    Map<String, Object> dashboard = new LinkedHashMap<>(repository.getDashboard(user.id()));
    OffsetDateTime lastDonationAt = toOffsetDateTime(dashboard.get("lastDonationAt"));
    long daysSinceLastDonation = lastDonationAt == null
      ? 0
      : Math.max(0, ChronoUnit.DAYS.between(lastDonationAt.withOffsetSameInstant(ZoneOffset.UTC).toLocalDate(), LocalDate.now(ZoneOffset.UTC)));
    BigDecimal dailyTarget = user.dailyTarget() == null ? BigDecimal.ZERO : user.dailyTarget();

    dashboard.put("dailyTarget", dailyTarget);
    dashboard.put("daysSinceLastDonation", daysSinceLastDonation);
    dashboard.put("suggestedAmount", dailyTarget.multiply(BigDecimal.valueOf(daysSinceLastDonation)).setScale(2, RoundingMode.HALF_UP));
    dashboard.put("paymentProfiles", repository.findPaymentProfiles(user.id()));
    return dashboard;
  }

  private OffsetDateTime toOffsetDateTime(Object value) {
    if (value == null) return null;
    if (value instanceof OffsetDateTime timestamp) return timestamp;
    if (value instanceof Timestamp timestamp) return timestamp.toInstant().atOffset(ZoneOffset.UTC);
    if (value instanceof LocalDateTime timestamp) return timestamp.atOffset(ZoneOffset.UTC);
    if (value instanceof java.time.Instant timestamp) return timestamp.atOffset(ZoneOffset.UTC);
    throw new IllegalStateException("Unsupported donation timestamp type: " + value.getClass().getName());
  }

  @Transactional
  public long createDonation(AppUser user, BigDecimal amount, String paymentMethod, String paymentReference, String donorNote) {
    Long paymentProfileId = null;
    if (paymentReference != null && !paymentReference.isBlank()) {
      paymentProfileId = repository.savePaymentProfile(user.id(), paymentMethod, paymentReference.trim(), null, false);
    }
    return repository.createDonation(user.id(), amount, paymentMethod, paymentReference, donorNote, paymentProfileId);
  }

  @Transactional
  public long savePaymentProfile(AppUser user, String method, String identifier, String label, boolean makeDefault) {
    return repository.savePaymentProfile(user.id(), method, identifier.trim(), label, makeDefault);
  }

  @Transactional
  public void transfer(AppUser admin, String fromMethod, String toMethod, BigDecimal amount, String note) {
    BigDecimal available = repository.getMethodBalance(fromMethod);
    if (available.compareTo(amount) < 0) {
      throw new ApiException(400, "The source method does not have enough recorded funds.");
    }
    repository.createTransfer(admin.id(), fromMethod, toMethod, amount, note.trim());
  }

  public Map<String, Object> adminOverview() {
    Map<String, Object> overview = new LinkedHashMap<>();
    overview.put("summary", repository.getTransparencySummary());
    overview.put("methodBalances", repository.getMethodBalances());
    overview.put("transfers", repository.findTransfers());
    overview.put("adjustments", repository.findAdjustments());
    return overview;
  }

  public static class ApiException extends RuntimeException {
    private final int status;

    public ApiException(int status, String message) {
      super(message);
      this.status = status;
    }

    public int status() { return status; }
  }
}
