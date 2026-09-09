"""Atomic review-store protocol shared with src/lib/price-review-store.ts."""

import json
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone


def validate_review_document(doc):
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list) or not isinstance(doc.get("decisions"), list):
        raise ValueError("Cola incompleta; no se sobrescribe el servidor.")
    ids = set()
    for item in doc["items"]:
        if (not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]
                or item["id"] in ids or not isinstance(item.get("listingTitle"), str)
                or item.get("status") not in {"pending", "accepted", "rejected"}):
            raise ValueError("Cola con elementos inválidos o IDs duplicados.")
        ids.add(item["id"])
    if any(not isinstance(event, dict) for event in doc["decisions"]):
        raise ValueError("Historial de decisiones inválido.")


@contextmanager
def review_lock(sftp, queue_path):
    lock_path = queue_path + ".lock"
    owner = json.dumps({"owner": str(uuid.uuid4()), "at": datetime.now(timezone.utc).isoformat(), "writer": "pc"}).encode()
    # O_EXCL must be handled by the SFTP server, never exists() followed by put().
    with sftp.open(lock_path, "wx") as handle:
        handle.write(owner)
    try:
        yield
    finally:
        # A lost connection leaves the lock for manual recovery, never expiry-based stealing.
        with sftp.open(lock_path, "rb") as handle:
            current = handle.read()
        if current != owner:
            raise RuntimeError("El propietario del bloqueo cambió; guardado no confirmado.")
        sftp.remove(lock_path)


def atomic_review_write(sftp, path, payload):
    data = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode()
    temporary = path + "." + str(uuid.uuid4()) + ".tmp"
    try:
        with sftp.open(temporary, "wx") as handle:
            handle.write(data)
        with sftp.open(temporary, "rb") as handle:
            if handle.read() != data:
                raise RuntimeError("Subida incompleta; se conserva la versión anterior.")
        sftp.posix_rename(temporary, path)
        with sftp.open(path, "rb") as handle:
            if handle.read() != data:
                raise RuntimeError("No se pudo confirmar el guardado remoto.")
    finally:
        try:
            sftp.remove(temporary)
        except OSError:
            pass
