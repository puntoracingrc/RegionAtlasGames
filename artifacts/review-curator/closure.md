# eBay Review Curator bridge closure

## Baseline and architecture

- Stacked base: PR #285 at `b5c09a2182718c339831c0d38933195ca36ba3b3`.
- Existing eBay retrieval, edition/region policies, review queue, Research Engine V2 and price sync were reused.
- `PhysicalEvidenceBundleV1` closes the loss of inline component observations between vision and the queue.
- Existing-catalog decisions re-enter as normal listing observations. No direct catalog or price write is part of the bridge.
- New physical or regional variants remain structured proposals only.

## Blinded historical replay

- Historical human-reviewed eBay rows available: 11, not the preferred 30.
- True pre-decision snapshots are not available; human decisions and notes were hidden, but some post-review catalog fields remain in the stored rows.
- Outcomes: 0 accept, 0 reroute, 3 reject, 8 defer, 0 propose.
- Critical false accepts: 0.
- Reject precision: 100%.
- Accuracy including defer: 27.3%.
- Defer rate: 72.7%.

This is safe but insufficient to certify autonomous existing-catalog resolution. The missing historical pre-decision evidence and absence of validated ACCEPT/REROUTE predictions are the blocking evidence gap.

## Shadow pilot

- Exactly 20 current pending eBay rows read from the authoritative worker queue over its public read-only endpoint.
- Authoritative queue revision: `79212e336b82bb62efa2456a76e12bf05fd2a5b14dbb5bade72fc980e2c7fde0`.
- Outcomes: 0 accept, 0 reroute, 7 reject, 13 defer, 0 propose.
- Brave requests: 0; OpenAI calls: 0; cost: $0.
- Catalog mutations: 0; price mutations: 0; authoritative queue mutations: 0.

The selected live rows are legacy eBay review cases dominated by missing region/condition proof. Existing evidence was reused and no paid retrieval was started because the holdout cannot yet authorize autonomous positive decisions.

The run limit is a boundary between complete game cases. It never interrupts the evidence/research/resolution cycle of a game already in progress.

## Verdict

```text
CURATOR EXISTING-CATALOG RESOLUTION:
NOT READY

AUTONOMOUS NEW-VARIANT CREATION:
NOT READY
```

The next narrow step is to retain genuine pre-decision bundle snapshots for at least 30 varied human reviews, then rerun the blinded gate. General retrieval features should not be added before that evidence exists.
