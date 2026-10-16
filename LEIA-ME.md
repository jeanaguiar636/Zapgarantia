# ZapGarantia

Arquivos (todos na raiz):
- `index.html`: o app
- `01-banco-rls.sql`: cole no Supabase > SQL Editor (depois rode a última linha com o seu e-mail para virar admin)
- `create-pix.ts` e `mp-webhook.ts`: cole no Supabase > Edge Functions (crie as funções `create-pix` e `mp-webhook`; desligue "Verify JWT" no `mp-webhook`)
- `worker.js`: cole em um Worker da Cloudflare com binding R2 `BUCKET`

Secrets das funções (Supabase > Edge Functions > Secrets): MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, ALLOWED_ORIGIN
Variáveis do Worker: SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGIN
Webhook do Mercado Pago: https://gktfwlhvdnsezqcpjrpf.supabase.co/functions/v1/mp-webhook
No `index.html`, troque `R2_PUBLIC_DOMAIN` pela URL do Worker.
