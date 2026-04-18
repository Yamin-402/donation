const express = require("express");
const path = require("node:path");
const { config } = require("./config");
const { initDatabase } = require("./db");
const {
  createSession,
  destroySession,
  hashPassword,
  loadCurrentUser,
  requireAdmin,
  requireAuth,
  redirectIfAuthenticated,
  verifyPassword
} = require("./auth");
const store = require("./store");

const app = express();

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: config.currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

function formatDate(dateValue) {
  if (!dateValue) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateValue));
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

function normalizeMoney(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function redirectWithMessage(res, pathName, type, message) {
  const params = new URLSearchParams({ [type]: message });
  res.redirect(`${pathName}?${params.toString()}`);
}

function getMessage(req, type) {
  const value = req.query[type];
  return typeof value === "string" ? value : "";
}

function pageData(req, extra = {}) {
  return {
    appName: config.appName,
    currentUser: req.currentUser,
    currentPath: req.path,
    success: extra.success ?? getMessage(req, "success"),
    error: extra.error ?? getMessage(req, "error"),
    ...extra
  };
}

function apiSuccess(res, data = {}, status = 200) {
  res.status(status).json({ ok: true, data });
}

function apiError(res, status, error) {
  res.status(status).json({ ok: false, error });
}

function requireAuthApi(req, res, next) {
  if (!req.currentUser) {
    apiError(res, 401, "Please sign in first.");
    return;
  }

  next();
}

function requireAdminApi(req, res, next) {
  if (!req.currentUser) {
    apiError(res, 401, "Please sign in first.");
    return;
  }

  if (req.currentUser.role !== "admin") {
    apiError(res, 403, "Admin access required.");
    return;
  }

  next();
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "..", "public"), { index: false }));
app.use(loadCurrentUser);
app.use((req, res, next) => {
  res.locals.formatCurrency = formatCurrency;
  res.locals.formatDate = formatDate;
  next();
});

app.get("/api/health", (_req, res) => {
  apiSuccess(res, { status: "ok" });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.currentUser) {
    apiError(res, 401, "Not authenticated.");
    return;
  }

  apiSuccess(res, {
    user: req.currentUser,
    appName: config.appName,
    currencyCode: config.currencyCode
  });
});

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    if (req.currentUser) {
      apiSuccess(res, { user: req.currentUser });
      return;
    }

    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    const user = await store.findUserByUsername(username);

    if (!user || !verifyPassword(password, user.password_hash)) {
      apiError(res, 400, "Invalid username or password.");
      return;
    }

    await createSession(res, user.id);
    apiSuccess(res, {
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  })
);

app.post(
  "/api/auth/signup",
  asyncHandler(async (req, res) => {
    if (req.currentUser) {
      apiError(res, 400, "You are already signed in.");
      return;
    }

    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const adminCode = String(req.body.adminCode || "").trim();

    if (!isValidUsername(username)) {
      apiError(res, 400, "Username must be 3-30 characters using letters, numbers, or underscores.");
      return;
    }

    if (password.length < 8) {
      apiError(res, 400, "Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      apiError(res, 400, "Password confirmation does not match.");
      return;
    }

    if (adminCode && adminCode !== config.adminSignupCode) {
      apiError(res, 400, "Admin code is incorrect.");
      return;
    }

    const existingUser = await store.findUserByUsername(username);

    if (existingUser) {
      apiError(res, 400, "That username is already taken.");
      return;
    }

    const role = adminCode ? "admin" : "user";
    let user;

    try {
      user = await store.createUser({
        username,
        passwordHash: hashPassword(password),
        role
      });
    } catch (error) {
      if (error.code === "23505") {
        apiError(res, 400, "That username is already taken.");
        return;
      }

      throw error;
    }

    await createSession(res, user.id);
    apiSuccess(
      res,
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      },
      201
    );
  })
);

app.post(
  "/api/auth/logout",
  asyncHandler(async (req, res) => {
    await destroySession(req, res);
    apiSuccess(res, { signedOut: true });
  })
);

app.get(
  "/api/dashboard",
  requireAuthApi,
  asyncHandler(async (req, res) => {
    const [stats, recentDonations] = await Promise.all([
      store.getUserDashboardStats(req.currentUser.id),
      store.getRecentUserDonations(req.currentUser.id, 8)
    ]);

    apiSuccess(res, { stats, recentDonations });
  })
);

