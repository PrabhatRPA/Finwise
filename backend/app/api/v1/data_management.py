"""
Personal Finance Platform - Data Management API
Export to CSV, import from CSV, and automatic weekly backups.
"""

import csv
import io
import json
import os
import zipfile
from datetime import datetime, date
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.db import models
from app.core.auth_deps import get_current_user
from app.core.config import UPLOAD_DIR

router = APIRouter()

# Backups live alongside uploads, one subfolder per user
def _backup_dir(user_id: int) -> Path:
    d = UPLOAD_DIR / str(user_id) / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ─── helpers ─────────────────────────────────────────────────────────────────

def _holdings_rows(db: Session, user_id: int) -> list[dict]:
    rows = []
    for h in db.query(models.Holding).filter(models.Holding.user_id == user_id).all():
        # previous_close isn't stored on Holding — derive it from current_price - day_change.
        prev_close = round((h.current_price or 0) - (h.day_change or 0), 4)
        rows.append({
            "ticker": h.ticker or "",
            "security_name": h.security_name or "",
            "security_type": h.security_type or "stock",
            "shares": h.shares or 0,
            "average_cost": h.average_cost or 0,
            "current_price": h.current_price or 0,
            "previous_close": prev_close,
            "day_change": h.day_change or 0,
            "day_change_percent": h.day_change_percent or 0,
            "current_value": h.current_value or 0,
            "total_gain_loss": h.total_gain_loss or 0,
            "total_gain_loss_percent": h.total_gain_loss_percent or 0,
            "purchase_date": h.purchase_date.isoformat() if h.purchase_date else "",
            "account_id": h.account_id or "",
            "sector": h.sector or "",
            "industry": h.industry or "",
            "dividend_yield": h.dividend_yield or 0,
        })
    return rows

def _watchlist_rows(db: Session, user_id: int) -> list[dict]:
    rows = []
    for w in db.query(models.Watchlist).filter(models.Watchlist.user_id == user_id).all():
        rows.append({
            "ticker": w.ticker or "",
            "company_name": w.company_name or "",
            "target_price": w.target_price or "",
            "target_direction": w.target_direction or "",
            "notification_method": w.notification_method or "in_app",
            "notes": w.notes or "",
        })
    return rows

def _debts_rows(db: Session, user_id: int) -> list[dict]:
    rows = []
    for l in db.query(models.Loan).filter(models.Loan.user_id == user_id).all():
        rows.append({
            "loan_name": l.loan_name or "",
            "loan_type": l.loan_type or "",
            "original_balance": l.original_balance or 0,
            "current_balance": l.current_balance or 0,
            "interest_rate": l.interest_rate or "",
            "monthly_payment": l.monthly_payment or "",
            "lender_name": l.lender_name or "",
            "status": l.status or "active",
            "start_date": l.start_date.isoformat() if l.start_date else "",
            "end_date": l.end_date.isoformat() if l.end_date else "",
            "due_day": l.due_day or "",
        })
    return rows

