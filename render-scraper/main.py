from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urljoin, quote_plus
import re
import requests
from bs4 import BeautifulSoup

app = FastAPI(title="Applix Render Scraper")

HEADERS = {
    "User-Agent": "ApplixJobAssistant/0.1 (+https://applix.app; contact: admin@applix.app)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

PREFERRED_PREFIXES = ["careers", "recruitment", "jobs", "hr", "talent", "people"]
FALLBACK_PREFIXES = ["info", "admin", "contact", "hello"]
PATHS_TO_CHECK = ["/careers", "/career", "/jobs", "/join-us", "/work-with-us", "/contact", "/about"]
DEEP_PATHS_TO_CHECK = [
    "/careers", "/career", "/jobs", "/join-us", "/work-with-us", "/contact", "/about", "/team",
    "/people", "/recruitment", "/vacancies", "/employment", "/opportunities", "/contact-us"
]

class JobPayload(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    applyUrl: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    salary: Optional[str] = None
    type: Optional[str] = None
    match: Optional[int] = None

class EmailReadyJobsPayload(BaseModel):
    jobs: List[JobPayload]
    limit: Optional[int] = 8
    deep: Optional[bool] = False

class ContactDiscoveryPayload(BaseModel):
    jobTitle: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    applyUrl: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    specialisation: Optional[str] = None

@app.get("/")
def health():
    return {"ok": True, "service": "applix-render-scraper"}

@app.post("/email-ready-jobs")
def email_ready_jobs(payload: EmailReadyJobsPayload):
    max_limit = 20 if payload.deep else 12
    limit = max(1, min(payload.limit or 8, max_limit))
    checked_jobs = payload.jobs[:limit]
    email_ready = []
    gateway_jobs = []

    for job in checked_jobs:
        result = discover_for_job(
            apply_url=job.applyUrl,
            description=job.description,
            company=job.company,
            job_title=job.title,
            location=job.location,
            deep=bool(payload.deep),
        )

        enriched = job.model_dump()
        enriched.update({
            "contactEmail": result.get("hiringEmail"),
            "hiringEmail": result.get("hiringEmail"),
            "contactConfidence": result.get("contactConfidence"),
            "applicationMethod": result.get("applicationMethod"),
            "sourceUrl": result.get("sourceUrl"),
            "contactNotes": result.get("notes", []),
        })

        if result.get("hiringEmail"):
            email_ready.append(enriched)
        elif result.get("sourceUrl"):
            gateway_jobs.append(enriched)

    return {
        "ok": True,
        "checked": len(checked_jobs),
        "deep": bool(payload.deep),
        "emailReadyCount": len(email_ready),
        "gatewayCount": len(gateway_jobs),
        "jobs": email_ready,
        "gatewayJobs": gateway_jobs,
        "message": f"Found {len(email_ready)} email-ready jobs from {len(checked_jobs)} checked jobs.",
    }

@app.post("/contact-discovery")
def contact_discovery(payload: ContactDiscoveryPayload):
    return discover_for_job(
        apply_url=payload.applyUrl,
        description=payload.description,
        company=payload.company,
        job_title=payload.jobTitle,
        location=payload.location,
        deep=True,
    )

def discover_for_job(
    apply_url: Optional[str],
    description: Optional[str],
    company: Optional[str],
    job_title: Optional[str],
    location: Optional[str],
    deep: bool = False,
) -> Dict[str, Any]:
    description_email = best_email(description or "")
    if description_email:
        return result_email(description_email, apply_url, ["Found public email in job description."])

    urls = candidate_urls(apply_url, company, job_title, location, deep)
    pages_checked = []
    emails_found = []
    linked_limit = 10 if deep else 4

    for url in urls:
        text = fetch_page_text(url)
        if not text:
            continue
        pages_checked.append(url)
        emails_found.extend(extract_emails(text))
        linked_pages = extract_candidate_links(text, url)
        for linked_url in linked_pages[:linked_limit]:
            linked_text = fetch_page_text(linked_url)
            if linked_text:
                pages_checked.append(linked_url)
                emails_found.extend(extract_emails(linked_text))

    selected_email = choose_best_email(emails_found)
    if selected_email:
        return result_email(selected_email, pages_checked[0] if pages_checked else apply_url, [
            "Found public hiring/contact email while checking employer pages.",
            f"Checked {len(pages_checked)} page(s).",
            "Deep search was used." if deep else "Standard search was used.",
        ])

    if apply_url:
        return {
            "ok": True,
            "status": "found_apply_link",
            "applicationMethod": "apply_link",
            "hiringEmail": None,
            "contactConfidence": "none",
            "sourceUrl": apply_url,
            "notes": ["No public hiring email found. Use the application gateway."]
        }

    return {
        "ok": True,
        "status": "not_found",
        "applicationMethod": "unknown",
        "hiringEmail": None,
        "contactConfidence": "none",
        "sourceUrl": None,
        "notes": ["No public hiring email or application gateway found."]
    }

def candidate_urls(apply_url: Optional[str], company: Optional[str], job_title: Optional[str], location: Optional[str], deep: bool) -> List[str]:
    urls = []
    if apply_url:
        urls.append(apply_url)
        parsed = urlparse(apply_url)
        if parsed.scheme and parsed.netloc:
            base = f"{parsed.scheme}://{parsed.netloc}"
            paths = DEEP_PATHS_TO_CHECK if deep else PATHS_TO_CHECK
            for path in paths:
                urls.append(urljoin(base, path))

    if deep and company:
        urls.extend(search_engine_candidate_urls(company, job_title, location))

    return list(dict.fromkeys(urls))

def search_engine_candidate_urls(company: str, job_title: Optional[str], location: Optional[str]) -> List[str]:
    query_parts = [company, job_title or "", location or "", "careers contact recruitment email"]
    query = quote_plus(" ".join(part for part in query_parts if part).strip())
    # DuckDuckGo HTML is less JavaScript-heavy than major search pages. If blocked, this simply returns no links.
    search_url = f"https://duckduckgo.com/html/?q={query}"
    text = fetch_page_text(search_url)
    links = re.findall(r"https?://[^\s'\"<>]+", text)
    useful = []
    company_token = re.sub(r"[^a-z0-9]", "", company.lower())[:12]
    for link in links:
        lower = link.lower()
        normalised = re.sub(r"[^a-z0-9]", "", lower)
        if any(word in lower for word in ["career", "job", "contact", "recruit", "work-with-us", "join", "about"]):
            useful.append(link)
        elif company_token and company_token in normalised:
            useful.append(link)
    return list(dict.fromkeys(useful))[:8]

def fetch_page_text(url: str) -> str:
    try:
        response = requests.get(url, headers=HEADERS, timeout=10, allow_redirects=True)
        content_type = response.headers.get("content-type", "")
        if response.status_code >= 400 or "text/html" not in content_type:
            return ""
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        return soup.get_text(" ", strip=True) + " " + " ".join(a.get("href", "") for a in soup.find_all("a"))
    except Exception:
        return ""

def extract_candidate_links(text: str, base_url: str) -> List[str]:
    raw_links = re.findall(r"https?://[^\s'\"<>]+|/[A-Za-z0-9_./-]+", text)
    links = []
    for link in raw_links:
        full_url = urljoin(base_url, link)
        lower = full_url.lower()
        if any(word in lower for word in ["career", "job", "contact", "recruit", "work-with-us", "join", "vacanc", "employment", "people", "team"]):
            links.append(full_url)
    return list(dict.fromkeys(links))

def extract_emails(text: str) -> List[str]:
    emails = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text or "")
    cleaned = []
    for email in emails:
        email = email.lower().strip(".,;:)")
        if is_useful_email(email):
            cleaned.append(email)
    return list(dict.fromkeys(cleaned))

def is_useful_email(email: str) -> bool:
    bad_terms = ["example.com", "sentry", "wixpress", "wordpress", "schema", "noreply", "no-reply", "donotreply", "privacy@", "support@adzuna"]
    return "@" in email and not any(term in email for term in bad_terms)

def best_email(text: str) -> Optional[str]:
    return choose_best_email(extract_emails(text))

def choose_best_email(emails: List[str]) -> Optional[str]:
    if not emails:
        return None
    return sorted(set(emails), key=email_score, reverse=True)[0]

def email_score(email: str) -> int:
    prefix = email.split("@")[0]
    if any(item in prefix for item in PREFERRED_PREFIXES):
        return 30
    if any(item in prefix for item in FALLBACK_PREFIXES):
        return 20
    return 10

def confidence(email: str) -> str:
    score = email_score(email)
    if score >= 30:
        return "high"
    if score >= 20:
        return "medium"
    return "low"

def result_email(email: str, source_url: Optional[str], notes: List[str]) -> Dict[str, Any]:
    return {
        "ok": True,
        "status": "found_email",
        "applicationMethod": "email",
        "hiringEmail": email,
        "contactConfidence": confidence(email),
        "sourceUrl": source_url,
        "notes": notes,
    }
