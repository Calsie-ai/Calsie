# Applix Render scraper

This folder is for the daily Python worker.

Planned flow:

1. Read queued or active campaigns from Supabase.
2. Generate business search batches from target role, industry, address, and radius.
3. Later connect Google Places or another business directory source.
4. Store clean leads in `company_leads`.
5. Refresh campaign reports for the dashboard.

For now the worker can generate batches and safe demo leads so we can test the Supabase pipeline before connecting a real data source.
