# eBay: OpenAI usage per batch

New batches write a unique JSONL journal under
`data/ebay-regional-campaigns/ai-usage/`. The collector and price sync
subprocesses share the same journal. Existing batches are not backfilled.

Each successful API response records its timestamp, response ID, actual model,
operation, input tokens, cached input tokens, output tokens and total tokens.
Cached input is a subset of input; do not add it again to total tokens.
No API keys, prompts, image URLs or response content are saved.
Local cache hits do not invoke the recorder and consume no additional tokens.

The platform and global `lastRun.aiUsage` and campaign log expose a summary.
The journal is retained independently of the rotating log. The normal campaign
commit includes journals; an always-run GitHub artifact step also preserves them
for 90 days when a run fails before committing.

Missing usage is explicitly counted, not represented as a measured zero.
Only received JSON responses can be measured: an API timeout or invalid response
may have incurred unobservable provider consumption. This is usage telemetry,
not a claim to reproduce the invoice. No monetary rates are hardcoded.

Verification (offline, no paid API calls):

```
python3 scripts/test_ai_usage.py
python3 scripts/test_ai_balance_pause.py
python3 scripts/test_ebay_regional_campaign.py
python3 scripts/test_ebay_region_policy.py
python3 scripts/test_ebay_regional_routing.py
```
