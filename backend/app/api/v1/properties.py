"""
Personal Finance Platform - Properties API
Track real-estate assets with optional Rentcast AVM valuation.
"""

import httpx
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.db import models
from app.core.auth_deps import get_current_user
from app.core.config import RENTCAST_API_KEY

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_TYPES = {
    "single_family", "condo", "apartment", "townhouse",
    "land", "commercial", "multi_family", "mobile_home", "other",
}

# Rentcast AVM endpoint — free plan: 50 req/month, no CC required
# Docs: https://developers.rentcast.io/reference/value-estimate
RENTCAST_AVM_URL = "https://api.rentcast.io/v1/avm/value"

# Rentcast property type mapping
_RENTCAST_TYPES = {
    "single_family": "Single Family",
    "condo": "Condo",
    "apartment": "Apartment",
    "townhouse": "Townhouse",
    "multi_family": "Multi Family",
    "land": "Land",
    "commercial": "Commercial",
    "mobile_home": "Mobile Home",
    "other": "Single Family",  # best-effort fallback
}


class PropertyCreate(BaseModel):
    property_type: str = "single_family"
    nickname: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "US"
    manual_value: Optional[float] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[str] = None   # YYYY-MM-DD
    notes: Optional[str] = None


class PropertyUpdate(BaseModel):
    property_type: Optional[str] = None
    nickname: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    manual_value: Optional[float] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[str] = None
    notes: Optional[str] = None


