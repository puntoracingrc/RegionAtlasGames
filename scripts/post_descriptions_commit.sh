#!/usr/bin/env bash
# Espera a que termine generate_game_descriptions y sube los cambios.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="/tmp/pal-es-market-logs/post-descriptions-commit.log"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG"
}

log "Esperando fin de generate_game_descriptions.py..."
while pgrep -f "generate_game_descriptions.py" >/dev/null 2>&1; do
  sleep 120
done

log "Job terminado. Preparando commit..."

git add data/game-details.json data/descriptions/ data/meta.json 2>/dev/null || true
git add package.json scripts/generate_game_descriptions.py scripts/run_descriptions_pipeline.sh scripts/post_descriptions_commit.sh 2>/dev/null || true

if git diff --cached --quiet; then
  log "Nada que commitear."
  exit 0
fi

git commit -m "$(cat <<'EOF'
Generar descripciones y meta SEO con IA para fichas del catálogo.

Añade textos originales, seoTitle, seoDescription, FAQs y highlights desde metadatos verificados + Wikipedia; incluye scripts de pipeline y carga de .env.local.
EOF
)"

git push origin main
log "Push completado: $(git rev-parse --short HEAD)"
