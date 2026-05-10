"""
Personal Finance Platform - API Package
RESTful API endpoints for all features
"""

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.core.config import APP_TITLE, CORS_ORIGINS
from app.db import get_db

# Create main FastAPI app
app = FastAPI(title=APP_TITLE, version="0.1.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
from app.api.v1 import holdings, accounts, transactions, documents, market, ai, net_worth, loans, auth, watchlist, data_management, properties

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(holdings.router, prefix="/api/v1", tags=["holdings"])
app.include_router(accounts.router, prefix="/api/v1", tags=["accounts"])
app.include_router(transactions.router, prefix="/api/v1", tags=["transactions"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
app.include_router(market.router, prefix="/api/v1", tags=["market-data"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
app.include_router(net_worth.router, prefix="/api/v1", tags=["net-worth"])
app.include_router(loans.router, prefix="/api/v1", tags=["loans"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(data_management.router, prefix="/api/v1", tags=["data-management"])
app.include_router(properties.router, prefix="/api/v1", tags=["properties"])


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": APP_TITLE,
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Mount static files for frontend
try:
    from fastapi.templating import Jinja2Templates
    app.mount("/static", StaticFiles(directory="frontend/dist"), name="static")
    templates = Jinja2Templates(directory="frontend/dist")
except Exception:
    pass
