// SQLite schema ported from database/schema.sql.
// Kept as a single SQL string so the migration runner can execute it
// idempotently on every cold start (CREATE TABLE IF NOT EXISTS / CREATE INDEX
// IF NOT EXISTS). When the schema changes, bump SCHEMA_VERSION and add an
// upgrade branch in db.ts.

export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1,
  full_name TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_number TEXT,
  institution_name TEXT,
  institution_type TEXT,
  balance REAL DEFAULT 0,
  balance_date TEXT,
  currency TEXT DEFAULT 'USD',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  cusip TEXT,
  security_name TEXT,
  security_type TEXT,
  shares REAL DEFAULT 0,
  average_cost REAL,
  purchase_date TEXT,
  current_price REAL,
  current_value REAL,
  day_change REAL,
  day_change_percent REAL,
  total_gain_loss REAL,
  total_gain_loss_percent REAL,
  dividend_yield REAL,
  sector TEXT,
  industry TEXT,
  currency TEXT,
  is_active INTEGER DEFAULT 1,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_holdings_user_id ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_account_id ON holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  holding_id INTEGER,
  transaction_type TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  settlement_date TEXT,
  ticker TEXT,
  shares REAL,
  price_per_share REAL,
  total_amount REAL,
  commission REAL DEFAULT 0,
  fees REAL DEFAULT 0,
  description TEXT,
  reference_number TEXT,
  is_reconciled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (holding_id) REFERENCES holdings(id)
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER,
  loan_name TEXT NOT NULL,
  loan_type TEXT NOT NULL,        -- mortgage|auto|student|credit_card|personal|business|home_equity|line_of_credit|other
  original_balance REAL NOT NULL,
  current_balance REAL DEFAULT 0,
  interest_rate REAL,
  apr REAL,
  monthly_payment REAL,
  monthly_escrow REAL DEFAULT 0,          -- property-secured debts: tax + insurance pass-through
  escrow_annual_growth REAL DEFAULT 0,    -- optional annual escrow growth (decimal, e.g. 0.03)
  start_date TEXT,
  end_date TEXT,
  due_day INTEGER,
  account_number_last4 TEXT,
  status TEXT DEFAULT 'active',   -- active|paid_off|closed|charged_off
  lender_name TEXT,
  lender_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'single_family',
  nickname TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',
  manual_value REAL,
  estimated_value REAL,
  last_estimated_at TEXT,
  valuation_source TEXT,          -- 'manual' | 'rentcast'
  purchase_price REAL,
  purchase_date TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);

CREATE TABLE IF NOT EXISTS portfolio_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  history_date TEXT NOT NULL,  -- YYYY-MM-DD
  total_assets REAL DEFAULT 0,
  total_liabilities REAL DEFAULT 0,
  total_net_worth REAL DEFAULT 0,
  total_investments REAL DEFAULT 0,
  total_cash REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, history_date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_date ON portfolio_history(user_id, history_date);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_path TEXT,
  file_size_bytes INTEGER,
  upload_date TEXT DEFAULT CURRENT_TIMESTAMP,
  extraction_status TEXT DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  extracted_data TEXT,  -- JSON
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  company_name TEXT,
  target_price REAL,
  target_direction TEXT,      -- 'above' | 'below' | NULL
  notification_method TEXT DEFAULT 'in_app',  -- 'in_app' | 'push' | 'both'
  notes TEXT,
  alert_triggered INTEGER DEFAULT 0,
  last_notified_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, ticker),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);

CREATE TABLE IF NOT EXISTS market_prices (
  ticker TEXT PRIMARY KEY,
  price REAL NOT NULL,
  previous_close REAL,
  day_change REAL,
  day_change_percent REAL,
  source TEXT,
  currency TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, setting_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
