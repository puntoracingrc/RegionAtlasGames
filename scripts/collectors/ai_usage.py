"""Per-batch OpenAI usage journal shared by collector and sync subprocesses."""

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def _append(path, event):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, ensure_ascii=False) + "\n")


@contextmanager
def usage_batch(directory, **metadata):
    batch_id = uuid4().hex
    path = Path(directory) / f"{batch_id}.jsonl"
    previous = os.environ.get("PRICE_AI_USAGE_FILE")
    _append(path, {"event": "batch", "batchId": batch_id,
                   "startedAt": datetime.now(timezone.utc).isoformat(), **metadata})
    os.environ["PRICE_AI_USAGE_FILE"] = str(path)
    try:
        yield path
    finally:
        if previous is None:
            os.environ.pop("PRICE_AI_USAGE_FILE", None)
        else:
            os.environ["PRICE_AI_USAGE_FILE"] = previous


def record_usage(payload, *, model, operation):
    destination = os.environ.get("PRICE_AI_USAGE_FILE")
    if not destination:
        return
    usage = payload.get("usage") or {}
    details = usage.get("prompt_tokens_details") or {}
    _append(Path(destination), {
        "event": "response", "at": datetime.now(timezone.utc).isoformat(),
        "model": payload.get("model") or model, "operation": operation,
        "responseId": payload.get("id"),
        "inputTokens": usage.get("prompt_tokens"),
        "cachedInputTokens": details.get("cached_tokens"),
        "outputTokens": usage.get("completion_tokens"),
        "totalTokens": usage.get("total_tokens"),
    })


def summarize_usage(path):
    events = [json.loads(line) for line in Path(path).read_text().splitlines() if line]
    result = {"batchId": events[0]["batchId"], "responses": 0,
              "responsesMissingUsage": 0, "inputTokens": 0,
              "cachedInputTokens": 0, "outputTokens": 0, "totalTokens": 0,
              "responsesMissingCacheUsage": 0, "byModel": {}}
    for event in events:
        if event.get("event") != "response":
            continue
        result["responses"] += 1
        fields = ("inputTokens", "outputTokens", "totalTokens")
        if any(event.get(key) is None for key in fields):
            result["responsesMissingUsage"] += 1
        if event.get("cachedInputTokens") is None:
            result["responsesMissingCacheUsage"] += 1
        model = result["byModel"].setdefault(event["model"],
                    {key: 0 for key in (*fields, "cachedInputTokens")})
        for key in model:
            value = event.get(key) or 0
            model[key] += value
            result[key] += value
    return result
