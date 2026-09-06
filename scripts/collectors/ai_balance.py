"""Propagate billing failures without treating them as negative evidence."""

import json
import os
from pathlib import Path
from urllib.error import HTTPError


class AiBalanceExhausted(Exception):
    pass


def check_billing_error(error: HTTPError) -> None:
    try:
        payload = json.loads(error.read())
        detail = payload.get("error", {})
    except (ValueError, OSError, AttributeError):
        return
    codes = {str(detail.get("code")), str(detail.get("type"))} if isinstance(detail, dict) else set()
    if not codes.intersection({"insufficient_quota", "credit_balance_exhausted", "billing_hard_limit_reached"}):
        return
    signal = os.environ.get("PRICE_AI_BALANCE_SIGNAL")
    if signal:
        Path(signal).write_text("ai_balance_exhausted", encoding="utf-8")
    raise AiBalanceExhausted("Pausado por saldo agotado de IA")
