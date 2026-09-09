#!/usr/bin/env python3
"""Replay recorded AI responses against a frozen queue, without API calls or remote writes."""
import argparse
import copy
import json
from pathlib import Path

from auto_price_review_vision import apply_vision_to_item


def replay(queue, recorded):
    items = {row["id"]: row for row in queue["items"]}
    results = []
    seen = set()
    for row in recorded["results"]:
        identifier = row["id"]
        if identifier in seen:
            raise ValueError(f"Duplicate sample ID: {identifier}")
        seen.add(identifier)
        before = copy.deepcopy(items[identifier])
        after = copy.deepcopy(before)
        if not isinstance(row.get("result"), dict):
            raise ValueError(f"Missing recorded response: {identifier}")
        outcome = apply_vision_to_item(after, row["result"], row["images"], {})
        protected_before = {key: value for key, value in before.items() if key not in {"evidence", "updatedAt"}}
        protected_after = {key: value for key, value in after.items() if key not in {"evidence", "updatedAt"}}
        if protected_before != protected_after:
            raise ValueError(f"Protected queue field changed: {identifier}")
        for key, value in before.get("evidence", {}).items():
            if key not in {"coverVision", "reviewNotes"} and after["evidence"].get(key) != value:
                raise ValueError(f"Existing evidence overwritten: {identifier}/{key}")
        results.append({"id": identifier, "listingTitle": before["listingTitle"],
                        "outcome": outcome, "coverVision": after["evidence"]["coverVision"],
                        "protectedFieldsUnchanged": True})
    return {"results": results, "remoteWrites": 0, "catalogWrites": 0, "apiCalls": 0,
            "identified": sum(row["coverVision"]["isTargetGame"] is True for row in results),
            "notTarget": sum(row["coverVision"]["isTargetGame"] is False for row in results),
            "valuationReady": sum(row["coverVision"]["valuationReady"] is True for row in results)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", required=True, type=Path)
    parser.add_argument("--analysis", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output must not exist; preserve previous evidence")
    report = replay(json.loads(args.queue.read_text()), json.loads(args.analysis.read_text()))
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({key: value for key, value in report.items() if key != "results"}))


if __name__ == "__main__":
    main()
