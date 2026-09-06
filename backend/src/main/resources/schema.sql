CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_reference VARCHAR(120),
  donor_note TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_adjustments (
  id SERIAL PRIMARY KEY,
  amount NUMERIC(12, 2) NOT NULL,
  note TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_target NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (daily_target >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject VARCHAR(255);
ALTER TABLE donations ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'UNASSIGNED';
ALTER TABLE donations ADD COLUMN IF NOT EXISTS payment_profile_id INTEGER;
ALTER TABLE admin_adjustments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'UNASSIGNED';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_subject_unique_idx
  ON users (google_subject) WHERE google_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_method VARCHAR(30) NOT NULL,
  account_identifier VARCHAR(120) NOT NULL,
  label VARCHAR(80),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, payment_method, account_identifier)
);

CREATE TABLE IF NOT EXISTS payment_method_transfers (
  id SERIAL PRIMARY KEY,
  from_method VARCHAR(30) NOT NULL,
  to_method VARCHAR(30) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_method <> to_method)
);

CREATE INDEX IF NOT EXISTS donations_user_created_idx ON donations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS donations_status_created_idx ON donations (status, created_at ASC);
CREATE INDEX IF NOT EXISTS donations_method_idx ON donations (payment_method, status);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS admin_adjustments_created_idx ON admin_adjustments (created_at DESC);
CREATE INDEX IF NOT EXISTS payment_profiles_user_idx ON payment_profiles (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfers_created_idx ON payment_method_transfers (created_at DESC);
