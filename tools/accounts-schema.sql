CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_login INTEGER, paused INTEGER NOT NULL DEFAULT 0, contact_linked INTEGER NOT NULL DEFAULT 0, ics_token TEXT NOT NULL UNIQUE, planner TEXT, planner_updated INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS saved_camps (account_id TEXT NOT NULL, camp TEXT NOT NULL, alert_open INTEGER NOT NULL DEFAULT 1, alert_remind INTEGER NOT NULL DEFAULT 1, added_at INTEGER NOT NULL, PRIMARY KEY (account_id, camp));
CREATE TABLE IF NOT EXISTS used_links (nonce_hash TEXT PRIMARY KEY, used_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS link_requests (email_hash TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS link_requests_email ON link_requests(email_hash, at);
