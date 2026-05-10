"""
Personal Finance Platform - Extraction Prompts
Prompts for extracting investment data from documents
"""

# Portfolio extraction prompt
PORTFOLIO_EXTRACTION_PROMPT = """
You are an expert at extracting investment portfolio data from brokerage statements and tax documents.

Extract all investment holdings from the provided document. Return the data as a JSON array of objects with these fields:
- ticker: Stock ticker symbol (e.g., AAPL, MSFT, VTI) - REQUIRED
- shares: Number of shares owned (numeric) - REQUIRED
- purchase_price: Purchase price per share (numeric, use 0 if not found) - OPTIONAL
- current_value: Current value of position (numeric, can be estimated) - REQUIRED
- security_type: 'stock', 'etf', 'mutual_fund', 'bond', or 'cash' - REQUIRED
- purchase_date: Purchase date in YYYY-MM-DD format - OPTIONAL
- account_name: Account name if specified - OPTIONAL
- cusip: CUSIP number if found - OPTIONAL

Document text:
{document_text}

Requirements:
1. Return ONLY valid JSON array, no other text
2. Include ALL holdings found in the document
3. If a field cannot be determined, use null or appropriate default
4. Do not include summaries or explanations
5. Handle multiple pages if present

Output format example:
[
    {
        "ticker": "AAPL",
        "shares": 50,
        "purchase_price": 150.00,
        "current_value": 7500.00,
        "security_type": "stock",
        "purchase_date": "2023-01-15",
        "account_name": "Brokerage Account"
    }
]
"""

# 1099-B extraction prompt
EXTRACT_1099_B_PROMPT = """
Extract transaction data from this 1099-B form.

Return a JSON array with these fields for each transaction:
- description: Security description
- ticker: Stock ticker
- shares: Number of shares sold
- proceeds: Gross proceeds from sale
- cost_basis: Cost or basis
- acquisition_date: Date acquired (MM/DD/YYYY)
- sale_date: Date sold (MM/DD/YYYY)
- gain_loss: Short-term or long-term (ST or LT)

Document text:
{document_text}

Return ONLY valid JSON array, no other text.

Output format example:
[
    {
        "description": "APPLE INC",
        "ticker": "AAPL",
        "shares": 100,
        "proceeds": 15000.00,
        "cost_basis": 12000.00,
        "acquisition_date": "01/15/2023",
        "sale_date": "11/20/2023",
        "gain_loss": "LT"
    }
]
"""

# 1099-DIV extraction prompt
EXTRACT_1099_DIV_PROMPT = """
Extract dividend income data from this 1099-DIV form.

Return a JSON object with these fields:
- ordinary_dividends: Total ordinary dividends
- qualified_dividends: Qualified dividends
- capital_gains_distributions: Long-term capital gains
- short_term_capital_gains: Short-term capital gains
- foreign_tax_paid: Foreign tax paid
- tax_exempt_interest: Tax exempt interest
- dividends_from_money_market_accounts: Money market dividends

Document text:
{document_text}

Return ONLY valid JSON object, no other text.

Output format example:
{
    "ordinary_dividends": 1250.50,
    "qualified_dividends": 1000.00,
    "capital_gains_distributions": 500.00,
    "short_term_capital_gains": 0.00,
    "foreign_tax_paid": 25.00,
    "tax_exempt_interest": 0.00,
    "dividends_from_money_market_accounts": 250.00
}
"""

# Document type classification prompt
CLASSIFY_DOCUMENT_PROMPT = """
Classify this document based on its content.

Possible types:
- 1099_B: Brokerage proceeds (form 1099-B)
- 1099_DIV: Dividend income (form 1099-DIV)
- 1099_INT: Interest income (form 1099-INT)
- 1099_RMD: Required minimum distribution (form 1099-R)
- brokerage_statement: Monthly/quarterly brokerage statement
- bank_statement: Bank statement
- loan_statement: Loan or mortgage statement
- tax_return: Tax return document
- unknown: Cannot determine

Document text:
{document_text}

Return ONLY the document type name, no other text.
"""

# Account balance extraction prompt
EXTRACT_ACCOUNT_BALANCE_PROMPT = """
Extract account information from this statement.

Return a JSON object with:
- account_name: Name of the account
- account_number_last4: Last 4 digits of account number
- current_balance: Current balance (numeric)
- as_of_date: Date of balance (YYYY-MM-DD format)
- account_type: Type of account (brokerage, savings, checking, etc.)

Document text:
{document_text}

Return ONLY valid JSON object, no other text.

Output format example:
{
    "account_name": "Vanguard Brokerage Account",
    "account_number_last4": "1234",
    "current_balance": 250000.00,
    "as_of_date": "2024-01-31",
    "account_type": "brokerage"
}
"""


def get_portfolio_extraction_prompt(document_text: str) -> str:
    """Get the portfolio extraction prompt with document text."""
    return PORTFOLIO_EXTRACTION_PROMPT.format(document_text=document_text)


def get_1099_b_extraction_prompt(document_text: str) -> str:
    """Get the 1099-B extraction prompt with document text."""
    return EXTRACT_1099_B_PROMPT.format(document_text=document_text)


def get_1099_div_extraction_prompt(document_text: str) -> str:
    """Get the 1099-DIV extraction prompt with document text."""
    return EXTRACT_1099_DIV_PROMPT.format(document_text=document_text)


def get_document_classification_prompt(document_text: str) -> str:
    """Get the document classification prompt with document text."""
    return CLASSIFY_DOCUMENT_PROMPT.format(document_text=document_text)


def get_account_balance_prompt(document_text: str) -> str:
    """Get the account balance extraction prompt with document text."""
    return EXTRACT_ACCOUNT_BALANCE_PROMPT.format(document_text=document_text)