app.post(
  "/api/donations",
  requireAuthApi,
  asyncHandler(async (req, res) => {
    const amount = normalizeMoney(req.body.amount);
    const paymentReference = String(req.body.paymentReference || "").trim();
    const donorNote = String(req.body.donorNote || "").trim();

    if (!amount || amount <= 0) {
      apiError(res, 400, "Enter a valid donation amount greater than zero.");
      return;
    }

    if (paymentReference.length > 120) {
      apiError(res, 400, "Sender number or bank username must stay under 120 characters.");
      return;
    }

    await store.createDonation({
      userId: req.currentUser.id,
      amount,
      paymentReference,
      donorNote
    });

    apiSuccess(res, { created: true }, 201);
  })
);

app.get(
  "/api/history",
  requireAuthApi,
  asyncHandler(async (req, res) => {
    const donations = await store.getUserDonationHistory(req.currentUser.id);
    apiSuccess(res, { donations });
  })
);

app.get(
  "/api/transparency",
  requireAuthApi,
  asyncHandler(async (req, res) => {
    const [summary, adjustments] = await Promise.all([
      store.getTransparencySummary(),
      store.getAdjustments()
    ]);

    apiSuccess(res, { summary, adjustments });
  })
);

app.get(
  "/api/admin/review",
  requireAdminApi,
  asyncHandler(async (req, res) => {
    const [pendingDonations, reviewedDonations] = await Promise.all([
      store.getPendingDonations(),
      store.getRecentReviewedDonations(20)
    ]);

    apiSuccess(res, { pendingDonations, reviewedDonations });
  })
);

app.post(
  "/api/admin/donations/:id/review",
  requireAdminApi,
  asyncHandler(async (req, res) => {
    const donationId = Number(req.params.id);
    const action = String(req.body.action || "").trim();
    const adminNote = String(req.body.adminNote || "").trim();

    if (!Number.isInteger(donationId) || donationId <= 0) {
      apiError(res, 400, "Invalid donation id.");
      return;
    }

    if (!["approved", "rejected"].includes(action)) {
      apiError(res, 400, "Invalid review action.");
      return;
    }

    const reviewed = await store.reviewDonation({
      donationId,
      adminId: req.currentUser.id,
      status: action,
      adminNote
    });

    if (!reviewed) {
      apiError(res, 400, "Donation was already reviewed or does not exist.");
      return;
    }

    apiSuccess(res, { reviewed: true, status: action });
  })
);

app.get(
  "/api/admin/adjustments",
  requireAdminApi,
  asyncHandler(async (req, res) => {
    const [summary, adjustments] = await Promise.all([
      store.getTransparencySummary(),
      store.getAdjustments()
    ]);

    apiSuccess(res, { summary, adjustments });
  })
);

app.post(
  "/api/admin/adjustments",
  requireAdminApi,
  asyncHandler(async (req, res) => {
    const direction = String(req.body.direction || "remove");
    const rawAmount = normalizeMoney(req.body.amount);
    const note = String(req.body.note || "").trim();

    if (!["add", "remove"].includes(direction)) {
      apiError(res, 400, "Choose whether this is an addition or a removal.");
      return;
    }

    if (!rawAmount || rawAmount <= 0) {
      apiError(res, 400, "Enter a valid amount greater than zero.");
      return;
    }

    if (!note) {
      apiError(res, 400, "Admin note is required for transparency.");
      return;
    }

    const signedAmount = direction === "remove" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

    await store.createAdjustment({
      amount: signedAmount,
      note,
      adminId: req.currentUser.id
    });

    apiSuccess(res, { created: true }, 201);
  })
);

app.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.currentUser) {
      res.redirect("/dashboard");
      return;
    }

    res.render("index", pageData(req, { pageTitle: "Donation Transparency" }));
  })
);

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/login", redirectIfAuthenticated, (req, res) => {
  res.render(
    "login",
    pageData(req, {
      pageTitle: "Login",
      formData: {
        username: ""
      }
    })
  );
});

app.post(
  "/login",
  redirectIfAuthenticated,
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    const user = await store.findUserByUsername(username);

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(400).render(
        "login",
        pageData(req, {
          pageTitle: "Login",
          error: "Invalid username or password.",
          formData: { username }
        })
      );
      return;
    }

    await createSession(res, user.id);
    redirectWithMessage(res, "/dashboard", "success", "Signed in successfully.");
  })
);

