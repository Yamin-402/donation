const { query, withTransaction } = require("./db");

async function createUser({ username, passwordHash, role }) {
  const result = await query(
    `
      INSERT INTO users (username, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id, username, role, created_at
    `,
    [username, passwordHash, role]
  );

  return result.rows[0];
}

async function findUserByUsername(username) {
  const result = await query(
    `
      SELECT id, username, password_hash, role, created_at
      FROM users
      WHERE username = $1
    `,
    [username]
  );

  return result.rows[0] || null;
}

async function createDonation({ userId, amount, paymentReference, donorNote }) {
  const result = await query(
    `
      INSERT INTO donations (user_id, amount, payment_reference, donor_note)
      VALUES ($1, $2, $3, $4)
      RETURNING id, amount, payment_reference, donor_note, status, created_at
    `,
    [userId, amount, paymentReference || null, donorNote || null]
  );

  return result.rows[0];
}

async function getUserDashboardStats(userId) {
  const result = await query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved_total,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_total,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count
      FROM donations
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0];
}

async function getRecentUserDonations(userId, limit = 5) {
  const result = await query(
    `
      SELECT
        id,
        amount,
        payment_reference,
        donor_note,
        status,
        admin_note,
        created_at,
        reviewed_at
      FROM donations
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

async function getUserDonationHistory(userId) {
  const result = await query(
    `
      SELECT
        id,
        amount,
        payment_reference,
        donor_note,
        status,
        admin_note,
        created_at,
        reviewed_at
      FROM donations
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows;
}

async function getTransparencySummary() {
  const result = await query(
    `
      SELECT
        COALESCE((SELECT SUM(amount) FROM donations WHERE status = 'approved'), 0) AS approved_total,
        COALESCE((SELECT SUM(amount) FROM admin_adjustments WHERE amount > 0), 0) AS added_total,
        COALESCE((SELECT SUM(ABS(amount)) FROM admin_adjustments WHERE amount < 0), 0) AS removed_total,
        COALESCE((SELECT SUM(amount) FROM admin_adjustments), 0) AS adjustments_total,
        COALESCE((SELECT SUM(amount) FROM donations WHERE status = 'approved'), 0)
          + COALESCE((SELECT SUM(amount) FROM admin_adjustments), 0) AS public_total,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved_donation_count
      FROM donations
    `
  );

  return result.rows[0];
}

async function getAdjustments(limit) {
  const params = [];
  let limitClause = "";

  if (Number.isFinite(limit)) {
    params.push(limit);
    limitClause = "LIMIT $1";
  }

  const result = await query(
    `
      SELECT
        admin_adjustments.id,
        admin_adjustments.amount,
        admin_adjustments.note,
        admin_adjustments.created_at,
        users.username AS admin_username
      FROM admin_adjustments
      INNER JOIN users ON users.id = admin_adjustments.created_by
      ORDER BY admin_adjustments.created_at DESC
      ${limitClause}
    `,
    params
  );

  return result.rows;
}

async function getPendingDonations() {
  const result = await query(
    `
      SELECT
        donations.id,
        donations.amount,
        donations.payment_reference,
        donations.donor_note,
        donations.status,
        donations.created_at,
        users.username
      FROM donations
      INNER JOIN users ON users.id = donations.user_id
      WHERE donations.status = 'pending'
      ORDER BY donations.created_at ASC
    `
  );

  return result.rows;
}

async function getRecentReviewedDonations(limit = 20) {
  const result = await query(
    `
      SELECT
        donations.id,
        donations.amount,
        donations.payment_reference,
        donations.donor_note,
        donations.status,
        donations.admin_note,
        donations.created_at,
        donations.reviewed_at,
        donor.username AS donor_username,
        reviewer.username AS reviewer_username
      FROM donations
      INNER JOIN users AS donor ON donor.id = donations.user_id
      LEFT JOIN users AS reviewer ON reviewer.id = donations.reviewed_by
      WHERE donations.status IN ('approved', 'rejected')
      ORDER BY donations.reviewed_at DESC NULLS LAST, donations.created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

async function reviewDonation({ donationId, adminId, status, adminNote }) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        UPDATE donations
        SET
          status = $1,
          admin_note = $2,
          reviewed_by = $3,
          reviewed_at = NOW()
        WHERE id = $4
          AND status = 'pending'
        RETURNING id
      `,
      [status, adminNote || null, adminId, donationId]
    );

    return result.rows[0] || null;
  });
}

async function createAdjustment({ amount, note, adminId }) {
  const result = await query(
    `
      INSERT INTO admin_adjustments (amount, note, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, amount, note, created_at
    `,
    [amount, note, adminId]
  );

  return result.rows[0];
}

module.exports = {
  createAdjustment,
  createDonation,
  createUser,
  findUserByUsername,
  getAdjustments,
  getPendingDonations,
  getRecentReviewedDonations,
  getRecentUserDonations,
  getTransparencySummary,
  getUserDashboardStats,
  getUserDonationHistory,
  reviewDonation
};
