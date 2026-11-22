CREATE TABLE IF NOT EXISTS articles (slug TEXT PRIMARY KEY, html TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, payment_intent TEXT NOT NULL,
  slug TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS purchases_email ON purchases(email, slug);
CREATE TABLE IF NOT EXISTS checkout_attempts (
  ref TEXT PRIMARY KEY, session_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS access_grants (
  session_hash TEXT NOT NULL, purchase_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY (session_hash, purchase_id)
);
CREATE TABLE IF NOT EXISTS payment_blocks (payment_intent TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS restore_tokens (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, slug TEXT NOT NULL,
  expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
