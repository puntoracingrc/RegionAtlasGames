# Pilot 1 root-cause analysis

- Outcome: 0 CONFIRMED, 0 PARTIAL, 1 UNRESOLVED, 4 FAILED.
- Funnel: 52 searches, 13 pages opened and 4 images inspected.
- Cost: $0.019041.
- Safety: 0 catalog mutations, 0 accepted unsafe false positives, 0 accepted cross-attribution errors and 0 accepted platform-contamination errors.
- Primary root cause: retrieval infrastructure exceptions escaped the search/image layers and were interpreted as semantic case failures.
- Contributing causes: a single usable general provider, quota exhaustion opening no circuit, limited source-aware direct routing, shallow page-image extraction and shared accounting of technical failures with semantic progress.
- Corrective status: covered by typed retrieval failures, quota circuit breaker, bounded retry/failover, direct URL routing, richer image discovery, separate technical telemetry and BLOCKED_INFRASTRUCTURE terminal state.
