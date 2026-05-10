"""
Personal Finance Platform - Documents API
Endpoints for document upload and processing
"""

import os
import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime

from app.db import get_db
from app.db import models
from app.agents.parsers.pdf_parser import PDFParser
from app.core.config import UPLOAD_DIR
from app.core.auth_deps import get_current_user

router = APIRouter()


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    document_type: str = Form("brokerage_statement"),
    account_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Upload a document for processing."""
    valid_types = [
        "1099_b", "1099_div", "1099_int", "1099_rmd",
        "brokerage_statement", "bank_statement", "loan_statement",
        "tax_return", "other"
    ]
    if document_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type. Must be one of: {valid_types}"
        )

    file_extension = os.path.splitext(file.filename)[1].lower()
    allowed_extensions = {".pdf", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".webp"}
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Supported: PDF, CSV, TXT, PNG, JPG, JPEG, WEBP.",
        )

    user_upload_dir = UPLOAD_DIR / str(current_user.id)
    user_upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}{file_extension}"
    file_path = user_upload_dir / filename

    # Save file
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

    document = models.Document(
        user_id=current_user.id,
        account_id=account_id,
        document_type=document_type,
        document_name=file.filename,
        document_path=str(file_path),
        file_size_bytes=os.path.getsize(file_path),
        file_hash="",  # Will be calculated
        extraction_status="pending",
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    # Process document
    parser = PDFParser()
    result = parser.parse_document(str(file_path), document_type)

    # Update document with results
    document.file_hash = result.get("file_hash", "")
    document.extraction_status = result.get("extraction_status", "failed")
    document.processed_date = datetime.utcnow()

    if result.get("investments"):
        document.extracted_data = json.dumps({"investments": result["investments"]})

    if result.get("error"):
        document.error_message = result["error"]

    db.commit()

    return {
        "document_id": document.id,
        "document_name": file.filename,
        "extraction_status": document.extraction_status,
        "investments_extracted": len(result.get("investments", [])),
        "error": result.get("error"),
    }


@router.get("/documents")
async def get_documents(
    db: Session = Depends(get_db),
    document_type: Optional[str] = None,
    extraction_status: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
):
    """Get all documents with optional filters."""
    query = db.query(models.Document).filter(models.Document.user_id == current_user.id)

    if document_type:
        query = query.filter(models.Document.document_type == document_type)
    if extraction_status:
        query = query.filter(models.Document.extraction_status == extraction_status)

    documents = query.order_by(models.Document.upload_date.desc()).all()

    return {"documents": [document_to_dict(d) for d in documents], "count": len(documents)}


@router.get("/documents/{document_id}")
async def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a specific document by ID."""
    document = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return document_to_dict(document)


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a document."""
    document = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file
    file_path = document.document_path
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    db.delete(document)
    db.commit()

    return {"message": "Document deleted successfully"}


@router.post("/documents/{document_id}/process")
async def process_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Manually process a document."""
    document = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if document.extraction_status == "completed":
        return {"message": "Document already processed"}

    parser = PDFParser()
    result = parser.parse_document(document.document_path, document.document_type)

    # Update document
    document.extraction_status = result.get("extraction_status", "failed")
    document.processed_date = datetime.utcnow()
    document.error_message = result.get("error")

    if result.get("investments"):
        document.extracted_data = json.dumps({"investments": result["investments"]})
        for investment in result["investments"]:
            existing = db.query(models.Holding).filter(
                models.Holding.account_id == document.account_id,
                models.Holding.ticker == investment.get("ticker", "").upper(),
            ).first()

            if not existing:
                holding = models.Holding(
                    account_id=document.account_id,
                    user_id=current_user.id,
                    ticker=investment.get("ticker", "").upper(),
                    shares=investment.get("shares", 0),
                    average_cost=investment.get("purchase_price", 0),
                    security_type=investment.get("security_type", "stock"),
                    purchase_date=investment.get("purchase_date"),
                    current_value=investment.get("current_value", 0),
                )
                db.add(holding)

    db.commit()

    return {
        "document_id": document.id,
        "extraction_status": document.extraction_status,
        "investments_extracted": len(result.get("investments", [])),
    }


@router.post("/documents/{document_id}/import-holdings")
async def import_holdings_from_document(
    document_id: int,
    holdings_data: List[dict],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Import (user-reviewed) holdings from a processed document into the holdings table.
    Expects a list of objects: {ticker, shares, average_cost, security_type, account_id}.
    account_id=null means no account linked (N/A).
    """
    document = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    created = []
    skipped = []

    for item in holdings_data:
        ticker = str(item.get("ticker", "")).strip().upper()
        if not ticker:
            continue

        shares = float(item.get("shares", 0) or 0)
        average_cost = float(item.get("average_cost", 0) or 0)
        security_type = item.get("security_type", "stock") or "stock"
        account_id = item.get("account_id")  # None = N/A

        # Avoid duplicate tickers for the same account (or null account)
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
            shares=shares,
            average_cost=average_cost,
            security_type=security_type,
            current_value=shares * average_cost,
        )
        db.add(holding)
        created.append(ticker)

    db.commit()

    return {
        "created": created,
        "skipped": skipped,
        "message": f"Imported {len(created)} holding(s). Skipped {len(skipped)} duplicate(s).",
    }


def document_to_dict(document: models.Document) -> dict:
    """Convert Document model to dict."""
    return {
        "id": document.id,
        "user_id": document.user_id,
        "account_id": document.account_id,
        "document_type": document.document_type,
        "document_name": document.document_name,
        "document_path": document.document_path,
        "file_size_bytes": document.file_size_bytes,
        "file_hash": document.file_hash,
        "upload_date": document.upload_date.isoformat() if document.upload_date else None,
        "processed_date": document.processed_date.isoformat() if document.processed_date else None,
        "extraction_status": document.extraction_status,
        "extracted_data": json.loads(document.extracted_data) if document.extracted_data else None,
        "error_message": document.error_message,
        "created_at": document.created_at.isoformat() if document.created_at else None,
    }