def _to_dict(p: models.Property) -> dict:
    equity = 0.0
    if p.current_value and p.purchase_price:
        equity = p.current_value - float(p.purchase_price)

    return {
        "id": p.id,
        "user_id": p.user_id,
        "property_type": p.property_type,
        "nickname": p.nickname,
        "address": p.address,
        "city": p.city,
        "state": p.state,
        "zip_code": p.zip_code,
        "country": p.country,
        "manual_value": float(p.manual_value) if p.manual_value is not None else None,
        "estimated_value": float(p.estimated_value) if p.estimated_value is not None else None,
        "current_value": p.current_value,
        "valuation_source": p.valuation_source,
        "last_estimated_at": p.last_estimated_at.isoformat() if p.last_estimated_at else None,
        "purchase_price": float(p.purchase_price) if p.purchase_price is not None else None,
        "purchase_date": p.purchase_date.isoformat() if p.purchase_date else None,
        "equity": round(equity, 2),
        "notes": p.notes,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _full_address(p: models.Property) -> Optional[str]:
    """Build a single-line address string for the Rentcast API."""
    parts = [p.address]
    if p.city:
        parts.append(p.city)
    if p.state:
        parts.append(p.state)
    if p.zip_code:
        parts.append(p.zip_code)
    addr = ", ".join(x for x in parts if x)
    return addr or None


def _fetch_rentcast_value(address: str, property_type: str) -> Optional[float]:
    """
    Call Rentcast AVM (automated valuation model) and return the price estimate.
    Returns None if the API key is not set, the address is unknown, or the call fails.
    """
    if not RENTCAST_API_KEY:
        return None

    rentcast_type = _RENTCAST_TYPES.get(property_type, "Single Family")
    try:
        resp = httpx.get(
            RENTCAST_AVM_URL,
            params={"address": address, "propertyType": rentcast_type},
            headers={"X-Api-Key": RENTCAST_API_KEY},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            price = data.get("price") or data.get("priceRangeLow")
            if price:
                return float(price)
        elif resp.status_code == 404:
            logger.info(f"Rentcast: property not found for address '{address}'")
        else:
            logger.warning(f"Rentcast API returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Rentcast fetch error: {e}")
    return None


# ─── CRUD ────────────────────────────────────────────────────────────────────

@router.get("/properties")
def list_properties(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    props = (
        db.query(models.Property)
        .filter(models.Property.user_id == current_user.id, models.Property.is_active == True)
        .order_by(models.Property.created_at.desc())
        .all()
    )
    total = sum(p.current_value for p in props)
    return {
        "properties": [_to_dict(p) for p in props],
        "total_value": round(total, 2),
        "count": len(props),
        "rentcast_configured": bool(RENTCAST_API_KEY),
    }


@router.post("/properties", status_code=201)
def create_property(
    body: PropertyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.property_type not in VALID_TYPES:
        raise HTTPException(400, f"property_type must be one of: {', '.join(sorted(VALID_TYPES))}")

    from datetime import date as date_type
    purchase_date = None
    if body.purchase_date:
        try:
            purchase_date = date_type.fromisoformat(body.purchase_date)
        except ValueError:
            raise HTTPException(400, "purchase_date must be YYYY-MM-DD")

    prop = models.Property(
        user_id=current_user.id,
        property_type=body.property_type,
        nickname=body.nickname,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
        country=body.country,
        manual_value=body.manual_value,
        purchase_price=body.purchase_price,
        purchase_date=purchase_date,
        notes=body.notes,
        valuation_source="manual" if body.manual_value else None,
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)

    # Auto-fetch Rentcast estimate if address is present and no manual value was given
    if not body.manual_value and _full_address(prop):
        estimate = _fetch_rentcast_value(_full_address(prop), prop.property_type)
        if estimate:
            prop.estimated_value = estimate
            prop.last_estimated_at = datetime.utcnow()
            prop.valuation_source = "rentcast"
            db.commit()
            db.refresh(prop)

    return _to_dict(prop)


@router.put("/properties/{prop_id}")
def update_property(
    prop_id: int,
    body: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prop = db.query(models.Property).filter(
        models.Property.id == prop_id,
        models.Property.user_id == current_user.id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")

    from datetime import date as date_type
    if body.property_type is not None:
        if body.property_type not in VALID_TYPES:
            raise HTTPException(400, "Invalid property_type")
        prop.property_type = body.property_type
    if body.nickname is not None:
        prop.nickname = body.nickname
    if body.address is not None:
        prop.address = body.address
    if body.city is not None:
        prop.city = body.city
    if body.state is not None:
        prop.state = body.state
    if body.zip_code is not None:
        prop.zip_code = body.zip_code
    if body.country is not None:
        prop.country = body.country
    if body.manual_value is not None:
        prop.manual_value = body.manual_value
        prop.valuation_source = "manual"
    if body.purchase_price is not None:
        prop.purchase_price = body.purchase_price
    if body.purchase_date is not None:
        try:
            prop.purchase_date = date_type.fromisoformat(body.purchase_date)
        except ValueError:
            raise HTTPException(400, "purchase_date must be YYYY-MM-DD")
    if body.notes is not None:
        prop.notes = body.notes

    db.commit()
    db.refresh(prop)
    return _to_dict(prop)


@router.delete("/properties/{prop_id}")
def delete_property(
    prop_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    prop = db.query(models.Property).filter(
        models.Property.id == prop_id,
        models.Property.user_id == current_user.id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")
    db.delete(prop)
    db.commit()
    return {"ok": True, "id": prop_id}


@router.post("/properties/{prop_id}/refresh-value")
def refresh_property_value(
    prop_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Fetch a fresh Rentcast AVM estimate for a property."""
    prop = db.query(models.Property).filter(
        models.Property.id == prop_id,
        models.Property.user_id == current_user.id,
    ).first()
    if not prop:
        raise HTTPException(404, "Property not found")
    if not RENTCAST_API_KEY:
        raise HTTPException(400, "Rentcast API key not configured. Add RENTCAST_API_KEY to backend/.env")

    addr = _full_address(prop)
    if not addr:
        raise HTTPException(400, "Property has no address — add street address, city, and state first")

    estimate = _fetch_rentcast_value(addr, prop.property_type)
    if estimate is None:
        raise HTTPException(502, "Rentcast could not find a value for this address. Check the address and try again.")

    prop.estimated_value = estimate
    prop.last_estimated_at = datetime.utcnow()
    if not prop.manual_value:
        prop.valuation_source = "rentcast"
    db.commit()
    db.refresh(prop)
    return {**_to_dict(prop), "refreshed": True}
