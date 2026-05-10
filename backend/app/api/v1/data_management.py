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
        rows.append({
            "ticker": h.ticker or "",
            "security_name": h.security_name or "",
            "security_type": h.security_type or "stock",
            "shares": h.shares or 0,
            "average_cost": h.average_cost or 0,
            "current_price": h.current_price or 0,
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
    "current_price", "current_value", "total_gain_loss", "total_gain_loss_percent",
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

def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")  # strip BOM if present
    reader = csv.DictReader(io.StringIO(text))
    return [row for row in reader]


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
