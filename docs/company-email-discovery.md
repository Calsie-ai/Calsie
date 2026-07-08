# Company Email Discovery

Applix fetches jobs first, then enriches them. The email-discovery layer exists so the active job pipeline can keep `jobs` as the source of truth while still finding reusable company contact routes for outreach.

## Flow

`outscraper-jobs -> jobs -> enrich-job-emails -> lead_contact_emails -> jobs -> generate-job-outreach-drafts`

`enrich-job-emails` does not fetch jobs from Outscraper or Indeed, and it does not send email. It only enriches existing rows in `jobs`.

## Why Company + Location

Outscraper already gives useful company names in `jobs.company` and `jobs.raw_payload.company`. The missing piece is usually the official company website/contact route. Search queries therefore use the company name as the primary key and location as supporting context, for example:

```text
"Catholic Healthcare Limited" "Sydney" contact
"Catholic Healthcare Limited" "Sydney" email
"Catholic Healthcare Limited" "recruitment" email
"Catholic Healthcare Limited" "careers"
```

Location helps disambiguate similarly named organizations, but the company name remains the main search key.

## Company-Level Caching

Discovery is grouped by unique company before any external search runs. The function uses `jobs.normalized_company` first, then falls back to lowercase trimmed `jobs.company`.

If one company appears in many job rows, Applix searches and scrapes once, saves the reusable result in `lead_contact_emails`, then updates all matching jobs in the batch. Later runs check `lead_contact_emails` first by company name, normalized company match, and company domain before calling a provider again.

Reusable cache fields:

- `company_name`
- `company_website`
- `company_domain`
- `email`
- `source`
- `confidence`
- `company_website_status`
- `website_confidence`
- `last_checked_at`
- `reuse_count`

## Environment Variables

Website search uses generic provider configuration:

```text
WEBSITE_SEARCH_API_URL
WEBSITE_SEARCH_API_KEY
```

The provider can be a wrapper around Google Custom Search, SerpAPI, Bing, Outscraper Google Search, or another search service. If the URL contains `{query}`, `{q}`, or `{api_key}`, the function sends a GET request with placeholders replaced. Otherwise it sends a POST request with:

```json
{
  "query": "search query",
  "company": "company name",
  "location": "job location"
}
```

Optional fallback email provider variables are still supported:

```text
EMAIL_FINDER_URL
EMAIL_FINDER_API_KEY
```

If the website search provider is missing, the function does not crash. It uses existing raw-payload and email-finder fallback behavior, leaves website discovery unmarked as `not_found`, and returns `website_search_provider_missing: true` in the summary.

## Rejected Domains

The function never saves job boards, social networks, search engines, or ATS domains as the company website, including:

```text
indeed.com
seek.com.au
linkedin.com
facebook.com
instagram.com
youtube.com
jora.com
adzuna.com.au
google.com
bing.com
jobadder.com
smartrecruiters.com
dayforcehcm.com
greenhouse.io
workable.com
lever.co
ashbyhq.com
```

## Confidence Rules

Website candidates are scored with company, snippet, location, industry, and URL hints. Candidates below `70` are not accepted. Low-confidence results update `jobs.website_discovery_status = low_confidence`; the function does not guess.

When a website is accepted, `enrich-job-emails` scrapes likely pages such as `/contact`, `/careers`, `/recruitment`, `/ndis`, and `/disability-support` for emails. Preferred addresses include `recruitment@`, `careers@`, `hr@`, `jobs@`, `people@`, `admin@`, `info@`, and `contact@`, especially on the official company domain.

Rejected emails include `noreply@`, `no-reply@`, `privacy@`, `accounts@`, `billing@`, `example@`, and `test@`.

## Fallback Behavior

If a valid cached email exists, it is reused and no external provider is called.

If a website is found but no email is found, matching jobs keep `apply_method = url`, with `email_extraction_status = not_found` and `email_extraction_source = website_scrape_not_found`.

If no confident website is found after a search attempt, matching jobs use `email_extraction_status = not_found` and `email_extraction_source = company_website_not_found`.

If website discovery fails due to provider/runtime error, matching jobs record `website_discovery_status = failed` and preserve the error in `website_discovery_error`.
