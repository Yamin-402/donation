package com.donationledger.api.data;

import com.donationledger.api.model.AppUser;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class LedgerRepository {
  private final JdbcTemplate jdbc;

  public LedgerRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<LoginUser> findUserForLogin(String identifier) {
    return jdbc.query(
      """
        SELECT id, username, email, password_hash, role, daily_target
        FROM users
        WHERE LOWER(email) = LOWER(?)
          OR (email IS NULL AND LOWER(username) = LOWER(?))
      """,
      (resultSet, rowNumber) -> new LoginUser(
        resultSet.getLong("id"), resultSet.getString("username"), resultSet.getString("email"),
        resultSet.getString("password_hash"), resultSet.getString("role"), resultSet.getBigDecimal("daily_target")
      ),
      identifier, identifier
    ).stream().findFirst();
  }

  public Optional<AppUser> findUser(long userId) {
    return jdbc.query(
      "SELECT id, username, email, role, daily_target FROM users WHERE id = ?",
      (resultSet, rowNumber) -> appUser(resultSet.getLong("id"), resultSet.getString("username"), resultSet.getString("email"), resultSet.getString("role"), resultSet.getBigDecimal("daily_target")),
      userId
    ).stream().findFirst();
  }

  public Optional<OAuthUser> findUserByGoogleSubject(String googleSubject) {
    return jdbc.query(
      "SELECT id, username, email, role, daily_target, google_subject FROM users WHERE google_subject = ?",
      (resultSet, rowNumber) -> oauthUser(resultSet),
      googleSubject
    ).stream().findFirst();
  }

  public Optional<OAuthUser> findUserByEmail(String email) {
    return jdbc.query(
      "SELECT id, username, email, role, daily_target, google_subject FROM users WHERE LOWER(email) = LOWER(?)",
      (resultSet, rowNumber) -> oauthUser(resultSet),
      email
    ).stream().findFirst();
  }

  public boolean emailExists(String email, Long excludingUserId) {
    String sql = excludingUserId == null
      ? "SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER(?)"
      : "SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?";
    Integer count = excludingUserId == null
      ? jdbc.queryForObject(sql, Integer.class, email)
      : jdbc.queryForObject(sql, Integer.class, email, excludingUserId);
    return count != null && count > 0;
  }

  public boolean usernameExists(String username, Long excludingUserId) {
    String sql = excludingUserId == null
      ? "SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)"
      : "SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?) AND id <> ?";
    Integer count = excludingUserId == null
      ? jdbc.queryForObject(sql, Integer.class, username)
      : jdbc.queryForObject(sql, Integer.class, username, excludingUserId);
    return count != null && count > 0;
  }

  public AppUser createUser(String email, String username, String passwordHash, String role) {
    return jdbc.queryForObject(
      """
        INSERT INTO users (email, username, password_hash, role)
        VALUES (?, ?, ?, ?)
        RETURNING id, username, email, role, daily_target
      """,
      (resultSet, rowNumber) -> appUser(resultSet.getLong("id"), resultSet.getString("username"), resultSet.getString("email"), resultSet.getString("role"), resultSet.getBigDecimal("daily_target")),
      email, username, passwordHash, role
    );
  }

  public AppUser createGoogleUser(String email, String username, String passwordHash, String googleSubject) {
    return jdbc.queryForObject(
      """
        INSERT INTO users (email, username, password_hash, role, google_subject)
        VALUES (?, ?, ?, 'user', ?)
        RETURNING id, username, email, role, daily_target
      """,
      (resultSet, rowNumber) -> appUser(resultSet.getLong("id"), resultSet.getString("username"), resultSet.getString("email"), resultSet.getString("role"), resultSet.getBigDecimal("daily_target")),
      email, username, passwordHash, googleSubject
    );
  }

  public void linkGoogleSubject(long userId, String googleSubject) {
    jdbc.update("UPDATE users SET google_subject = ? WHERE id = ? AND google_subject IS NULL", googleSubject, userId);
  }

  public void updatePassword(long userId, String passwordHash) {
    jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, userId);
  }

  public AppUser updateProfile(long userId, String email, String username, BigDecimal dailyTarget) {
    return jdbc.queryForObject(
      """
        UPDATE users
        SET email = ?, username = ?, daily_target = ?
        WHERE id = ?
        RETURNING id, username, email, role, daily_target
      """,
      (resultSet, rowNumber) -> appUser(resultSet.getLong("id"), resultSet.getString("username"), resultSet.getString("email"), resultSet.getString("role"), resultSet.getBigDecimal("daily_target")),
      email, username, dailyTarget, userId
    );
  }

  public List<Map<String, Object>> findPaymentProfiles(long userId) {
    return jdbc.queryForList(
      """
        SELECT id, payment_method AS "paymentMethod", account_identifier AS "accountIdentifier",
          label, is_default AS "isDefault", created_at AS "createdAt"
        FROM payment_profiles
        WHERE user_id = ?
        ORDER BY is_default DESC, created_at DESC
      """,
      userId
    );
  }

  public long savePaymentProfile(long userId, String paymentMethod, String accountIdentifier, String label, boolean makeDefault) {
    if (makeDefault) {
      jdbc.update("UPDATE payment_profiles SET is_default = FALSE WHERE user_id = ? AND payment_method = ?", userId, paymentMethod);
    }

    Long id = jdbc.queryForObject(
      """
        INSERT INTO payment_profiles (user_id, payment_method, account_identifier, label, is_default)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (user_id, payment_method, account_identifier)
        DO UPDATE SET label = COALESCE(EXCLUDED.label, payment_profiles.label),
          is_default = CASE WHEN EXCLUDED.is_default THEN TRUE ELSE payment_profiles.is_default END
        RETURNING id
      """,
      Long.class,
      userId, paymentMethod, accountIdentifier, blankToNull(label), makeDefault
    );
    return id == null ? 0 : id;
  }

  public void deletePaymentProfile(long userId, long profileId) {
    jdbc.update("DELETE FROM payment_profiles WHERE id = ? AND user_id = ?", profileId, userId);
  }

  public Map<String, Object> getDashboard(long userId) {
    Map<String, Object> stats = jdbc.queryForMap(
      """
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) AS "approvedTotal",
          COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS "pendingTotal",
          COUNT(*) FILTER (WHERE status = 'approved') AS "approvedCount",
          COUNT(*) FILTER (WHERE status = 'pending') AS "pendingCount",
          MAX(created_at) AS "lastDonationAt"
        FROM donations WHERE user_id = ?
      """,
      userId
    );
    List<Map<String, Object>> recent = findHistory(userId, 5);
    stats.put("recentDonations", recent);
    return stats;
  }

  public List<Map<String, Object>> findHistory(long userId, int limit) {
    return jdbc.queryForList(
      """
        SELECT id, amount, payment_method AS "paymentMethod", payment_reference AS "paymentReference",
          donor_note AS "donorNote", status, admin_note AS "adminNote", created_at AS "createdAt",
          reviewed_at AS "reviewedAt"
        FROM donations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
      """,
      userId, limit
    );
  }

  public long createDonation(long userId, BigDecimal amount, String method, String paymentReference, String donorNote, Long paymentProfileId) {
    Long id = jdbc.queryForObject(
      """
        INSERT INTO donations (user_id, amount, payment_method, payment_reference, donor_note, payment_profile_id)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
      """,
      Long.class,
      userId, amount, method, blankToNull(paymentReference), blankToNull(donorNote), paymentProfileId
    );
    return id == null ? 0 : id;
  }

  public Map<String, Object> getTransparencySummary() {
    return jdbc.queryForMap(
      """
        SELECT
          COALESCE((SELECT SUM(amount) FROM donations WHERE status = 'approved'), 0) AS "approvedTotal",
          COALESCE((SELECT SUM(amount) FROM admin_adjustments WHERE amount > 0), 0) AS "addedTotal",
          COALESCE((SELECT SUM(ABS(amount)) FROM admin_adjustments WHERE amount < 0), 0) AS "removedTotal",
          COALESCE((SELECT SUM(amount) FROM donations WHERE status = 'approved'), 0)
            + COALESCE((SELECT SUM(amount) FROM admin_adjustments), 0) AS "publicTotal"
      """
    );
  }

  public List<Map<String, Object>> findAdjustments() {
    return jdbc.queryForList(
      """
        SELECT admin_adjustments.id, admin_adjustments.amount, admin_adjustments.note,
          admin_adjustments.created_at AS "createdAt", users.username AS "adminUsername"
        FROM admin_adjustments JOIN users ON users.id = admin_adjustments.created_by
        ORDER BY admin_adjustments.created_at DESC
      """
    );
  }

  public List<Map<String, Object>> findPendingDonations() {
    return jdbc.queryForList(
      """
        SELECT donations.id, donations.amount, donations.payment_method AS "paymentMethod",
          donations.payment_reference AS "paymentReference", donations.donor_note AS "donorNote",
          donations.created_at AS "createdAt", users.username, users.email
        FROM donations JOIN users ON users.id = donations.user_id
        WHERE donations.status = 'pending' ORDER BY donations.created_at ASC
      """
    );
  }

  public List<Map<String, Object>> findRecentlyReviewed() {
    return jdbc.queryForList(
      """
        SELECT donations.id, donations.amount, donations.payment_method AS "paymentMethod", donations.status,
          donations.admin_note AS "adminNote", donations.created_at AS "createdAt",
          donations.reviewed_at AS "reviewedAt", donor.username AS "donorUsername",
          reviewer.username AS "reviewerUsername"
        FROM donations
        JOIN users donor ON donor.id = donations.user_id
        LEFT JOIN users reviewer ON reviewer.id = donations.reviewed_by
        WHERE donations.status IN ('approved', 'rejected')
        ORDER BY donations.reviewed_at DESC NULLS LAST LIMIT 30
      """
    );
  }

  public boolean reviewDonation(long donationId, long adminId, String status, String note) {
    return jdbc.update(
      """
        UPDATE donations SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ? AND status = 'pending'
      """,
      status, blankToNull(note), adminId, donationId
    ) == 1;
  }

  public void createAdjustment(long adminId, BigDecimal signedAmount, String method, String note) {
    jdbc.update(
      "INSERT INTO admin_adjustments (amount, payment_method, note, created_by) VALUES (?, ?, ?, ?)",
      signedAmount, method, note, adminId
    );
  }

  public List<Map<String, Object>> getMethodBalances() {
    return jdbc.queryForList(
      """
        WITH movements AS (
          SELECT payment_method AS method, amount AS amount FROM donations WHERE status = 'approved'
          UNION ALL
          SELECT payment_method AS method, amount AS amount FROM admin_adjustments
          UNION ALL
          SELECT from_method AS method, -amount AS amount FROM payment_method_transfers
          UNION ALL
          SELECT to_method AS method, amount AS amount FROM payment_method_transfers
        )
        SELECT method AS "paymentMethod", COALESCE(SUM(amount), 0) AS amount
        FROM movements GROUP BY method ORDER BY method
      """
    );
  }

  public BigDecimal getMethodBalance(String method) {
    BigDecimal amount = jdbc.queryForObject(
      """
        SELECT COALESCE(SUM(amount), 0) FROM (
          SELECT amount FROM donations WHERE status = 'approved' AND payment_method = ?
          UNION ALL SELECT amount FROM admin_adjustments WHERE payment_method = ?
          UNION ALL SELECT -amount FROM payment_method_transfers WHERE from_method = ?
          UNION ALL SELECT amount FROM payment_method_transfers WHERE to_method = ?
        ) AS movements
      """,
      BigDecimal.class, method, method, method, method
    );
    return amount == null ? BigDecimal.ZERO : amount;
  }

  public void createTransfer(long adminId, String fromMethod, String toMethod, BigDecimal amount, String note) {
    jdbc.update(
      """
        INSERT INTO payment_method_transfers (from_method, to_method, amount, note, created_by)
        VALUES (?, ?, ?, ?, ?)
      """,
      fromMethod, toMethod, amount, note, adminId
    );
  }

  public List<Map<String, Object>> findTransfers() {
    return jdbc.queryForList(
      """
        SELECT payment_method_transfers.id, from_method AS "fromMethod", to_method AS "toMethod",
          amount, note, payment_method_transfers.created_at AS "createdAt", users.username AS "adminUsername"
        FROM payment_method_transfers JOIN users ON users.id = payment_method_transfers.created_by
        ORDER BY payment_method_transfers.created_at DESC LIMIT 30
      """
    );
  }

  private AppUser appUser(long id, String username, String email, String role, BigDecimal dailyTarget) {
    return new AppUser(id, username, email, role, dailyTarget == null ? BigDecimal.ZERO : dailyTarget);
  }

  private OAuthUser oauthUser(java.sql.ResultSet resultSet) throws java.sql.SQLException {
    return new OAuthUser(
      appUser(resultSet.getLong("id"), resultSet.getString("username"), resultSet.getString("email"), resultSet.getString("role"), resultSet.getBigDecimal("daily_target")),
      resultSet.getString("google_subject")
    );
  }

  private String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  public record LoginUser(long id, String username, String email, String passwordHash, String role, BigDecimal dailyTarget) {
    public AppUser asAppUser() {
      return new AppUser(id, username, email, role, dailyTarget == null ? BigDecimal.ZERO : dailyTarget);
    }
  }

  public record OAuthUser(AppUser user, String googleSubject) { }
}