def _dict_to_csv_bytes(rows: list[dict], fieldnames: list[str]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode()

def _csv_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Export endpoints ─────────────────────────────────────────────────────────

HOLDINGS_FIELDS = [
    "ticker", "security_name", "security_type", "shares", "average_cost",
    "current_price", "previous_close", "day_change", "day_change_percent",
    "current_value", "total_gain_loss", "total_gain_loss_percent",
    "purchase_date", "account_id", "sector", "industry", "dividend_yield",
]
WATCHLIST_FIELDS = [
    "ticker", "company_name", "target_price", "target_direction",
    "notification_method", "notes",
]
DEBTS_FIELDS = [
    "loan_name", "loan_type", "original_balance", "current_balance",
    "interest_rate", "monthly_payment", "lender_name", "status",
    "start_date", "end_date", "due_day",
]
TRENDS_FIELDS = [
    "date", "net_worth", "investments", "liabilities", "assets", "cash",
    "retirement", "bank_accounts", "stocks", "bonds", "other_investments",
]


@router.get("/export/holdings")
def export_holdings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = _holdings_rows(db, current_user.id)
    data = _dict_to_csv_bytes(rows, HOLDINGS_FIELDS)
    ts = datetime.now().strftime("%Y%m%d")
    return _csv_response(data, f"holdings_{ts}.csv")


@router.get("/export/watchlist")
def export_watchlist(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = _watchlist_rows(db, current_user.id)
    data = _dict_to_csv_bytes(rows, WATCHLIST_FIELDS)
    ts = datetime.now().strftime("%Y%m%d")
    return _csv_response(data, f"watchlist_{ts}.csv")


@router.get("/export/debts")
def export_debts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = _debts_rows(db, current_user.id)
    data = _dict_to_csv_bytes(rows, DEBTS_FIELDS)
    ts = datetime.now().strftime("%Y%m%d")
    return _csv_response(data, f"debts_{ts}.csv")


def _trends_rows(db: Session, user_id: int) -> list[dict]:
    rows = []
    for h in db.query(models.PortfolioHistory).filter(
        models.PortfolioHistory.user_id == user_id
    ).order_by(models.PortfolioHistory.history_date).all():
        rows.append({
            "date": h.history_date.isoformat() if h.history_date else "",
            "net_worth": float(h.total_net_worth or 0),
            "investments": float(h.total_investments or 0),
            "liabilities": float(h.total_liabilities or 0),
            "assets": float(h.total_assets or 0),
            "cash": float(h.total_cash or 0),
            "retirement": float(h.total_retirement or 0),
            "bank_accounts": float(h.total_bank_accounts or 0),
            "stocks": float(h.total_stock_value or 0),
            "bonds": float(h.total_bond_value or 0),
            "other_investments": float(h.total_other_value or 0),
        })
    return rows


@router.get("/export/trends")
def export_trends(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = _trends_rows(db, current_user.id)
    data = _dict_to_csv_bytes(rows, TRENDS_FIELDS)
    ts = datetime.now().strftime("%Y%m%d")
    return _csv_response(data, f"net_worth_trends_{ts}.csv")


@router.get("/export/full-backup")
def export_full_backup(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """ZIP archive containing holdings, watchlist, and debts CSVs."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"holdings_{ts}.csv",
                    _dict_to_csv_bytes(_holdings_rows(db, current_user.id), HOLDINGS_FIELDS).decode())
        zf.writestr(f"watchlist_{ts}.csv",
                    _dict_to_csv_bytes(_watchlist_rows(db, current_user.id), WATCHLIST_FIELDS).decode())
        zf.writestr(f"debts_{ts}.csv",
                    _dict_to_csv_bytes(_debts_rows(db, current_user.id), DEBTS_FIELDS).decode())
        zf.writestr(f"net_worth_trends_{ts}.csv",
                    _dict_to_csv_bytes(_trends_rows(db, current_user.id), TRENDS_FIELDS).decode())
    zip_buf.seek(0)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="portfolio_backup_{ts}.zip"'},
    )


# ─── Automatic backup ─────────────────────────────────────────────────────────

def _write_backup(db: Session, user_id: int) -> Path:
    """Write a ZIP backup to the user's backup directory and return its path."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = _backup_dir(user_id) / f"backup_{ts}.zip"
    with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"holdings_{ts}.csv",
                    _dict_to_csv_bytes(_holdings_rows(db, user_id), HOLDINGS_FIELDS).decode())
        zf.writestr(f"watchlist_{ts}.csv",
                    _dict_to_csv_bytes(_watchlist_rows(db, user_id), WATCHLIST_FIELDS).decode())
        zf.writestr(f"debts_{ts}.csv",
                    _dict_to_csv_bytes(_debts_rows(db, user_id), DEBTS_FIELDS).decode())
        zf.writestr(f"net_worth_trends_{ts}.csv",
                    _dict_to_csv_bytes(_trends_rows(db, user_id), TRENDS_FIELDS).decode())
    # Keep only the 10 most recent backup files
    existing = sorted(_backup_dir(user_id).glob("backup_*.zip"))
    for old in existing[:-10]:
        old.unlink(missing_ok=True)
    return backup_path


@router.post("/backup/create")
def create_backup(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Manually trigger a backup (also called automatically on a weekly schedule)."""
    path = _write_backup(db, current_user.id)
    return {"ok": True, "filename": path.name}


@router.get("/backup/list")
def list_backups(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List available backup files (newest first)."""
    files = sorted(_backup_dir(current_user.id).glob("backup_*.zip"), reverse=True)
    result = []
    for f in files:
        stat = f.stat()
        result.append({
            "filename": f.name,
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return {"backups": result}


@router.get("/backup/download/{filename}")
def download_backup(
    filename: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Download a specific backup file by name."""
    # Prevent path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = _backup_dir(current_user.id) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(
        path=str(path),
        media_type="application/zip",
        filename=filename,
    )


@router.delete("/backup/{filename}")
def delete_backup(
    filename: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = _backup_dir(current_user.id) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    path.unlink()
    return {"ok": True}


# ─── Import endpoints ─────────────────────────────────────────────────────────

# Common column-name aliases used by other portfolio trackers, brokerage
# exports (Fidelity, Schwab, Robinhood, etc.), and older versions of this app.
# Mapped to our canonical names so the user can drop in any reasonable CSV.
_CSV_ALIAS_MAP = {
    # ticker
    "symbol": "ticker", "stock": "ticker", "stock_symbol": "ticker",
    "security_symbol": "ticker", "instrument": "ticker",
    # shares
    "quantity": "shares", "qty": "shares", "units": "shares",
    "share_quantity": "shares", "no_of_shares": "shares",
    # average_cost
    "avg_cost": "average_cost", "cost_basis": "average_cost",
    "cost_per_share": "average_cost", "purchase_price": "average_cost",
    "avg_price": "average_cost",
    # security_name
    "name": "security_name", "company_name": "security_name", "description": "security_name",
    # security_type
    "type": "security_type", "asset_class": "security_type", "asset_type": "security_type",
    # purchase_date
    "buy_date": "purchase_date", "date": "purchase_date", "acquired": "purchase_date",
    # account_id / account_name
    "account": "account_name", "broker": "account_name",
}


def _normalize_row(row: dict) -> dict:
    """Map common column-name aliases to canonical names, lowercase keys, trim values."""
    out: dict = {}
    for raw_k, v in row.items():
        if raw_k is None:
            continue
        k = str(raw_k).strip().lower().replace(" ", "_").replace("-", "_")
        k = _CSV_ALIAS_MAP.get(k, k)
        # Don't overwrite a canonical value with an alias's value (canonical wins).
        if k not in out or not out[k]:
            out[k] = v.strip() if isinstance(v, str) else v
    return out


def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")  # strip BOM if present
    reader = csv.DictReader(io.StringIO(text))
    return [_normalize_row(row) for row in reader]


@router.post("/import/holdings")
async def import_holdings_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Import holdings from a CSV.
    Required columns: ticker, shares
    Optional: security_name, security_type, average_cost, purchase_date, account_id
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")
    content = await file.read()
    try:
        rows = _parse_csv(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    created, skipped, errors = [], [], []
    for i, row in enumerate(rows, 1):
        ticker = str(row.get("ticker", "")).strip().upper()
        if not ticker:
            errors.append(f"Row {i}: missing ticker")
            continue
        try:
            shares = float(row.get("shares", 0) or 0)
        except ValueError:
            errors.append(f"Row {i} ({ticker}): invalid shares value")
            continue
        if shares <= 0:
            errors.append(f"Row {i} ({ticker}): shares must be > 0")
            continue

        avg_cost = 0.0
        try:
            avg_cost = float(row.get("average_cost", 0) or 0)
        except ValueError:
            pass

        account_id: Optional[int] = None
        try:
            raw_acct = row.get("account_id", "")
            if raw_acct and str(raw_acct).strip():
                account_id = int(float(raw_acct))
        except ValueError:
            pass

        purchase_date = None
        try:
            raw_date = str(row.get("purchase_date", "")).strip()
            if raw_date:
                purchase_date = date.fromisoformat(raw_date)
        except ValueError:
            pass

        sec_type = str(row.get("security_type", "stock") or "stock").strip().lower()
        if sec_type not in {"stock", "etf", "mutual_fund", "bond", "option", "cash", "crypto", "reit", "other"}:
            sec_type = "stock"

        # Skip duplicates (same ticker + account)
        existing = db.query(models.Holding).filter(
            models.Holding.user_id == current_user.id,
            models.Holding.ticker == ticker,
            models.Holding.account_id == account_id,
        ).first()
        if existing:
            skipped.append(ticker)
            continue

        holding = models.Holding(
            user_id=current_user.id,
            account_id=account_id,
            ticker=ticker,
            security_name=str(row.get("security_name", "") or "").strip() or None,
            security_type=sec_type,
            shares=shares,
            average_cost=avg_cost,
            purchase_date=purchase_date,
            current_value=shares * avg_cost,
        )
        db.add(holding)
        created.append(ticker)

    db.commit()
    return {
        "created": created,
        "skipped_duplicates": skipped,
        "errors": errors,
        "message": f"Imported {len(created)} holding(s). Skipped {len(skipped)} duplicate(s). {len(errors)} error(s).",
    }


@router.post("/import/watchlist")
async def import_watchlist_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Import watchlist from a CSV.
    Required columns: ticker
    Optional: company_name, target_price, target_direction, notification_method, notes
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")
    content = await file.read()
    try:
        rows = _parse_csv(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    created, skipped, errors = [], [], []
    for i, row in enumerate(rows, 1):
        ticker = str(row.get("ticker", "")).strip().upper()
        if not ticker:
            errors.append(f"Row {i}: missing ticker")
            continue

        existing = db.query(models.Watchlist).filter(
            models.Watchlist.user_id == current_user.id,
            models.Watchlist.ticker == ticker,
        ).first()
        if existing:
            skipped.append(ticker)
            continue

        target_price = None
        try:
            raw_tp = str(row.get("target_price", "") or "").strip()
            if raw_tp:
                target_price = float(raw_tp)
        except ValueError:
            pass

        direction = str(row.get("target_direction", "") or "").strip().lower()
        if direction not in {"above", "below"}:
            direction = None  # type: ignore[assignment]

        notify = str(row.get("notification_method", "in_app") or "in_app").strip()
        if notify not in {"in_app", "browser", "both"}:
            notify = "in_app"

        item = models.Watchlist(
            user_id=current_user.id,
            ticker=ticker,
            company_name=str(row.get("company_name", "") or "").strip() or ticker,
            target_price=target_price,
            target_direction=direction,
            notification_method=notify,
            notes=str(row.get("notes", "") or "").strip() or None,
            alert_triggered=False,
        )
        db.add(item)
        created.append(ticker)

    db.commit()
    return {
        "created": created,
        "skipped_duplicates": skipped,
        "errors": errors,
        "message": f"Imported {len(created)} item(s). Skipped {len(skipped)} duplicate(s). {len(errors)} error(s).",
    }


@router.post("/import/debts")
async def import_debts_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Import debts/loans from a CSV.
    Required columns: loan_name, loan_type, original_balance, current_balance
    """
    VALID_LOAN_TYPES = {
        "mortgage", "auto", "student", "credit_card",
        "personal", "business", "home_equity", "line_of_credit", "other",
    }
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")
    content = await file.read()
    try:
        rows = _parse_csv(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    created, errors = [], []
    for i, row in enumerate(rows, 1):
        loan_name = str(row.get("loan_name", "") or "").strip()
        loan_type = str(row.get("loan_type", "other") or "other").strip().lower()
        if not loan_name:
            errors.append(f"Row {i}: missing loan_name")
            continue
        if loan_type not in VALID_LOAN_TYPES:
            loan_type = "other"

        try:
            original_balance = float(row.get("original_balance", 0) or 0)
            current_balance = float(row.get("current_balance", 0) or 0)
        except ValueError:
            errors.append(f"Row {i} ({loan_name}): invalid balance value")
            continue

        interest_rate = None
        try:
            raw = str(row.get("interest_rate", "") or "").strip()
            if raw:
                interest_rate = float(raw)
        except ValueError:
            pass

        monthly_payment = None
        try:
            raw = str(row.get("monthly_payment", "") or "").strip()
            if raw:
                monthly_payment = float(raw)
        except ValueError:
            pass

        start_date = end_date = None
        for field_name, attr in [("start_date", "start_date"), ("end_date", "end_date")]:
            try:
                raw = str(row.get(field_name, "") or "").strip()
                if raw:
                    if attr == "start_date":
                        start_date = date.fromisoformat(raw)
                    else:
                        end_date = date.fromisoformat(raw)
            except ValueError:
                pass

        due_day = None
        try:
            raw = str(row.get("due_day", "") or "").strip()
            if raw:
                due_day = int(raw)
        except ValueError:
            pass

        status = str(row.get("status", "active") or "active").strip()
        if status not in {"active", "paid_off", "closed", "charged_off"}:
            status = "active"

        loan = models.Loan(
            user_id=current_user.id,
            loan_name=loan_name,
            loan_type=loan_type,
            original_balance=original_balance,
            current_balance=current_balance,
            interest_rate=interest_rate,
            monthly_payment=monthly_payment,
            lender_name=str(row.get("lender_name", "") or "").strip() or None,
            status=status,
            start_date=start_date,
            end_date=end_date,
            due_day=due_day,
        )
        db.add(loan)
        created.append(loan_name)

    db.commit()
    return {
        "created": created,
        "errors": errors,
        "message": f"Imported {len(created)} debt(s). {len(errors)} error(s).",
    }


# ─── Full user-data JSON export ───────────────────────────────────────────────

EXPORT_SCHEMA_VERSION = "1"


def _full_export_dict(db: Session, user_id: int) -> dict:
    """Collect all user data into a single serialisable dict."""

    def _safe(v):
        if isinstance(v, (datetime, date)):
            return v.isoformat()
        return v

    def _row(obj, fields: list[str]) -> dict:
        return {f: _safe(getattr(obj, f, None)) for f in fields}

    accounts = db.query(models.Account).filter(models.Account.user_id == user_id).all()
    holdings = db.query(models.Holding).filter(models.Holding.user_id == user_id).all()
    transactions = db.query(models.Transaction).filter(models.Transaction.user_id == user_id).all()
    watchlist = db.query(models.Watchlist).filter(models.Watchlist.user_id == user_id).all()
    loans = db.query(models.Loan).filter(models.Loan.user_id == user_id).all()
    properties = db.query(models.Property).filter(models.Property.user_id == user_id).all()
    history = db.query(models.PortfolioHistory).filter(
        models.PortfolioHistory.user_id == user_id
    ).order_by(models.PortfolioHistory.history_date).all()

    return {
        "_finwise_export": True,
        "version": EXPORT_SCHEMA_VERSION,
        "exported_at": datetime.utcnow().isoformat(),
        "accounts": [_row(a, [
            "id", "account_name", "account_type", "account_number", "institution_name",
            "institution_type", "balance", "balance_date", "currency", "is_active", "created_at",
        ]) for a in accounts],
        "holdings": [_row(h, [
            "id", "account_id", "ticker", "security_name", "security_type", "shares",
            "average_cost", "purchase_date", "current_price", "current_value",
            "total_gain_loss", "total_gain_loss_percent", "dividend_yield",
            "sector", "industry", "is_active", "created_at",
        ]) for h in holdings],
        "transactions": [_row(t, [
            "id", "account_id", "holding_id", "transaction_type", "transaction_date",
            "settlement_date", "ticker", "shares", "price_per_share", "total_amount",
            "commission", "fees", "description", "reference_number", "is_reconciled", "created_at",
        ]) for t in transactions],
        "watchlist": [_row(w, [
            "id", "ticker", "company_name", "target_price", "target_direction",
            "notification_method", "notes", "alert_triggered", "created_at",
        ]) for w in watchlist],
        "loans": [_row(l, [
            "id", "loan_name", "loan_type", "original_balance", "current_balance",
            "interest_rate", "monthly_payment", "lender_name", "status",
            "start_date", "end_date", "due_day", "created_at",
        ]) for l in loans],
        "properties": [_row(p, [
            "id", "property_type", "nickname", "address", "city", "state", "zip_code",
            "country", "manual_value", "purchase_price", "purchase_date", "notes",
            "is_active", "created_at",
        ]) for p in properties],
        "portfolio_history": [_row(h, [
            "history_date", "total_assets", "total_liabilities", "total_net_worth",
            "total_investments", "total_cash", "total_retirement", "total_bank_accounts",
            "total_stock_value", "total_bond_value", "total_other_value",
            "total_ira_value", "total_401k_value", "total_mortgage",
            "total_loan_value", "total_credit_card", "created_at",
        ]) for h in history],
    }


@router.get("/export/full-data")
def export_full_data(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Export all user data as a single JSON file (holdings, accounts, transactions, history, etc.)."""
    payload = _full_export_dict(db, current_user.id)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    data = json.dumps(payload, indent=2, default=str).encode()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="finwise_full_export_{ts}.json"'},
    )


# ─── Smart full-data JSON import ─────────────────────────────────────────────

def _parse_date(v: str | None) -> date | None:
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except (ValueError, TypeError):
        return None


def _parse_float(v) -> float | None:
    try:
        return float(v) if v is not None and str(v).strip() else None
    except (ValueError, TypeError):
        return None


def _parse_int(v) -> int | None:
    try:
        return int(v) if v is not None and str(v).strip() else None
    except (ValueError, TypeError):
        return None


@router.post("/import/full-data")
async def import_full_data(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Import all user data from a Finwise JSON export file.
    - Unknown keys are silently ignored (forward-compatible).
    - Each section is imported independently; one section failing doesn't block others.
    - Accounts are matched by account_name; holdings by ticker+account; loans by loan_name;
      watchlist by ticker; properties by nickname+type; history by date (upsert).
    - Original IDs from the export are used only to resolve cross-references within the file,
      not as database IDs.
    """
    if not file.filename or not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a .json file.")
    content = await file.read()
    try:
        payload = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file.")

    # Forward-compatible: accept any JSON object that has at least one of our
    # known top-level sections. Older exports (pre-Finwise rebrand) and
    # third-party tools won't have the _finwise_export marker — that's fine
    # as long as the structure is recognizable.
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="JSON root must be an object.")
    known_sections = {
        "accounts", "holdings", "transactions", "watchlist",
        "loans", "properties", "portfolio_history",
    }
    if not (known_sections & set(payload.keys())):
        # Some exports wrap everything under a "data" key — peek there too.
        inner = payload.get("data") if isinstance(payload.get("data"), dict) else None
        if inner and (known_sections & set(inner.keys())):
            payload = inner
        else:
            raise HTTPException(
                status_code=400,
                detail=(
                    "JSON file doesn't contain any recognizable Finwise sections "
                    "(holdings, accounts, transactions, watchlist, loans, properties, "
                    "or portfolio_history). If this is from another tool, convert "
                    "the holdings list to CSV with columns: ticker, shares, average_cost."
                ),
            )

    uid = current_user.id
    summary: dict[str, dict] = {}

    # ── Accounts ──────────────────────────────────────────────────────────────
    # Build a mapping: export_id → real db id (needed to remap holding.account_id etc.)
    account_id_map: dict[int, int] = {}
    acc_created = acc_skipped = 0
    VALID_ACCT_TYPES = {
        "brokerage", "traditional_ira", "roth_ira", "401k",
        "savings", "checking", "cash_management", "hsa", "pension", "other",
    }
    for row in payload.get("accounts", []):
        name = str(row.get("account_name") or "").strip()
        if not name:
            continue
        acct_type = str(row.get("account_type") or "other").strip().lower()
        if acct_type not in VALID_ACCT_TYPES:
            acct_type = "other"
        existing = db.query(models.Account).filter(
            models.Account.user_id == uid,
            models.Account.account_name == name,
        ).first()
        if existing:
            account_id_map[row.get("id", -1)] = existing.id
            acc_skipped += 1
        else:
            a = models.Account(
                user_id=uid,
                account_name=name,
                account_type=acct_type,
                account_number=row.get("account_number") or None,
                institution_name=row.get("institution_name") or None,
                institution_type=row.get("institution_type") or None,
                balance=_parse_float(row.get("balance")) or 0.0,
                balance_date=_parse_date(row.get("balance_date")),
                currency=str(row.get("currency") or "USD"),
                is_active=bool(row.get("is_active", True)),
            )
            db.add(a)
            db.flush()
            account_id_map[row.get("id", -1)] = a.id
            acc_created += 1
    db.commit()
    summary["accounts"] = {"created": acc_created, "skipped": acc_skipped}

    # ── Holdings ──────────────────────────────────────────────────────────────
    VALID_SEC_TYPES = {
        "stock", "etf", "mutual_fund", "bond", "option",
        "cash", "crypto", "reit", "other",
    }
    holding_id_map: dict[int, int] = {}
    h_created = h_skipped = 0
    for row in payload.get("holdings", []):
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        real_acct_id = account_id_map.get(row.get("account_id", -1))
        existing = db.query(models.Holding).filter(
            models.Holding.user_id == uid,
            models.Holding.ticker == ticker,
            models.Holding.account_id == real_acct_id,
        ).first()
        if existing:
            holding_id_map[row.get("id", -1)] = existing.id
            h_skipped += 1
            continue
        sec_type = str(row.get("security_type") or "stock").strip().lower()
        if sec_type not in VALID_SEC_TYPES:
            sec_type = "stock"
        shares = _parse_float(row.get("shares")) or 0.0
        avg_cost = _parse_float(row.get("average_cost")) or 0.0
        h = models.Holding(
            user_id=uid,
            account_id=real_acct_id,
            ticker=ticker,
            security_name=row.get("security_name") or None,
            security_type=sec_type,
            shares=shares,
            average_cost=avg_cost,
            purchase_date=_parse_date(row.get("purchase_date")),
            current_price=_parse_float(row.get("current_price")),
            current_value=_parse_float(row.get("current_value")) or shares * avg_cost,
            total_gain_loss=_parse_float(row.get("total_gain_loss")),
            total_gain_loss_percent=_parse_float(row.get("total_gain_loss_percent")),
            dividend_yield=_parse_float(row.get("dividend_yield")),
            sector=row.get("sector") or None,
            industry=row.get("industry") or None,
            is_active=bool(row.get("is_active", True)),
        )
        db.add(h)
        db.flush()
        holding_id_map[row.get("id", -1)] = h.id
        h_created += 1
    db.commit()
    summary["holdings"] = {"created": h_created, "skipped": h_skipped}

    # ── Transactions ─────────────────────────────────────────────────────────
    VALID_TXN_TYPES = {
        "buy", "sell", "deposit", "withdrawal", "dividend", "interest",
        "transfer_in", "transfer_out", "split", "spin_off",
    }
    t_created = t_skipped = 0
    for row in payload.get("transactions", []):
        txn_type = str(row.get("transaction_type") or "").strip().lower()
        txn_date = _parse_date(row.get("transaction_date"))
        if txn_type not in VALID_TXN_TYPES or txn_date is None:
            t_skipped += 1
            continue
        real_acct_id = account_id_map.get(row.get("account_id", -1))
        if real_acct_id is None:
            t_skipped += 1
            continue
        real_holding_id = holding_id_map.get(row.get("holding_id", -1))
        txn = models.Transaction(
            user_id=uid,
            account_id=real_acct_id,
            holding_id=real_holding_id,
            transaction_type=txn_type,
            transaction_date=txn_date,
            settlement_date=_parse_date(row.get("settlement_date")),
            ticker=str(row.get("ticker") or "").strip().upper() or None,
            shares=_parse_float(row.get("shares")),
            price_per_share=_parse_float(row.get("price_per_share")),
            total_amount=_parse_float(row.get("total_amount")),
            commission=_parse_float(row.get("commission")) or 0.0,
            fees=_parse_float(row.get("fees")) or 0.0,
            description=row.get("description") or None,
            reference_number=row.get("reference_number") or None,
        )
        db.add(txn)
        t_created += 1
    db.commit()
    summary["transactions"] = {"created": t_created, "skipped": t_skipped}

    # ── Watchlist ─────────────────────────────────────────────────────────────
    w_created = w_skipped = 0
    for row in payload.get("watchlist", []):
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        existing = db.query(models.Watchlist).filter(
            models.Watchlist.user_id == uid,
            models.Watchlist.ticker == ticker,
        ).first()
        if existing:
            w_skipped += 1
            continue
        direction = str(row.get("target_direction") or "").strip().lower()
        if direction not in {"above", "below"}:
            direction = None  # type: ignore[assignment]
        notify = str(row.get("notification_method") or "in_app").strip()
        if notify not in {"in_app", "browser", "both"}:
            notify = "in_app"
        db.add(models.Watchlist(
            user_id=uid, ticker=ticker,
            company_name=row.get("company_name") or ticker,
            target_price=_parse_float(row.get("target_price")),
            target_direction=direction,
            notification_method=notify,
            notes=row.get("notes") or None,
            alert_triggered=bool(row.get("alert_triggered", False)),
        ))
        w_created += 1
    db.commit()
    summary["watchlist"] = {"created": w_created, "skipped": w_skipped}

    # ── Loans ─────────────────────────────────────────────────────────────────
    VALID_LOAN_TYPES = {
        "mortgage", "auto", "student", "credit_card",
        "personal", "business", "home_equity", "line_of_credit", "other",
    }
    l_created = l_skipped = 0
    for row in payload.get("loans", []):
        name = str(row.get("loan_name") or "").strip()
        if not name:
            continue
        existing = db.query(models.Loan).filter(
            models.Loan.user_id == uid,
            models.Loan.loan_name == name,
        ).first()
        if existing:
            l_skipped += 1
            continue
        loan_type = str(row.get("loan_type") or "other").strip().lower()
        if loan_type not in VALID_LOAN_TYPES:
            loan_type = "other"
        status = str(row.get("status") or "active").strip()
        if status not in {"active", "paid_off", "closed", "charged_off"}:
            status = "active"
        db.add(models.Loan(
            user_id=uid,
            loan_name=name,
            loan_type=loan_type,
            original_balance=_parse_float(row.get("original_balance")) or 0.0,
            current_balance=_parse_float(row.get("current_balance")) or 0.0,
            interest_rate=_parse_float(row.get("interest_rate")),
            monthly_payment=_parse_float(row.get("monthly_payment")),
            lender_name=row.get("lender_name") or None,
            status=status,
            start_date=_parse_date(row.get("start_date")),
            end_date=_parse_date(row.get("end_date")),
            due_day=_parse_int(row.get("due_day")),
        ))
        l_created += 1
    db.commit()
    summary["loans"] = {"created": l_created, "skipped": l_skipped}

    # ── Properties ────────────────────────────────────────────────────────────
    p_created = p_skipped = 0
    for row in payload.get("properties", []):
        prop_type = str(row.get("property_type") or "other").strip()
        nickname = str(row.get("nickname") or "").strip() or None
        existing = db.query(models.Property).filter(
            models.Property.user_id == uid,
            models.Property.property_type == prop_type,
            models.Property.nickname == nickname,
        ).first()
        if existing:
            p_skipped += 1
            continue
        db.add(models.Property(
            user_id=uid,
            property_type=prop_type,
            nickname=nickname,
            address=row.get("address") or None,
            city=row.get("city") or None,
            state=row.get("state") or None,
            zip_code=row.get("zip_code") or None,
            country=str(row.get("country") or "US"),
            manual_value=_parse_float(row.get("manual_value")),
            purchase_price=_parse_float(row.get("purchase_price")),
            purchase_date=_parse_date(row.get("purchase_date")),
            notes=row.get("notes") or None,
            is_active=bool(row.get("is_active", True)),
        ))
        p_created += 1
    db.commit()
    summary["properties"] = {"created": p_created, "skipped": p_skipped}

    # ── Portfolio history (upsert by date) ────────────────────────────────────
    ph_created = ph_updated = 0
    for row in payload.get("portfolio_history", []):
        h_date = _parse_date(row.get("history_date"))
        if h_date is None:
            continue
        existing = db.query(models.PortfolioHistory).filter(
            models.PortfolioHistory.user_id == uid,
            models.PortfolioHistory.history_date == h_date,
        ).first()
        if existing is None:
            existing = models.PortfolioHistory(user_id=uid, history_date=h_date)
            db.add(existing)
            ph_created += 1
        else:
            ph_updated += 1
        for col in [
            "total_assets", "total_liabilities", "total_net_worth", "total_investments",
            "total_cash", "total_retirement", "total_bank_accounts", "total_stock_value",
            "total_bond_value", "total_other_value", "total_ira_value", "total_401k_value",
            "total_mortgage", "total_loan_value", "total_credit_card",
        ]:
            v = _parse_float(row.get(col))
            if v is not None:
                setattr(existing, col, v)
    db.commit()
    summary["portfolio_history"] = {"created": ph_created, "updated": ph_updated}

    total_imported = sum(v.get("created", 0) for v in summary.values())
    return {
        "ok": True,
        "summary": summary,
        "message": f"Import complete — {total_imported} records created across all sections.",
    }
