<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Política IA en precios (on-demand)

**Norma permanente** para todas las plataformas y collectors de precios:

1. **Cuando hay duda con un anuncio abierto** (match ambiguo, región, carátula, listing AI), los collectors **usan OpenAI** si hay `OPENAI_API_KEY`.
2. Los collectors **no** desactivan IA con `DAILY_NO_AI`. Solo `PRICE_AI_DISABLED=1` o `--no-ai` manual.
3. **Batch de descripciones y ingest de precios corren en paralelo** (sin pausa mutua). OpenAI gestiona rate limits de la cuenta.
4. Implementación: `scripts/collectors/price_ai_policy.py`, `match_kwargs()` en `collector_args.py`.
