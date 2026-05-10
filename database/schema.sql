-- Personal Finance & Investment Portfolio Intelligence Platform
-- SQLite Database Schema
-- All tables use AUTOINCREMENT for primary keys

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- ==============================================================================
-- USERS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    full_name TEXT
);

-- ==============================================================================
-- ACCOUNTS TABLE - Investment, Retirement, Bank Accounts
-- ==============================================================================
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK(account_type IN (
        'brokerage', 'traditional_ira', 'roth_ira', '401k', 'savings', 'checking',
        'cash_management', 'hsa', 'pension', 'other'
    )),
    account_number TEXT,  -- Masked in UI
    institution_name TEXT,
    institution_type TEXT,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    balance_date DATE,
    currency TEXT DEFAULT 'USD',
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);

-- ==============================================================================
-- HOLDINGS TABLE - Stock/ETF/_mutual_fund holdings
-- ==============================================================================
CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    cusip TEXT,
    security_name TEXT,
    security_type TEXT CHECK(security_type IN (
        'stock', 'etf', 'mutual_fund', 'bond', 'option', 'cash', 'other'
    )),
    shares DECIMAL(18, 8) DEFAULT 0,
    average_cost DECIMAL(18, 4),  -- Weighted average cost per share
    purchase_date DATE,
    current_price DECIMAL(18, 4),
    current_value DECIMAL(15, 2),
    day_change DECIMAL(10, 4),  -- Dollar change for the day
    day_change_percent DECIMAL(6, 4),  -- Percentage change for the day
    total_gain_loss DECIMAL(15, 2),  -- Total unrealized gain/loss
    total_gain_loss_percent DECIMAL(6, 4),
    dividend_yield DECIMAL(6, 4),  -- Annual dividend yield
    sector TEXT,
    industry TEXT,
    is_active INTEGER DEFAULT 1,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_holdings_account_id ON holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_holdings_user_id ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);

-- ==============================================================================
-- TRANSACTIONS TABLE - Trade transactions, deposits, withdrawals
-- ==============================================================================
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    holding_id INTEGER,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'interest',
        'transfer_in', 'transfer_out', 'split', 'spin_off'
    )),
    transaction_date DATE NOT NULL,
    settlement_date DATE,
    ticker TEXT,
    shares DECIMAL(18, 8),
    price_per_share DECIMAL(18, 4),
    total_amount DECIMAL(15, 2),
    commission DECIMAL(10, 2) DEFAULT 0.00,
    fees DECIMAL(10, 2) DEFAULT 0.00,
    description TEXT,
    reference_number TEXT,
    is_reconciled INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (holding_id) REFERENCES holdings(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);

-- ==============================================================================
-- BANK_ACCOUNTS TABLE - Bank account balances and details
-- ==============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    account_number_last4 TEXT,
    routing_number_last4 TEXT,
    account_type TEXT CHECK(account_type IN ('checking', 'savings', 'cd', 'money_market')),
    current_balance DECIMAL(15, 2) DEFAULT 0.00,
    available_balance DECIMAL(15, 2) DEFAULT 0.00,
    interest_rate DECIMAL(6, 4),
    apy DECIMAL(6, 4),
    account_status TEXT DEFAULT 'active',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_account_id ON bank_accounts(account_id);

-- ==============================================================================
-- LOANS TABLE - Liabilities tracking
-- ==============================================================================
CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    loan_name TEXT NOT NULL,
    loan_type TEXT NOT NULL CHECK(loan_type IN (
        'mortgage', 'auto', 'student', 'credit_card', 'personal', 'business',
        'home_equity', 'line_of_credit', 'other'
    )),
    original_balance DECIMAL(15, 2) NOT NULL,
    current_balance DECIMAL(15, 2) DEFAULT 0.00,
    interest_rate DECIMAL(6, 4),
    apr DECIMAL(6, 4),
    monthly_payment DECIMAL(10, 2),
    start_date DATE,
    end_date DATE,
    due_day INTEGER,
    account_number_last4 TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paid_off', 'closed', 'charged_off')),
    lender_name TEXT,
    lender_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_type ON loans(loan_type);

-- ==============================================================================
-- MARKET_PRICES TABLE - Cached market data
-- ==============================================================================
CREATE TABLE IF NOT EXISTS market_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    price DECIMAL(18, 4) NOT NULL,
    price_date DATE NOT NULL,
    price_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT,  -- Source of the price data
    open_price DECIMAL(18, 4),
    high_price DECIMAL(18, 4),
    low_price DECIMAL(18, 4),
    close_price DECIMAL(18, 4),
    volume INTEGER,
    previous_close DECIMAL(18, 4),
    change_percent DECIMAL(6, 4),
    is_current INTEGER DEFAULT 1,  -- Mark as current price
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_market_prices_ticker ON market_prices(ticker);
CREATE INDEX IF NOT EXISTS idx_market_prices_date ON market_prices(price_date);
CREATE INDEX IF NOT EXISTS idx_market_prices_current ON market_prices(is_current);

-- Unique constraint to prevent duplicate prices for same ticker/date
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_prices_unique ON market_prices(ticker, price_date);

