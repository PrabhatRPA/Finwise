"""
Personal Finance Platform - Database Models
SQLAlchemy ORM models for all tables
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Boolean, CheckConstraint, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from . import Base


class User(Base):
    """User account model."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    full_name = Column(String)

    # Relationships
    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    holdings = relationship("Holding", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    bank_accounts = relationship("BankAccount", back_populates="user", cascade="all, delete-orphan")
    loans = relationship("Loan", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("Setting", back_populates="user", cascade="all, delete-orphan")
    watchlist = relationship("Watchlist", back_populates="user", cascade="all, delete-orphan")
    properties = relationship("Property", back_populates="user", cascade="all, delete-orphan")


class Account(Base):
    """Investment, retirement, and bank accounts."""
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("account_type IN ('brokerage', 'traditional_ira', 'roth_ira', '401k', 'savings', 'checking', 'cash_management', 'hsa', 'pension', 'other')", name="account_type_check"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_name = Column(String, nullable=False)
    account_type = Column(String, nullable=False)
    account_number = Column(String)
    institution_name = Column(String)
    institution_type = Column(String)
    balance = Column(Float, default=0.00)
    balance_date = Column(Date)
    currency = Column(String, default="USD")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="accounts")
    holdings = relationship("Holding", back_populates="account")
    bank_accounts = relationship("BankAccount", back_populates="account", cascade="all, delete-orphan")
    loans = relationship("Loan", back_populates="account", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="account", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan")


class Holding(Base):
    """Stock/ETF/mutual fund holdings."""
    __tablename__ = "holdings"
    __table_args__ = (
        CheckConstraint("security_type IN ('stock', 'etf', 'mutual_fund', 'bond', 'option', 'cash', 'crypto', 'reit', 'other')", name="security_type_check"),
        Index("idx_holdings_account_id", "account_id"),
        Index("idx_holdings_user_id", "user_id"),
        Index("idx_holdings_ticker", "ticker"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    cusip = Column(String)
    security_name = Column(String)
    security_type = Column(String)
    shares = Column(Float, default=0.0)
    average_cost = Column(Float)
    purchase_date = Column(Date)
    current_price = Column(Float)
    current_value = Column(Float)
    day_change = Column(Float)
    day_change_percent = Column(Float)
    total_gain_loss = Column(Float)
    total_gain_loss_percent = Column(Float)
    dividend_yield = Column(Float)
    sector = Column(String)
    industry = Column(String)
    is_active = Column(Boolean, default=True)
    last_updated = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    account = relationship("Account", back_populates="holdings")
    user = relationship("User", back_populates="holdings")
    transactions = relationship("Transaction", back_populates="holding", cascade="all, delete-orphan")


class Transaction(Base):
    """Trade transactions, deposits, withdrawals."""
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("transaction_type IN ('buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'interest', 'transfer_in', 'transfer_out', 'split', 'spin_off')", name="transaction_type_check"),
        Index("idx_transactions_user_id", "user_id"),
        Index("idx_transactions_account_id", "account_id"),
        Index("idx_transactions_date", "transaction_date"),
        Index("idx_transactions_type", "transaction_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    holding_id = Column(Integer, ForeignKey("holdings.id"))
    transaction_type = Column(String, nullable=False)
    transaction_date = Column(Date, nullable=False)
    settlement_date = Column(Date)
    ticker = Column(String)
    shares = Column(Float)
    price_per_share = Column(Float)
    total_amount = Column(Float)
    commission = Column(Float, default=0.00)
    fees = Column(Float, default=0.00)
    description = Column(String)
    reference_number = Column(String)
    is_reconciled = Column(Boolean, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    holding = relationship("Holding", back_populates="transactions")


class BankAccount(Base):
    """Bank account balances and details."""
    __tablename__ = "bank_accounts"
    __table_args__ = (
        CheckConstraint("account_type IN ('checking', 'savings', 'cd', 'money_market')", name="bank_account_type_check"),
        Index("idx_bank_accounts_user_id", "user_id"),
        Index("idx_bank_accounts_account_id", "account_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    account_number_last4 = Column(String)
    routing_number_last4 = Column(String)
    account_type = Column(String)
    current_balance = Column(Float, default=0.00)
    available_balance = Column(Float, default=0.00)
    interest_rate = Column(Float)
    apy = Column(Float)
    account_status = Column(String, default="active")
    last_updated = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="bank_accounts")
    account = relationship("Account", back_populates="bank_accounts")


class Loan(Base):
    """Liabilities tracking."""
    __tablename__ = "loans"
    __table_args__ = (
        CheckConstraint("loan_type IN ('mortgage', 'auto', 'student', 'credit_card', 'personal', 'business', 'home_equity', 'line_of_credit', 'other')", name="loan_type_check"),
        CheckConstraint("status IN ('active', 'paid_off', 'closed', 'charged_off')", name="loan_status_check"),
        Index("idx_loans_user_id", "user_id"),
        Index("idx_loans_type", "loan_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    loan_name = Column(String, nullable=False)
    loan_type = Column(String, nullable=False)
    original_balance = Column(Float, nullable=False)
    current_balance = Column(Float, default=0.00)
    interest_rate = Column(Float)
    apr = Column(Float)
    monthly_payment = Column(Float)
    start_date = Column(Date)
    end_date = Column(Date)
    due_day = Column(Integer)
    account_number_last4 = Column(String)
    status = Column(String, default="active")
    lender_name = Column(String)
    lender_type = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="loans")
    account = relationship("Account", back_populates="loans")


class MarketPrice(Base):
    """Cached market data."""
    __tablename__ = "market_prices"
    __table_args__ = (
        Index("idx_market_prices_ticker", "ticker"),
        Index("idx_market_prices_date", "price_date"),
        Index("idx_market_prices_current", "is_current"),
        {"sqlite_autoincrement": False},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    price_date = Column(Date, nullable=False)
    price_time = Column(DateTime, default=datetime.utcnow)
    source = Column(String)
    open_price = Column(Float)
    high_price = Column(Float)
    low_price = Column(Float)
    close_price = Column(Float)
    volume = Column(Integer)
    previous_close = Column(Float)
    change_percent = Column(Float)
    is_current = Column(Boolean, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


class PortfolioHistory(Base):
    """Historical net worth tracking."""
    __tablename__ = "portfolio_history"
    __table_args__ = (
        Index("idx_portfolio_history_user_id", "user_id"),
        Index("idx_portfolio_history_date", "history_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    history_date = Column(Date, nullable=False)
    total_assets = Column(Float, default=0.00)
    total_liabilities = Column(Float, default=0.00)
    total_net_worth = Column(Float, default=0.00)
    total_investments = Column(Float, default=0.00)
    total_cash = Column(Float, default=0.00)
    total_retirement = Column(Float, default=0.00)
    total_bank_accounts = Column(Float, default=0.00)
    total_stock_value = Column(Float, default=0.00)
    total_bond_value = Column(Float, default=0.00)
    total_other_value = Column(Float, default=0.00)
    total_ira_value = Column(Float, default=0.00)
    total_401k_value = Column(Float, default=0.00)
    total_mortgage = Column(Float, default=0.00)
    total_loan_value = Column(Float, default=0.00)
    total_credit_card = Column(Float, default=0.00)
    created_at = Column(DateTime, default=datetime.utcnow)


class Document(Base):
    """Uploaded document metadata."""
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("document_type IN ('1099_b', '1099_div', '1099_int', '1099_rmd', 'brokerage_statement', 'bank_statement', 'loan_statement', 'tax_return', 'other')", name="document_type_check"),
        CheckConstraint("extraction_status IN ('pending', 'processing', 'completed', 'failed')", name="extraction_status_check"),
        Index("idx_documents_user_id", "user_id"),
        Index("idx_documents_type", "document_type"),
        Index("idx_documents_status", "extraction_status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    document_type = Column(String, nullable=False)
    document_name = Column(String, nullable=False)
    document_path = Column(String, nullable=False)
    file_size_bytes = Column(Integer)
    file_hash = Column(String)
    upload_date = Column(DateTime, default=datetime.utcnow)
    processed_date = Column(DateTime)
    extraction_status = Column(String, default="pending")
    extracted_data = Column(Text)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="documents")
    account = relationship("Account", back_populates="documents")
    ai_processed = relationship("AIProcessedDocument", back_populates="document", cascade="all, delete-orphan")


class AIProcessedDocument(Base):
    """Document processing results."""
    __tablename__ = "ai_processed_documents"
    __table_args__ = (
        Index("idx_ai_processed_docs_document_id", "document_id"),
        Index("idx_ai_processed_docs_type", "prompt_type"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    prompt_type = Column(String, nullable=False)
    llm_model = Column(String, nullable=False)
    raw_response = Column(Text)
    parsed_response = Column(Text)
    confidence_score = Column(Float)
    extraction_type = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="ai_processed")


class PortfolioAllocation(Base):
    """Cached portfolio allocation data."""
    __tablename__ = "portfolio_allocation"
    __table_args__ = (
        Index("idx_allocation_user_date", "user_id", "allocation_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    allocation_date = Column(Date, nullable=False)
    allocation_data = Column(Text, nullable=False)  # JSON
    created_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    """User preferences and app settings."""
    __tablename__ = "settings"
    __table_args__ = (
        Index("idx_settings_user_id", "user_id"),
        Index("idx_settings_key", "setting_key"),
        {"sqlite_autoincrement": False},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    setting_key = Column(String, nullable=False)
    setting_value = Column(String)
    is_json = Column(Boolean, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="settings")


class Watchlist(Base):
    """Stocks the user wants to track with optional price alert targets."""
    __tablename__ = "watchlist"
    __table_args__ = (
        Index("idx_watchlist_user_id", "user_id"),
        Index("idx_watchlist_ticker", "ticker"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    company_name = Column(String)
    # target_price: the price level the user wants to be notified at
    target_price = Column(Float)
    # "above" = alert when price rises above target; "below" = alert when drops below
    target_direction = Column(String)  # "above" | "below" | None
    # "in_app" | "browser" | "both"
    notification_method = Column(String, default="in_app")
    notes = Column(String)
    # Tracks whether the alert has already fired (reset when user edits target)
    alert_triggered = Column(Boolean, default=False)
    last_notified_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="watchlist")


class Property(Base):
    """Real-estate properties — homes, condos, land, etc."""
    __tablename__ = "properties"
    __table_args__ = (
        Index("idx_properties_user_id", "user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # e.g. "single_family", "condo", "apartment", "land", "commercial", "multi_family", "other"
    property_type = Column(String, nullable=False, default="single_family")
    nickname = Column(String)        # e.g. "Main House", "Vacation Cabin"
    address = Column(String)
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    country = Column(String, default="US")
    # Manual value entered by user (takes precedence if set)
    manual_value = Column(Float)
    # Value fetched from a property API (Rentcast, etc.)
    estimated_value = Column(Float)
    # When estimated_value was last refreshed
    last_estimated_at = Column(DateTime)
    # Raw API response (stored as JSON for transparency)
    valuation_source = Column(String)    # "rentcast" | "manual"
    purchase_price = Column(Float)
    purchase_date = Column(Date)
    notes = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="properties")

    @property
    def current_value(self) -> float:
        """Manual value takes precedence over API estimate."""
        return float(self.manual_value or self.estimated_value or 0)
