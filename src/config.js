require("dotenv").config();

function parseBoolean(value) {
  return /^(1|true|yes)$/i.test(String(value || "").trim());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  appName: process.env.APP_NAME || "Donation Ledger",
  port: parseNumber(process.env.PORT, process.env.NODE_ENV === "production" ? 8080 : 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: parseBoolean(process.env.DATABASE_SSL),
  adminSignupCode: process.env.ADMIN_SIGNUP_CODE || "2664",
  currencyCode: process.env.CURRENCY_CODE || "USD",
  nodeEnv: process.env.NODE_ENV || "development",
  sessionCookieName: "donation_session",
  sessionTtlDays: 14
};

if (!config.databaseUrl) {
  throw new Error("Missing DATABASE_URL. Add it to your environment before starting the app.");
}

module.exports = {
  config
};
