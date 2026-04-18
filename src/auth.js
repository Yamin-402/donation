const crypto = require("node:crypto");
const { config } = require("./config");
const { query } = require("./db");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, key] = String(storedHash || "").split(":");

  if (algorithm !== "scrypt" || !salt || !key) {
    return false;
  }

  const derivedKey = crypto.scryptSync(password, salt, 64);
  const storedKey = Buffer.from(key, "hex");

  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedKey, derivedKey);
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(part.slice(0, separatorIndex));
      const value = decodeURIComponent(part.slice(separatorIndex + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");

  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  const values = Array.isArray(existing) ? existing : [existing];
  values.push(cookieValue);
  res.setHeader("Set-Cookie", values);
}

function createCookieHeader(name, value, maxAgeSeconds) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (config.nodeEnv === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

async function createSession(res, userId) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  await query(
    `
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES ($1, $2, $3)
    `,
    [sessionId, userId, expiresAt]
  );

  appendSetCookie(
    res,
    createCookieHeader(
      config.sessionCookieName,
      sessionId,
      config.sessionTtlDays * 24 * 60 * 60
    )
  );
}

async function destroySession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[config.sessionCookieName];

  if (sessionId) {
    await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
  }

  appendSetCookie(res, createCookieHeader(config.sessionCookieName, "", 0));
}

async function loadCurrentUser(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[config.sessionCookieName];

    req.currentUser = null;

    if (!sessionId) {
      next();
      return;
    }

    const result = await query(
      `
        SELECT users.id, users.username, users.role
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = $1
          AND sessions.expires_at > NOW()
      `,
      [sessionId]
    );

    if (!result.rows.length) {
      await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
      appendSetCookie(res, createCookieHeader(config.sessionCookieName, "", 0));
      next();
      return;
    }

    req.currentUser = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    res.redirect("/login?error=Please+sign+in+first");
    return;
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.currentUser) {
    res.redirect("/login?error=Please+sign+in+first");
    return;
  }

  if (req.currentUser.role !== "admin") {
    res.redirect("/dashboard?error=Admin+access+required");
    return;
  }

  next();
}

function redirectIfAuthenticated(req, res, next) {
  if (req.currentUser) {
    res.redirect("/dashboard");
    return;
  }

  next();
}

module.exports = {
  createSession,
  destroySession,
  hashPassword,
  loadCurrentUser,
  requireAdmin,
  requireAuth,
  redirectIfAuthenticated,
  verifyPassword
};
