#!/usr/bin/env bash
# Mueve datos pesados al disco externo y deja symlinks en el repo.
# Portadas: public/covers -> $RETRO_ROOT/covers (ya configurado aparte)
set -euo pipefail

ROOT="${PAL_ES_RETRO_ROOT:-/Volumes/Nuevo vol/pal-es-retro}"
PROJECT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$ROOT" ]]; then
  echo "Disco externo no montado: $ROOT"
  echo "Monta el volumen o define PAL_ES_RETRO_ROOT en .env.local"
  exit 1
fi

mkdir -p "$ROOT"/{covers,ingest,pc,museum,wikidata,serialstation,descriptions,cache,logs}

link_dir() {
  local name="$1"
  local target="$2"
  local link="$3"

  if [[ -L "$link" ]]; then
    echo "  ✓ $name → $(readlink "$link")"
    return 0
  fi

  if [[ -d "$link" && ! -L "$link" ]]; then
    echo "  → Moviendo $name a disco externo…"
    mkdir -p "$target"
    # Fusionar sin borrar lo que ya hubiera en destino
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$link/" "$target/"
    else
      cp -R "$link/." "$target/"
    fi
    rm -rf "$link"
  fi

  ln -sf "$target" "$link"
  echo "  ✓ $name → $target"
}

link_file_or_dir() {
  local name="$1"
  local target="$2"
  local link="$3"
  link_dir "$name" "$target" "$link"
}

echo "=== PAL ES Retro storage ==="
echo "Externo: $ROOT"
echo "Proyecto: $PROJECT"
echo

link_file_or_dir "data/price-ingest" "$ROOT/ingest" "$PROJECT/data/price-ingest"
link_file_or_dir "data/pc" "$ROOT/pc" "$PROJECT/data/pc"
link_file_or_dir "data/museum" "$ROOT/museum" "$PROJECT/data/museum"
link_file_or_dir "data/wikidata" "$ROOT/wikidata" "$PROJECT/data/wikidata"
link_file_or_dir "data/serialstation" "$ROOT/serialstation" "$PROJECT/data/serialstation"
link_file_or_dir "data/descriptions" "$ROOT/descriptions" "$PROJECT/data/descriptions"

# Portadas (si aún no hay symlink)
if [[ ! -L "$PROJECT/public/covers" ]]; then
  ln -sf "$ROOT/covers" "$PROJECT/public/covers"
  echo "  ✓ public/covers → $ROOT/covers"
else
  echo "  ✓ public/covers → $(readlink "$PROJECT/public/covers")"
fi

# .next NO va al externo: Turbopack resuelve mal rutas a node_modules desde otro volumen.
echo "  · .next se mantiene en el repo (gitignored); no mover al externo"

# Logs de pipelines fuera de /tmp
mkdir -p "$ROOT/logs"
if [[ ! -L /tmp/pal-es-market-logs ]]; then
  ln -sf "$ROOT/logs" /tmp/pal-es-market-logs 2>/dev/null || true
  echo "  ✓ /tmp/pal-es-market-logs → $ROOT/logs"
fi

echo
echo "Listo. Añade a .env.local (opcional):"
echo "  PAL_ES_RETRO_ROOT=\"$ROOT\""
echo "  COVERS_ROOT=\"$ROOT/covers\""
echo
df -h "$ROOT" | tail -1
