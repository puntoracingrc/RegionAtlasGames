#!/usr/bin/env python3
"""Publish Region Atlas prices over the authenticated runtime API, never Git.

No browser cookie, admin password, Git credential or Blob credential is used.
Default credentials: ~/.config/regionatlas-price-connector/credentials.json (0600).
"""
from __future__ import annotations
import argparse
import json
import os
import secrets
import stat
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

DEFAULT_CREDENTIALS = Path.home() / ".config/regionatlas-price-connector/credentials.json"
ALLOWED_BASE_URL = "https://www.regionatlas.games"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the bearer credential to another origin.


def load_credentials(path: Path):
    if path.is_symlink() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError("El archivo de credenciales debe ser privado (chmod 600) y no un enlace.")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("baseUrl") != ALLOWED_BASE_URL:
        raise ValueError("Destino no autorizado; se requiere https://www.regionatlas.games.")
    token = data.get("token")
    if not isinstance(token, str) or not 32 <= len(token) <= 512:
        raise ValueError("Credencial no válida.")
    return data


def request_api(credentials, mode=None, payload=None):
    endpoint = credentials["baseUrl"] + "/api/integrations/prices"
    if mode:
        endpoint += "?mode=" + mode
    request = urllib.request.Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None,
                                     headers={"Authorization": "Bearer " + credentials["token"], "Content-Type": "application/json", "User-Agent": "RegionAtlas-PriceConnector/1"},
                                     method="POST" if payload is not None else "GET")
    opener = urllib.request.build_opener(NoRedirect())
    for attempt in range(3):
        try:
            with opener.open(request, timeout=65) as response:
                result = json.load(response)
                if result.get("ok") is not True:
                    raise RuntimeError("Respuesta sin confirmación positiva.")
                if payload is not None:
                    validate_confirmation(result, mode, payload)
                return result
        except urllib.error.HTTPError as error:
            try:
                message = json.loads(error.read()).get("error", "Error HTTP")
            except (ValueError, AttributeError):
                message = "Error HTTP"
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f"HTTP {error.code}: {message}") from None
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise RuntimeError("Conexión interrumpida. Se puede reintentar el mismo lote sin volver a promediar.") from None
        time.sleep(2 ** attempt)
    raise RuntimeError("No se confirmó la solicitud.")


def validate_confirmation(result, mode, payload):
    receipt = result.get("receipt") or {}
    if (result.get("mode") != mode or receipt.get("catalogId") != payload["catalogId"]
            or receipt.get("batchId") != payload["batchId"] or receipt.get("taskId") != payload["taskId"]
            or not receipt.get("digest") or not receipt.get("publishedAt")):
        raise RuntimeError("El recibo no corresponde a la solicitud. No se afirma que esté publicada.")
    returned = receipt.get("conditions") or []
    if len(returned) != len(payload["conditions"]):
        raise RuntimeError("El recibo no confirma todos los estados.")
    for expected in payload["conditions"]:
        matches = [row for row in returned if row.get("state") == expected["state"]]
        if len(matches) != 1 or Decimal(str(matches[0].get("mean"))) != Decimal(str(expected["meanEur"])):
            raise RuntimeError("La media del recibo no corresponde a la solicitud.")
        row = matches[0]
        value = Decimal(str(expected["meanEur"]))
        if row.get("before") is not None:
            value = (value + Decimal(str(row["before"]))) / 2
        if Decimal(str(row.get("after"))) != value.quantize(Decimal(".01"), rounding=ROUND_HALF_UP):
            raise RuntimeError("El importe confirmado no cumple la fórmula.")


