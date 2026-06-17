# RAKUTEN_AUTH_V1

Rakuten Advertising queda preparado para autenticación backend, sin activarse en producción.

Flujo:

```txt
client_id + client_secret
→ base64(client_id:client_secret)
→ token-key
→ POST https://api.linksynergy.com/token
→ access_token cacheado en servidor
```

Variables privadas:

```txt
RAKUTEN_AFFILIATE_ENABLED=false
RAKUTEN_ACCOUNT_ID=
RAKUTEN_CLIENT_ID=
RAKUTEN_CLIENT_SECRET=
RAKUTEN_TOKEN_KEY=
RAKUTEN_TOKEN_ENDPOINT=https://api.linksynergy.com/token
RAKUTEN_TOKEN_REFRESH_SAFETY_SECONDS=300
RAKUTEN_TOKEN_TIMEOUT_MS=10000
RAKUTEN_ADVANCED_REPORTS_ENABLED=false
```

Reglas:

- No usar `NEXT_PUBLIC_RAKUTEN_*`.
- No exponer `client_secret`, `token-key`, `access_token` ni `refresh_token`.
- No implementar Web Security Token en V1.
- El provider Rakuten no consulta productos reales hasta tener credenciales y anunciantes aprobados.