app.get("/signup", redirectIfAuthenticated, (req, res) => {
  res.render(
    "signup",
    pageData(req, {
      pageTitle: "Create account",
      formData: {
        username: "",
        adminCode: ""
      }
    })
  );
});

app.post(
  "/signup",
  redirectIfAuthenticated,
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const adminCode = String(req.body.adminCode || "").trim();

    if (!isValidUsername(username)) {
      res.status(400).render(
        "signup",
        pageData(req, {
          pageTitle: "Create account",
          error: "Username must be 3-30 characters using letters, numbers, or underscores.",
          formData: { username, adminCode }
        })
      );
      return;
    }

    if (password.length < 8) {
      res.status(400).render(
        "signup",
        pageData(req, {
          pageTitle: "Create account",
          error: "Password must be at least 8 characters.",
          formData: { username, adminCode }
        })
      );
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).render(
        "signup",
        pageData(req, {
          pageTitle: "Create account",
          error: "Password confirmation does not match.",
          formData: { username, adminCode }
        })
      );
      return;
    }

    if (adminCode && adminCode !== config.adminSignupCode) {
      res.status(400).render(
        "signup",
        pageData(req, {
          pageTitle: "Create account",
          error: "Admin code is incorrect.",
          formData: { username, adminCode }
        })
      );
      return;
    }

    const existingUser = await store.findUserByUsername(username);

    if (existingUser) {
      res.status(400).render(
        "signup",
        pageData(req, {
          pageTitle: "Create account",
          error: "That username is already taken.",
          formData: { username, adminCode }
        })
      );
      return;
    }

    const role = adminCode ? "admin" : "user";
    let user;

    try {
      user = await store.createUser({
        username,
        passwordHash: hashPassword(password),
        role
      });
    } catch (error) {
      if (error.code === "23505") {
        res.status(400).render(
          "signup",
          pageData(req, {
            pageTitle: "Create account",
            error: "That username is already taken.",
            formData: { username, adminCode }
          })
        );
        return;
      }

      throw error;
    }

    await createSession(res, user.id);
    redirectWithMessage(res, "/dashboard", "success", "Account created successfully.");
  })
);

app.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await destroySession(req, res);
    redirectWithMessage(res, "/login", "success", "Signed out.");
  })
);

app.get(
  "/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [stats, recentDonations] = await Promise.all([
      store.getUserDashboardStats(req.currentUser.id),
      store.getRecentUserDonations(req.currentUser.id, 6)
    ]);

    res.render(
      "dashboard",
      pageData(req, {
        pageTitle: "Submit donation",
        stats,
        recentDonations,
        formData: {
          amount: "",
          paymentReference: "",
          donorNote: ""
        }
      })
    );
  })
);

app.post(
  "/donations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const amount = normalizeMoney(req.body.amount);
    const paymentReference = String(req.body.paymentReference || "").trim();
    const donorNote = String(req.body.donorNote || "").trim();

    if (!amount || amount <= 0) {
      const [stats, recentDonations] = await Promise.all([
        store.getUserDashboardStats(req.currentUser.id),
        store.getRecentUserDonations(req.currentUser.id, 6)
      ]);

      res.status(400).render(
        "dashboard",
        pageData(req, {
          pageTitle: "Submit donation",
          error: "Enter a valid donation amount greater than zero.",
          stats,
          recentDonations,
          formData: {
            amount: req.body.amount,
            paymentReference,
            donorNote
          }
        })
      );
      return;
    }

    if (paymentReference.length > 120) {
      const [stats, recentDonations] = await Promise.all([
        store.getUserDashboardStats(req.currentUser.id),
        store.getRecentUserDonations(req.currentUser.id, 6)
      ]);

      res.status(400).render(
        "dashboard",
        pageData(req, {
          pageTitle: "Submit donation",
          error: "Sender number or bank username must stay under 120 characters.",
          stats,
          recentDonations,
          formData: {
            amount: req.body.amount,
            paymentReference,
            donorNote
          }
        })
      );
      return;
    }

    await store.createDonation({
      userId: req.currentUser.id,
      amount,
      paymentReference,
      donorNote
    });

    redirectWithMessage(res, "/dashboard", "success", "Donation submitted for admin validation.");
  })
);

app.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const donations = await store.getUserDonationHistory(req.currentUser.id);

    res.render(
      "history",
      pageData(req, {
        pageTitle: "Donation history",
        donations
      })
    );
  })
);