def submissions(document, task_id):
    metadata = document["metadata"]
    if metadata.get("currency") != "EUR":
        raise ValueError("Solo se publican precios expresados en EUR.")
    grouped = {}
    observed = set()
    for group in document["groups"]:
        if group["status"] == "held":
            continue
        if group["status"] != "provisional_local_proposal":
            raise ValueError("Estado de grupo no reconocido; no se publica.")
        catalog_id = group["catalogId"]
        entry = grouped.setdefault(catalog_id, {"schemaVersion": 1, "batchId": metadata["batchId"], "catalogId": catalog_id,
                    "catalogTitle": group["gameTitle"], "platformSlug": metadata["platform"].lower(), "region": metadata["region"],
                    "currency": "EUR", "taskId": task_id, "conditions": []})
        if entry["catalogTitle"] != group["gameTitle"]:
            raise ValueError("Los estados de la ficha no tienen el mismo título/edición.")
        condition = group["condition"]
        if condition not in ("complete", "sealed") or any(row["state"] == condition for row in entry["conditions"]):
            raise ValueError("Estado incorrecto o duplicado.")
        listings = []
        for record in group["records"]:
            if record["decision"] not in ("accepted", "accepted_low_price_reviewed"):
                continue
            if record["itemId"] in observed:
                raise ValueError("Anuncio duplicado; no se publicará dos veces.")
            observed.add(record["itemId"])
            price = Decimal(str(record["priceEur"]))
            if price <= 0 or price * 100 != record["priceCents"]:
                raise ValueError("Precio del anuncio inconsistente.")
            listings.append({"listingId": record["itemId"], "url": record["url"], "priceEur": float(price)})
        if not listings or len(listings) != group["acceptedCount"]:
            raise ValueError("Recuento de anuncios inconsistente.")
        mean = (sum(Decimal(str(row["priceEur"])) for row in listings) / len(listings)).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        if mean != Decimal(str(group["cleanMeanEur"])):
            raise ValueError("Media inconsistente; no se publica.")
        entry["conditions"].append({"state": condition, "meanEur": float(mean), "listings": listings})
    if not grouped:
        raise ValueError("No hay propuestas publicables en el documento.")
    return list(grouped.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("credentials", "status", "prepare", "preview", "publish"))
    parser.add_argument("--input", type=Path, help="precios-propuestos.json con anuncios, medias y motivos")
    parser.add_argument("--credentials", type=Path, default=DEFAULT_CREDENTIALS)
    parser.add_argument("--task-id", help="Identificador estable del task de origen; conservarlo en reintentos")
    parser.add_argument("--catalog-id", help="Limitar a una ficha exacta")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--report", type=Path, help="Archivo local de recibos; no contiene la credencial")
    args = parser.parse_args()
    if args.action == "credentials":
        args.credentials.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor = os.open(args.credentials, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as out:
            json.dump({"baseUrl": ALLOWED_BASE_URL, "token": secrets.token_urlsafe(48)}, out)
            out.write("\n")
        print(f"Credencial privada creada en {args.credentials}; su valor no se muestra.")
        return
    if args.action == "status":
        print(json.dumps(request_api(load_credentials(args.credentials)), ensure_ascii=False, indent=2))
        return
    if not args.input or not args.task_id:
        parser.error("Se requieren --input y --task-id.")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit debe ser positivo.")
    document = json.loads(args.input.read_text(encoding="utf-8"))
    payloads = submissions(document, args.task_id)
    if args.catalog_id:
        payloads = [row for row in payloads if row["catalogId"] == args.catalog_id]
        if not payloads:
            raise ValueError("La ficha solicitada no está en el lote.")
    if args.limit:
        payloads = payloads[:args.limit]
    if args.action == "prepare":
        print(json.dumps({"ok": True, "networkRequests": 0, "catalogEntries": len(payloads), "conditionPrices": sum(len(row["conditions"]) for row in payloads), "batchId": payloads[0]["batchId"]}, ensure_ascii=False, indent=2))
        return
    credentials = load_credentials(args.credentials)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = args.report or args.input.parent / f"connector-{args.action}-{stamp}.jsonl"
    report.parent.mkdir(parents=True, exist_ok=True)
    # Append-only reports survive interruption. The server is the idempotency authority.
    with report.open("a", encoding="utf-8") as out:
        for index, payload in enumerate(payloads, 1):
            try:
                result = request_api(credentials, args.action, payload)
            except RuntimeError as error:
                out.write(json.dumps({"ok": False, "catalogId": payload["catalogId"], "batchId": payload["batchId"], "error": str(error)}, ensure_ascii=False) + "\n")
                out.flush()
                raise
            out.write(json.dumps(result, ensure_ascii=False) + "\n")
            out.flush()
            os.fsync(out.fileno())
            label = "YA APLICADO" if result.get("alreadyApplied") else "PUBLICADO" if args.action == "publish" else "PREVISIÓN"
            print(f"{index}/{len(payloads)} {label}: {payload['catalogTitle']}", flush=True)
    print(f"Recibos: {report}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyError, InvalidOperation) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
