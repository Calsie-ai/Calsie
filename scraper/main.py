import os
import math
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Applix Scraper Worker")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


class RunResponse(BaseModel):
    campaigns_processed: int
    batches_created: int
    leads_saved: int


def supabase_headers() -> Dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Missing Supabase environment variables")
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def supabase_get(path: str) -> Any:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=supabase_headers())
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=response.text)
        return response.json()


async def supabase_post(path: str, payload: Any) -> Any:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=supabase_headers(), json=payload)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=response.text)
        return response.json()


async def supabase_patch(path: str, payload: Any) -> Any:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.patch(f"{SUPABASE_URL}/rest/v1/{path}", headers=supabase_headers(), json=payload)
        if response.status_code >= 400:
            raise HTTPException(status_code=500, detail=response.text)
        return response.json()


def normalize_text(value: str) -> str:
    return " ".join((value or "").lower().strip().split())


def make_duplicate_key(campaign_id: str, company_name: str, address: str) -> str:
    raw = f"{campaign_id}|{normalize_text(company_name)}|{normalize_text(address)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def role_strategy(target_role: str, industry: str) -> List[Dict[str, str]]:
    role = normalize_text(target_role)
    industry_text = normalize_text(industry)

    if any(word in role for word in ["accountant", "accounting", "bookkeeper", "payroll", "finance"]):
        direct = ["accounting firm", "bookkeeping service", "tax agent", "payroll service", "business advisory firm"]
        demand = ["construction company", "real estate agency", "medical centre", "NDIS provider", "logistics company", "retail head office", "school", "law firm"]
    elif any(word in role for word in ["support worker", "disability", "aged care", "care worker"]):
        direct = ["NDIS provider", "disability support provider", "aged care provider", "community care provider", "home care provider"]
        demand = ["medical centre", "allied health clinic", "community organisation", "care agency"]
    elif any(word in role for word in ["admin", "reception", "office"]):
        direct = ["administration service", "recruitment agency", "business support service"]
        demand = ["medical centre", "real estate agency", "law firm", "accounting firm", "construction company", "school", "dental clinic"]
    elif any(word in role for word in ["data", "analyst", "business analyst", "reporting"]):
        direct = ["data analytics company", "business intelligence consultancy", "software company", "IT consulting company"]
        demand = ["finance company", "investment company", "trading company", "logistics company", "healthcare company", "retail head office"]
    else:
        direct = [industry_text or target_role, f"{target_role} services", f"{industry_text} company" if industry_text else "local business"]
        demand = ["medium business", "professional services firm", "local company", "business office"]

    rows: List[Dict[str, str]] = []
    for category in direct:
        if category:
            rows.append({"batch_type": "direct_company", "business_category": category})
    for category in demand:
        if category:
            rows.append({"batch_type": "role_demand_business", "business_category": category})
    return rows


def build_batches(campaign: Dict[str, Any]) -> List[Dict[str, Any]]:
    target_role = campaign.get("target_role") or ""
    industry = campaign.get("industry") or ""
    area = campaign.get("selected_address") or ""
    radius = campaign.get("radius_km") or 20
    strategies = role_strategy(target_role, industry)

    batches = []
    for item in strategies:
        category = item["business_category"]
        query = f"{category} near {area}"
        batches.append({
            "campaign_id": campaign["id"],
            "user_id": campaign.get("user_id"),
            "batch_type": item["batch_type"],
            "search_query": query,
            "target_role": target_role,
            "business_category": category,
            "search_area": area,
            "radius_km": radius,
            "status": "queued",
            "raw_data": {"source": "applix_strategy_v1"},
        })
    return batches


def fake_offset(index: int, radius_km: float) -> float:
    return min(radius_km * 0.75, 1 + index * 1.7)


def demo_leads_for_batch(campaign: Dict[str, Any], batch: Dict[str, Any], limit: int = 3) -> List[Dict[str, Any]]:
    # Safe placeholder records so we can test Supabase pipeline before enabling real Google Places scraping.
    center_lat = float(campaign.get("latitude") or 0)
    center_lng = float(campaign.get("longitude") or 0)
    category = batch["business_category"]
    leads = []
    for index in range(limit):
        distance = round(fake_offset(index, float(campaign.get("radius_km") or 20)), 2)
        company_name = f"Demo {category.title()} Lead {index + 1}"
        address = campaign.get("selected_address") or "Selected area"
        leads.append({
            "campaign_id": campaign["id"],
            "search_batch_id": batch.get("id"),
            "user_id": campaign.get("user_id"),
            "company_name": company_name,
            "business_category": category,
            "industry_guess": campaign.get("industry"),
            "website": None,
            "domain": None,
            "address": address,
            "phone": None,
            "google_place_id": None,
            "latitude": center_lat,
            "longitude": center_lng,
            "distance_km": distance,
            "source": "demo_batch_generator",
            "source_url": None,
            "raw_data": {"search_query": batch.get("search_query"), "demo": True},
            "relevance_score": 70 if batch.get("batch_type") == "role_demand_business" else 88,
            "relevance_reason": f"{batch.get('batch_type')} match for {campaign.get('target_role')} within selected radius",
            "duplicate_key": make_duplicate_key(campaign["id"], company_name, address),
            "status": "new",
        })
    return leads


@app.get("/")
async def root() -> Dict[str, str]:
    return {"status": "ok", "service": "applix-scraper"}


@app.post("/run-daily", response_model=RunResponse)
async def run_daily() -> RunResponse:
    campaigns = await supabase_get("campaigns?select=*&status=in.(queued,active)&order=created_at.asc&limit=25")
    campaigns_processed = 0
    batches_created = 0
    leads_saved = 0

    for campaign in campaigns:
        campaigns_processed += 1
        campaign_id = campaign["id"]
        now = datetime.now(timezone.utc).isoformat()

        await supabase_patch(f"campaigns?id=eq.{campaign_id}", {"status": "scraping", "started_at": campaign.get("started_at") or now})

        batches = build_batches(campaign)
        saved_batches = await supabase_post("campaign_search_batches?on_conflict=campaign_id,search_query", batches)
        batches_created += len(saved_batches)

        for batch in saved_batches:
            leads = demo_leads_for_batch(campaign, batch, limit=2)
            try:
                saved_leads = await supabase_post("company_leads", leads)
                leads_saved += len(saved_leads)
                await supabase_patch(f"campaign_search_batches?id=eq.{batch['id']}", {
                    "status": "processed",
                    "results_found": len(leads),
                    "results_saved": len(saved_leads),
                    "processed_at": now,
                })
            except HTTPException as exc:
                await supabase_patch(f"campaign_search_batches?id=eq.{batch['id']}", {
                    "status": "failed",
                    "error_message": str(exc.detail),
                    "processed_at": now,
                })

        await supabase_patch(f"campaigns?id=eq.{campaign_id}", {"status": "scraped", "total_scraped": leads_saved})
        await supabase_post("campaign_events", {
            "campaign_id": campaign_id,
            "user_id": campaign.get("user_id"),
            "event_type": "scrape_completed",
            "event_title": "Daily scrape completed",
            "event_message": f"Created batches and saved {leads_saved} demo leads.",
            "event_data": {"batches_created": batches_created, "leads_saved": leads_saved},
        })

    return RunResponse(campaigns_processed=campaigns_processed, batches_created=batches_created, leads_saved=leads_saved)