app.get(
  "/transparency",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [summary, adjustments] = await Promise.all([
      store.getTransparencySummary(),
      store.getAdjustments()
    ]);

    res.render(
      "transparency",
      pageData(req, {
        pageTitle: "Total",
        summary,
        adjustments,
        formatCurrency,
        formatDate
      })
    );
  })
);

app.get(
  "/admin/review",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [pendingDonations, reviewedDonations] = await Promise.all([
      store.getPendingDonations(),
      store.getRecentReviewedDonations(20)
    ]);

    res.render(
      "admin-review",
      pageData(req, {
        pageTitle: "Validate donations",
        pendingDonations,
        reviewedDonations
      })
    );
  })
);

app.post(
  "/admin/donations/:id/review",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const donationId = Number(req.params.id);
    const action = String(req.body.action || "").trim();
    const adminNote = String(req.body.adminNote || "").trim();

    if (!Number.isInteger(donationId) || donationId <= 0) {
      redirectWithMessage(res, "/admin/review", "error", "Invalid donation id.");
      return;
    }

    if (!["approved", "rejected"].includes(action)) {
      redirectWithMessage(res, "/admin/review", "error", "Invalid review action.");
      return;
    }

    const reviewed = await store.reviewDonation({
      donationId,
      adminId: req.currentUser.id,
      status: action,
      adminNote
    });

    if (!reviewed) {
      redirectWithMessage(res, "/admin/review", "error", "Donation was already reviewed or does not exist.");
      return;
    }

    redirectWithMessage(res, "/admin/review", "success", `Donation ${action}.`);
  })
);

app.get(
  "/admin/adjustments",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [summary, adjustments] = await Promise.all([
      store.getTransparencySummary(),
      store.getAdjustments()
    ]);

    res.render(
      "admin-adjustments",
      pageData(req, {
        pageTitle: "Admin log",
        summary,
        adjustments,
        formData: {
          direction: "remove",
          amount: "",
          note: ""
        }
      })
    );
  })
);

app.post(
  "/admin/adjustments",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const direction = String(req.body.direction || "remove");
    const rawAmount = normalizeMoney(req.body.amount);
    const note = String(req.body.note || "").trim();

    if (!["add", "remove"].includes(direction)) {
      const [summary, adjustments] = await Promise.all([
        store.getTransparencySummary(),
        store.getAdjustments()
      ]);

      res.status(400).render(
        "admin-adjustments",
        pageData(req, {
          pageTitle: "Admin log",
          error: "Choose whether this is an addition or a removal.",
          summary,
          adjustments,
          formData: {
            direction,
            amount: req.body.amount,
            note
          }
        })
      );
      return;
    }

    if (!rawAmount || rawAmount <= 0) {
      const [summary, adjustments] = await Promise.all([
        store.getTransparencySummary(),
        store.getAdjustments()
      ]);

      res.status(400).render(
        "admin-adjustments",
        pageData(req, {
          pageTitle: "Admin log",
          error: "Enter a valid amount greater than zero.",
          summary,
          adjustments,
          formData: {
            direction,
            amount: req.body.amount,
            note
          }
        })
      );
      return;
    }

    if (!note) {
      const [summary, adjustments] = await Promise.all([
        store.getTransparencySummary(),
        store.getAdjustments()
      ]);

      res.status(400).render(
        "admin-adjustments",
        pageData(req, {
          pageTitle: "Admin log",
          error: "Admin note is required for transparency.",
          summary,
          adjustments,
          formData: {
            direction,
            amount: req.body.amount,
            note
          }
        })
      );
      return;
    }

    const signedAmount = direction === "remove" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

    await store.createAdjustment({
      amount: signedAmount,
      note,
      adminId: req.currentUser.id
    });

    redirectWithMessage(res, "/admin/adjustments", "success", "Public total updated.");
  })
);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    apiError(res, 404, "API route not found.");
    return;
  }

  res.status(404).render(
    "landing",
    pageData(req, {
      pageTitle: "Page not found",
      error: "That page does not exist."
    })
  );
});

app.use((error, req, res, _next) => {
  console.error(error);

  if (req.path.startsWith("/api/")) {
    apiError(res, 500, "Server error.");
    return;
  }

  res.status(500).render(
    "landing",
    pageData(req, {
      pageTitle: "Server error",
      error: "Something went wrong on the server."
    })
  );
});

async function start() {
  await initDatabase();
  const host = process.env.HOST || "0.0.0.0";
  app.listen(config.port, host, () => {
    console.log(`${config.appName} is running on ${host}:${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});