-- ==============================================================================
-- PORTFOLIO_HISTORY TABLE - Historical net worth tracking
-- ==============================================================================
CREATE TABLE IF NOT EXISTS portfolio_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    history_date DATE NOT NULL,
    total_assets DECIMAL(15, 2) DEFAULT 0.00,
    total_liabilities DECIMAL(15, 2) DEFAULT 0.00,
    total_net_worth DECIMAL(15, 2) DEFAULT 0.00,
    total_investments DECIMAL(15, 2) DEFAULT 0.00,
    total_cash DECIMAL(15, 2) DEFAULT 0.00,
    total_retirement DECIMAL(15, 2) DEFAULT 0.00,
    total_bank_accounts DECIMAL(15, 2) DEFAULT 0.00,
    total_stock_value DECIMAL(15, 2) DEFAULT 0.00,
    total_bond_value DECIMAL(15, 2) DEFAULT 0.00,
    total_other_value DECIMAL(15, 2) DEFAULT 0.00,
    total_ira_value DECIMAL(15, 2) DEFAULT 0.00,
    total_401k_value DECIMAL(15, 2) DEFAULT 0.00,
    total_mortgage DECIMAL(15, 2) DEFAULT 0.00,
    total_loan_value DECIMAL(15, 2) DEFAULT 0.00,
    total_credit_card DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_history_user_id ON portfolio_history(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_history_date ON portfolio_history(history_date);

-- ==============================================================================
-- DOCUMENTS TABLE - Uploaded document metadata
-- ==============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER,
    document_type TEXT NOT NULL CHECK(document_type IN (
        '1099_b', '1099_div', '1099_int', '1099_rmd', 'brokerage_statement',
        'bank_statement', 'loan_statement', 'tax_return', 'other'
    )),
    document_name TEXT NOT NULL,
    document_path TEXT NOT NULL,  -- Relative path to file
    file_size_bytes INTEGER,
    file_hash TEXT,  -- SHA256 hash for deduplication
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_date TIMESTAMP,
    extraction_status TEXT DEFAULT 'pending' CHECK(extraction_status IN (
        'pending', 'processing', 'completed', 'failed'
    )),
    extracted_data TEXT,  -- JSON of extracted data
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(extraction_status);

-- ==============================================================================
-- AI_PROCESSED_DOCUMENTS TABLE - Document processing results
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ai_processed_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    prompt_type TEXT NOT NULL,
    llm_model TEXT NOT NULL,
    raw_response TEXT,
    parsed_response TEXT,  -- JSON of parsed response
    confidence_score DECIMAL(5, 4),
    extraction_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_processed_docs_document_id ON ai_processed_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_processed_docs_type ON ai_processed_documents(prompt_type);

-- ==============================================================================
-- PORTFOLIO_ALLOCATION TABLE - Cached portfolio allocation data
-- ==============================================================================
CREATE TABLE IF NOT EXISTS portfolio_allocation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    allocation_date DATE NOT NULL,
    allocation_data TEXT NOT NULL,  -- JSON of allocation breakdown
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_allocation_user_date ON portfolio_allocation(user_id, allocation_date);

-- ==============================================================================
-- SETTINGS TABLE - User preferences and app settings
-- ==============================================================================
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,
    is_json INTEGER DEFAULT 0,  -- Flag for JSON values
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, setting_key),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(setting_key);

-- ==============================================================================
-- VIEWS - For common queries
-- ==============================================================================

-- View: Current portfolio summary
CREATE VIEW IF NOT EXISTS v_portfolio_summary AS
SELECT
    h.account_id,
    a.account_name,
    a.account_type,
    h.ticker,
    h.security_name,
    h.security_type,
    h.shares,
    h.average_cost,
    h.current_price,
    h.current_value,
    h.total_gain_loss,
    h.total_gain_loss_percent,
    h.day_change,
    h.day_change_percent,
    h.dividend_yield,
    h.sector,
    h.industry,
    h.purchase_date
FROM holdings h
JOIN accounts a ON h.account_id = a.id
WHERE h.is_active = 1;

-- View: Portfolio allocation by sector
CREATE VIEW IF NOT EXISTS v_allocation_by_sector AS
SELECT
    sector,
    SUM(current_value) as total_value,
    COUNT(*) as holding_count,
    AVG(total_gain_loss_percent) as avg_gain_loss_percent
FROM holdings
WHERE sector IS NOT NULL AND is_active = 1
GROUP BY sector
ORDER BY total_value DESC;

-- View: Monthly transaction summary
CREATE VIEW IF NOT EXISTS v_monthly_transactions AS
SELECT
    strftime('%Y-%m', transaction_date) as month,
    transaction_type,
    COUNT(*) as transaction_count,
    SUM(total_amount) as total_amount,
    SUM(commission + fees) as total_fees
FROM transactions
GROUP BY month, transaction_type
ORDER BY month DESC;

-- View: Net worth history
CREATE VIEW IF NOT EXISTS v_net_worth_trend AS
SELECT
    history_date,
    total_assets,
    total_liabilities,
    total_net_worth,
    (total_assets - total_liabilities) as calculated_net_worth
FROM portfolio_history
ORDER BY history_date DESC;

-- ==============================================================================
-- TRIGGERS - For automatic updates
-- ==============================================================================

-- Trigger: Update updated_at timestamp on accounts
CREATE TRIGGER IF NOT EXISTS update_accounts_timestamp
AFTER UPDATE ON accounts
BEGIN
    UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger: Update updated_at timestamp on loans
CREATE TRIGGER IF NOT EXISTS update_loans_timestamp
AFTER UPDATE ON loans
BEGIN
    UPDATE loans SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger: Update current holdings values
CREATE TRIGGER IF NOT EXISTS update_holdings_value
AFTER UPDATE OF current_price ON holdings
BEGIN
    UPDATE holdings
    SET current_value = shares * NEW.current_price
    WHERE id = NEW.id;
END;

-- ==============================================================================
-- INITIAL DATA - Default user and sample data
-- ==============================================================================

-- Default user (password: 'password123' - hash should be set via app)
-- INSERT INTO users (username, email, password_hash, full_name)
-- VALUES ('user', 'user@example.com', '$2b$12$...', 'Default User');
