# Enriquecimiento IA del catalogo

Este flujo completa metadatos, descripcion y SEO de PS4, PS5 y Switch 2 mediante el PC runner. Consulta primero fuentes estructuradas y oficiales disponibles en el proyecto, usa OpenAI para redactar texto original y produce un informe revisable. No modifica el catalogo, los precios ni produccion.

## Flujo operativo

1. En `/admin/ia`, crear un lote de entre 1 y 20 fichas.
2. El PC con `scripts/local_game_runner.py` reclama el trabajo y genera las propuestas en orden alfabetico.
3. El admin muestra fuentes, calidad, avisos y un registro copiable para Codex.
4. Codex contrasta los hechos y las URL. Las propuestas aceptadas se incorporan a `data/game-details.json` en una rama aislada.
5. La publicacion sigue `commit -> push -> PR -> checks -> merge -> despliegue del SHA exacto -> verificacion de produccion`.

Cada propuesta incluye una huella del estado anterior de la ficha. Antes de aplicarla debe comprobarse que esa huella sigue coincidiendo, para no sobrescribir cambios posteriores. El resultado declara `mode: proposal-only` y `containsWrites: false`; el servidor rechaza resultados que intenten transportar precios.

## Fuentes directas por plataforma

- PS4 y PS5: PlayStation Store y, si el producto ya no aparece bien en la tienda, la ficha historica de PlayStation Espana. La alternativa historica solo acepta titulo exacto, plataforma correcta y edicion estandar.
- Switch 2: catalogo y ficha de producto de Nintendo Espana. De ahi se extraen consola, lanzamiento, distribuidor, categorias y jugadores locales.
- Todas: GAME Espana cuando la ficha ya conserva su procedencia, Steam solo con identidad corroborada y Wikipedia con seleccion exacta del titulo.

Si aun falta desarrolladora o editora, el motor busca una fuente de conocimiento adicional aunque ya tenga dos referencias comerciales u oficiales. Una coincidencia dudosa queda en revision y nunca se aplica automaticamente.

## Configuracion del PC

Partir de `.env.worker.example`. Son obligatorios `LOCAL_GAME_RUNNER_TOKEN` y `OPENAI_API_KEY`. Para ampliar la busqueda web se puede configurar `GOOGLE_SEARCH_API_KEY` junto con `GOOGLE_SEARCH_CX`, o `SERPAPI_KEY`.

```bash
npm ci
python3 scripts/local_game_runner.py --once
```

El runner continuo conserva el intervalo ya configurado:

```bash
python3 scripts/local_game_runner.py --interval 120
```

## Ejecucion local de diagnostico

El mismo motor puede crear un informe sin pasar por la cola:

```bash
npm run catalog:ai-propose -- \
  --platform ps5 \
  --mode missing \
  --limit 5 \
  --output /tmp/region-atlas-ps5-ai.json
```

Los valores de `--platform` disponibles son `ps4`, `ps5` y `switch2`.

El control de originalidad compara la descripcion con el material consultado. Si detecta demasiado texto coincidente, solicita una segunda redaccion; si vuelve a fallar, la ficha queda en error y no se propone como lista.
