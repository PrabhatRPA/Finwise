"""
Personal Finance Platform - PDF Parser
Extracts investment data from brokerage documents using pdfplumber, pytesseract, and langchain
"""

import os
import re
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any
import pdfplumber
import pytesseract
from PIL import Image
import tempfile
import logging

logger = logging.getLogger(__name__)


class PDFParser:
    """Parse brokerage documents and extract investment data."""

    def __init__(self, ollama_client=None):
        pass  # ollama_client kept for API compatibility but no longer used

    def parse_pdf(self, file_path: str) -> Dict[str, Any]:
        """
        Parse a PDF document and extract content.

        Args:
            file_path: Path to the PDF file

        Returns:
            Dictionary with extracted content
        """
        result = {
            "file_path": file_path,
            "text_pages": [],
            "tables": [],
            "raw_text": "",
            "metadata": {},
            "extraction_status": "pending",
            "error": None,
        }

        try:
            with pdfplumber.open(file_path) as pdf:
                result["metadata"] = {
                    "pages": len(pdf.pages),
                    "file_name": os.path.basename(file_path),
                    "file_size": os.path.getsize(file_path),
                    "extracted_at": datetime.utcnow().isoformat(),
                }

                for page_num, page in enumerate(pdf.pages, 1):
                    # Extract text
                    text = page.extract_text() or ""
                    result["text_pages"].append({
                        "page": page_num,
                        "text": text,
                    })
                    result["raw_text"] += text + "\n\n"

                    # Extract tables
                    tables = page.extract_tables()
                    for table_num, table in enumerate(tables, 1):
                        result["tables"].append({
                            "page": page_num,
                            "table_num": table_num,
                            "data": table,
                        })

                result["extraction_status"] = "completed"

        except Exception as e:
            logger.error(f"Error parsing PDF {file_path}: {e}")
            result["extraction_status"] = "failed"
            result["error"] = str(e)

        return result

    def parse_with_ocr(self, file_path: str) -> Dict[str, Any]:
        """
        Parse PDF using OCR for scanned documents.

        Args:
            file_path: Path to the PDF file

        Returns:
            Dictionary with OCR-extracted content
        """
        result = {
            "file_path": file_path,
            "text_pages": [],
            "raw_text": "",
            "extraction_status": "pending",
            "error": None,
        }

        try:
            with pdfplumber.open(file_path) as pdf:
                for page_num, page in enumerate(pdf.pages, 1):
                    # Convert page to image for OCR
                    bbox = page.bbox
                    IMAGING_RESOLUTION = 300
                    im = page.to_image(resolution=IMAGING_RESOLUTION)

                    # OCR the image
                    text = pytesseract.image_to_string(im.original)
                    result["text_pages"].append({
                        "page": page_num,
                        "text": text,
                    })
                    result["raw_text"] += text + "\n\n"

                result["extraction_status"] = "completed"

        except Exception as e:
            logger.error(f"Error with OCR parsing {file_path}: {e}")
            result["extraction_status"] = "failed"
            result["error"] = str(e)

        return result

    def extract_investment_data(self, parsed_content: Dict) -> List[Dict[str, Any]]:
        """
        Extract investment data from parsed PDF content.
        Always tries AI extraction first; falls back to regex patterns.
        """
        if parsed_content["extraction_status"] != "completed":
            return []

        raw_text = parsed_content.get("raw_text", "")

        # Primary: AI extraction (Claude/OpenAI/Ollama/LMStudio)
        ai_results = self._extract_with_ai(raw_text)
        if ai_results:
            return ai_results

        # Fallback: regex patterns
        return self._extract_with_patterns(raw_text)

    def _extract_with_patterns(self, text: str) -> List[Dict[str, Any]]:
        """Extract investment data using regex patterns."""

        investments = []

        # Pattern for common brokerage line items
        # Matches lines like: AAPL 10 $150.00 $1500.00 or similar
        patterns = [
            # Ticker symbol followed by shares and price
            r'([A-Z]{1,6})(?:\.[A-Z]{1,4})?\s+(\d+(?:\.\d+)?)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)',
            # Alternative format: symbol, quantity, price
            r'([A-Z]{1,6})\s+(\d+)\s+\$([\d,]+\.?\d*)',
        ]

        lines = text.split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            for pattern in patterns:
                matches = re.finditer(pattern, line, re.IGNORECASE)
                for match in matches:
                    investment = self._parse_investment_match(match, line)
                    if investment and investment not in investments:
                        investments.append(investment)

        return investments

    def _parse_investment_match(self, match, line: str) -> Optional[Dict[str, Any]]:
        """Parse a regex match into an investment dictionary."""

        groups = match.groups()

        # Different pattern lengths
        if len(groups) >= 4:
            ticker = groups[0]
            shares = float(groups[1])
            purchase_price = float(groups[2].replace(',', ''))
            current_value = float(groups[3].replace(',', ''))
        elif len(groups) >= 3:
            ticker = groups[0]
            shares = float(groups[1])
            purchase_price = float(groups[2].replace(',', ''))
            current_value = shares * purchase_price
        else:
            return None

        return {
            "ticker": ticker.upper(),
            "shares": shares,
            "purchase_price": purchase_price,
            "current_value": round(current_value, 2),
            "purchase_date": None,  # Would need date parsing
            "account_name": None,
            "security_type": "stock",
            "source_line": line[:100],
        }

    def _extract_with_ai(self, text: str) -> List[Dict[str, Any]]:
        """Use the configured AI provider to extract investment data from text."""
        from app.ai.ai_client import ai_client

        prompt = f"""Extract all investment holdings from this financial document.

Return ONLY a valid JSON array. Each element must have:
- ticker: stock ticker symbol (e.g. AAPL, MSFT, VTI) — uppercase, required
- shares: number of shares owned (numeric, required)
- average_cost: average cost/purchase price per share (numeric, use 0 if unknown)
- security_type: one of stock | etf | mutual_fund | bond | crypto | reit (default: stock)
- purchase_date: date in YYYY-MM-DD format or null

If you cannot find any holdings, return an empty array [].
Do NOT include any explanation or markdown — output only the JSON array.

Document:
{text[:6000]}"""

        try:
            response = ai_client.generate(
                prompt=prompt,
                system_prompt="You are a financial data extraction assistant. Extract structured investment data from documents and return only valid JSON.",
                temperature=0.0,
            )
            content = response.get("response", "").strip()

            # Strip markdown fences if present
            if content.startswith("```"):
                content = re.sub(r"^```[a-z]*\n?", "", content)
                content = re.sub(r"\n?```$", "", content)
                content = content.strip()

            investments = json.loads(content)
            if not isinstance(investments, list):
                return []

            validated = []
            for inv in investments:
                ticker = str(inv.get("ticker", "")).strip().upper()
                shares = inv.get("shares")
                if ticker and shares is not None:
                    validated.append({
                        "ticker": ticker,
                        "shares": float(shares),
                        "average_cost": float(inv.get("average_cost", inv.get("purchase_price", 0)) or 0),
                        "security_type": inv.get("security_type", "stock"),
                        "purchase_date": inv.get("purchase_date"),
                    })
            return validated

        except Exception as e:
            logger.error(f"AI extraction error: {e}")
            return []

    def _extract_with_llm(self, text: str) -> List[Dict[str, Any]]:
        """Kept for backwards compatibility — delegates to _extract_with_ai."""
        return self._extract_with_ai(text)

    def parse_1099_b(self, file_path: str) -> Dict[str, Any]:
        """
        Parse a 1099-B form (Brokerage Proceeds).

        Args:
            file_path: Path to the 1099-B PDF

        Returns:
            Dictionary with 1099-B data
        """
        result = {
            "document_type": "1099_b",
            "proceeds": [],
            "cost_basis": [],
            "summary": {},
        }

        parsed = self.parse_pdf(file_path)

        if parsed["extraction_status"] != "completed":
            return result

        text = parsed["raw_text"]

        # Look for total proceeds
        proceeds_match = re.search(r'Gross\s+Proceeds?\s*\$?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
        if proceeds_match:
            result["summary"]["gross_proceeds"] = float(proceeds_match.group(1).replace(',', ''))

        # Look for cost basis
        cost_match = re.search(r'Cost\s+or\s+Basis\s*\$?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
        if cost_match:
            result["summary"]["cost_basis"] = float(cost_match.group(1).replace(',', ''))

        return result

    def parse_1099_div(self, file_path: str) -> Dict[str, Any]:
        """
        Parse a 1099-DIV form (Dividend and Distribution).

        Args:
            file_path: Path to the 1099-DIV PDF

        Returns:
            Dictionary with 1099-DIV data
        """
        result = {
            "document_type": "1099_div",
            "dividends": [],
            "summary": {},
        }

        parsed = self.parse_pdf(file_path)

        if parsed["extraction_status"] != "completed":
            return result

        text = parsed["raw_text"]

        # Look for ordinary dividends
        div_match = re.search(r'Ordinary\s+Dividends\s*\$?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
        if div_match:
            result["summary"]["ordinary_dividends"] = float(div_match.group(1).replace(',', ''))

        # Look for qualified dividends
        qualified_match = re.search(r'Qualified\s+Dividends\s*\$?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
        if qualified_match:
            result["summary"]["qualified_dividends"] = float(qualified_match.group(1).replace(',', ''))

        return result

    def calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of a file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def parse_image(self, file_path: str) -> Dict[str, Any]:
        """
        OCR a PNG/JPG/JPEG image and return a parsed-content dict compatible
        with extract_investment_data().  Uses pytesseract for OCR then the
        same AI extraction pipeline as PDFs.
        """
        result: Dict[str, Any] = {
            "file_path": file_path,
            "text_pages": [],
            "raw_text": "",
            "extraction_status": "pending",
            "error": None,
        }
        try:
            img = Image.open(file_path)

            # Convert palette / RGBA images so pytesseract handles them cleanly
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            # Scale up small images for better OCR accuracy
            min_dim = 1200
            w, h = img.size
            if max(w, h) < min_dim:
                scale = min_dim / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

            text = pytesseract.image_to_string(img, config="--psm 6")
            result["text_pages"].append({"page": 1, "text": text})
            result["raw_text"] = text
            result["extraction_status"] = "completed"
        except Exception as e:
            logger.error(f"Image OCR failed for {file_path}: {e}")
            result["extraction_status"] = "failed"
            result["error"] = str(e)
        return result

    def parse_document(self, file_path: str, document_type: str) -> Dict[str, Any]:
        """
        Main entry point — parse any supported document type and return a
        normalised result with an 'investments' list, 'file_hash',
        'extraction_status', and optional 'error'.
        """
        result = {
            "investments": [],
            "file_hash": "",
            "extraction_status": "failed",
            "error": None,
        }

        try:
            result["file_hash"] = self.calculate_file_hash(file_path)
        except Exception as e:
            result["error"] = f"Could not hash file: {e}"
            return result

        # ── Image files (PNG / JPG) ───────────────────────────────────────────
        ext = Path(file_path).suffix.lower()
        if ext in (".png", ".jpg", ".jpeg", ".webp"):
            try:
                parsed = self.parse_image(file_path)
                if parsed["extraction_status"] != "completed":
                    result["error"] = parsed.get("error", "Image OCR failed")
                    return result
                investments = self.extract_investment_data(parsed)
                result["investments"] = investments
                result["extraction_status"] = "completed"
            except Exception as e:
                logger.error(f"Image parse error for {file_path}: {e}")
                result["error"] = str(e)
            return result

        try:
            # Use specialised parsers for tax forms; generic for everything else
            if document_type == "1099_b":
                parsed = self.parse_pdf(file_path)
                investments = self.extract_investment_data(parsed)
                result["investments"] = investments
                result["extraction_status"] = "completed" if parsed["extraction_status"] == "completed" else "failed"
                result["error"] = parsed.get("error")

            elif document_type == "1099_div":
                parsed = self.parse_pdf(file_path)
                investments = self.extract_investment_data(parsed)
                result["investments"] = investments
                result["extraction_status"] = "completed" if parsed["extraction_status"] == "completed" else "failed"
                result["error"] = parsed.get("error")

            else:
                # Brokerage statement, 401k, Roth IRA, tax return, etc.
                parsed = self.parse_pdf(file_path)

                # Fall back to OCR if text extraction yielded nothing
                if not parsed["raw_text"].strip() and parsed["extraction_status"] == "completed":
                    parsed = self.parse_with_ocr(file_path)

                if parsed["extraction_status"] != "completed":
                    result["error"] = parsed.get("error", "PDF parsing failed")
                    return result

                investments = self.extract_investment_data(parsed)
                result["investments"] = investments
                result["extraction_status"] = "completed"

        except Exception as e:
            logger.error(f"Error in parse_document for {file_path}: {e}")
            result["error"] = str(e)

        return result


def parse_document(file_path: str, document_type: str = "brokerage_statement") -> Dict[str, Any]:
    """
    Convenience function to parse a document.

    Args:
        file_path: Path to the document
        document_type: Type of document being parsed

    Returns:
        Dictionary with parsed data
    """
    parser = PDFParser()

    if document_type == "1099_b":
        return parser.parse_1099_b(file_path)
    elif document_type == "1099_div":
        return parser.parse_1099_div(file_path)
    else:
        parsed = parser.parse_pdf(file_path)
        parsed["investments"] = parser.extract_investment_data(parsed)
        return parsed
