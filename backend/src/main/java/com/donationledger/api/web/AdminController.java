package com.donationledger.api.web;

import com.donationledger.api.data.LedgerRepository;
import com.donationledger.api.model.AppUser;
import com.donationledger.api.service.LedgerService;
import com.donationledger.api.service.LedgerService.ApiException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
  private final LedgerRepository repository;
  private final LedgerService ledger;

  public AdminController(LedgerRepository repository, LedgerService ledger) {
    this.repository = repository;
    this.ledger = ledger;
  }

  @GetMapping("/overview")
  public Map<String, Object> overview() {
    return ledger.adminOverview();
  }

  @GetMapping("/review")
  public Map<String, Object> reviewQueue() {
    return Map.of("pendingDonations", repository.findPendingDonations(), "reviewedDonations", repository.findRecentlyReviewed());
  }

  @PostMapping("/donations/{id}/review")
  public Map<String, Object> reviewDonation(Authentication authentication, @PathVariable long id, @RequestBody ReviewRequest request) {
    String action = request.action() == null ? "" : request.action().trim().toLowerCase();
    if (!action.equals("approved") && !action.equals("rejected")) {
      throw new ApiException(400, "Review action must be approved or rejected.");
    }
    if (!repository.reviewDonation(id, user(authentication).id(), action, request.adminNote())) {
      throw new ApiException(400, "That donation has already been reviewed.");
    }
    return Map.of("reviewed", true, "status", action);
  }

  @PostMapping("/adjustments")
  public Map<String, Object> adjust(Authentication authentication, @RequestBody AdjustmentRequest request) {
    String direction = request.direction() == null ? "" : request.direction().trim().toLowerCase();
    String method = method(request.paymentMethod());
    BigDecimal amount = money(request.amount());
    String note = request.note() == null ? "" : request.note().trim();

    if (!direction.equals("add") && !direction.equals("remove")) {
      throw new ApiException(400, "Choose an adjustment direction.");
    }
    if (amount == null || amount.signum() <= 0 || note.isBlank()) {
      throw new ApiException(400, "Provide a positive amount and an explanatory note.");
    }
    if (!ledger.isPaymentMethod(method)) {
      throw new ApiException(400, "Choose a payment method for the adjustment.");
    }

    BigDecimal signedAmount = direction.equals("remove") ? amount.negate() : amount;
    if (signedAmount.signum() < 0 && repository.getMethodBalance(method).compareTo(amount) < 0) {
      throw new ApiException(400, "This method does not have enough recorded funds to remove that amount.");
    }
    repository.createAdjustment(user(authentication).id(), signedAmount, method, note);
    return Map.of("created", true);
  }

  @PostMapping("/transfers")
  public Map<String, Object> transfer(Authentication authentication, @RequestBody TransferRequest request) {
    String fromMethod = method(request.fromMethod());
    String toMethod = method(request.toMethod());
    BigDecimal amount = money(request.amount());
    String note = request.note() == null ? "" : request.note().trim();

    if (!ledger.isBalanceMethod(fromMethod) || !ledger.isBalanceMethod(toMethod) || fromMethod.equals(toMethod)) {
      throw new ApiException(400, "Choose two different supported payment methods.");
    }
    if (amount == null || amount.signum() <= 0 || note.isBlank()) {
      throw new ApiException(400, "Provide a positive transfer amount and a note.");
    }
    ledger.transfer(user(authentication), fromMethod, toMethod, amount, note);
    return Map.of("created", true);
  }

  private AppUser user(Authentication authentication) {
    if (authentication == null || !(authentication.getPrincipal() instanceof AppUser currentUser)) {
      throw new ApiException(401, "Sign in required.");
    }
    return currentUser;
  }

  private String method(String method) {
    return method == null ? "" : method.trim().toUpperCase();
  }

  private BigDecimal money(BigDecimal amount) {
    return amount == null ? null : amount.setScale(2, RoundingMode.HALF_UP);
  }

  public record ReviewRequest(String action, String adminNote) { }
  public record AdjustmentRequest(String direction, BigDecimal amount, String paymentMethod, String note) { }
  public record TransferRequest(String fromMethod, String toMethod, BigDecimal amount, String note) { }
}
