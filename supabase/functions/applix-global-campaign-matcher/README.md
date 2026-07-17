# Global campaign matcher

This worker claims a small batch of active campaigns, matches each campaign against the same shared daily catalogue, and fills any remaining daily quota from verified unused contacts linked to the campaign template.

The worker does not call Outscraper and does not send emails. Deterministic matches are marked as passed for this lightweight path so the existing daily selector can be reused without per-user AI judging.

Recommended invocation size: 25 campaigns per call. Invoke repeatedly after the 6 a.m. global fetch until the response reports `claimed: 0`.