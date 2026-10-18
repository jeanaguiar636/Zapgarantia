// ZapGarantia API (Cloudflare Worker): fotos/vídeos no R2 + Pix (Mercado Pago)
// Bindings: BUCKET (R2)
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGIN (sites separados por vírgula)
// Secrets: SUPABASE_SERVICE_ROLE_KEY, MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET

const TYPES = { "image/jpeg": ["jpg", 10], "image/png": ["png", 10], "image/webp": ["webp", 10], "video/mp4": ["mp4", 50], "video/webm": ["webm", 50] };
const PRICE = 18.0; // R$ por 30 dias de PRO
const DAYS = 30;
const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
    const origin = req.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "",
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    };
    const text = (msg, status = 200) => new Response(msg, { status, headers: cors });
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      // ---------- leitura pública das mídias ----------
      if (req.method === "GET" && url.pathname.startsWith("/media/")) {
        const key = decodeURIComponent(url.pathname.slice(7));
        if (!KEY_RE.test(key)) return text("not found", 404);
        const obj = await env.BUCKET.get(key, { range: req.headers });
        if (!obj) return text("not found", 404);
        const h = new Headers({ "Access-Control-Allow-Origin": "*" });
        obj.writeHttpMetadata(h);
        h.set("etag", obj.httpEtag);
        h.set("Accept-Ranges", "bytes");
        h.set("Cache-Control", "public, max-age=31536000, immutable");
        let status = 200;
        if (obj.range) {
          h.set("Content-Range", `bytes ${obj.range.offset ?? 0}-${obj.range.end ?? obj.size - 1}/${obj.size}`);
          status = 206;
        }
        return new Response(obj.body, { status, headers: h });
      }

      // ---------- upload (precisa estar logado) ----------
      if (req.method === "PUT" && url.pathname === "/upload") {
        const user = await getUser(req, env);
        if (!user) return text("unauthorized", 401);
        const type = req.headers.get("Content-Type");
        const rule = TYPES[type];
        if (!rule) return text("tipo não permitido", 415);
        if (type.startsWith("video/")) { // vídeo só se o admin liberou para este usuário
          const lim = await (await sb(env, "rpc/user_limits", { method: "POST", body: JSON.stringify({ p_user: user.id }) })).json();
          if (!lim || !(lim.videos > 0)) return text("envio de vídeo não liberado para sua conta", 403);
        }
        const size = Number(req.headers.get("Content-Length") ?? 0);
        if (!size || size > rule[1] * 1024 * 1024) return text("arquivo grande demais", 413);
        const key = `${user.id}/${crypto.randomUUID()}.${rule[0]}`;
        await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: type } });
        return json({ key });
      }

      // ---------- gerar Pix ----------
      if (req.method === "POST" && url.pathname === "/pix/create") {
        const user = await getUser(req, env);
        if (!user) return json({ error: "não autenticado" }, 401);
        const prof = (await (await sb(env, `profiles?id=eq.${user.id}&select=plan,pro_until`)).json())[0];
        if (prof && prof.plan === "pro" && !prof.pro_until) return json({ error: "você já é PRO" }, 400);

        const mp = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            transaction_amount: PRICE,
            description: "ZapGarantia PRO - 30 dias",
            payment_method_id: "pix",
            payer: { email: user.email },
            external_reference: user.id,
            notification_url: `${url.origin}/pix/webhook`,
          }),
        });
        const p = await mp.json();
        if (!mp.ok) return json({ error: "falha ao gerar Pix", detail: p.message }, 502);
        await sb(env, "payments", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ user_id: user.id, mp_payment_id: String(p.id), status: p.status, amount: PRICE }),
        });
        const td = p.point_of_interaction.transaction_data;
        return json({ qr_code: td.qr_code, qr_base64: td.qr_code_base64 });
      }

      // ---------- aviso de pagamento do Mercado Pago ----------
      if (req.method === "POST" && url.pathname === "/pix/webhook") {
        const body = await req.json().catch(() => ({}));
        const dataId = url.searchParams.get("data.id") ?? body?.data?.id;
        if (!dataId) return new Response("ignored", { status: 200 });

        const sig = Object.fromEntries((req.headers.get("x-signature") ?? "").split(",").map((s) => s.trim().split("=")));
        const manifest = `id:${String(dataId).toLowerCase()};request-id:${req.headers.get("x-request-id")};ts:${sig.ts};`;
        if (!sig.v1 || sig.v1 !== (await hmacHex(env.MP_WEBHOOK_SECRET, manifest)))
          return new Response("invalid signature", { status: 401 });

        const r = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
          headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
        });
        if (!r.ok) return new Response("payment not found", { status: 200 });
        const p = await r.json();
        const id = encodeURIComponent(String(p.id));

        const rec = (await (await sb(env, `payments?mp_payment_id=eq.${id}&select=user_id,amount`)).json())[0];
        if (!rec) return new Response("unknown payment", { status: 200 });

        if (p.status === "approved" && Number(p.transaction_amount) >= Number(rec.amount) &&
            p.external_reference === rec.user_id) {
          // marca como aprovado uma única vez; só quem conseguir marcar soma os 30 dias
          const first = await (await sb(env, `payments?mp_payment_id=eq.${id}&status=neq.approved`, {
            method: "PATCH", headers: { Prefer: "return=representation" },
            body: JSON.stringify({ status: "approved" }),
          })).json();
          if (Array.isArray(first) && first.length) {
            const prof = (await (await sb(env, `profiles?id=eq.${rec.user_id}&select=plan,pro_until`)).json())[0];
            const now = new Date();
            const base = prof && prof.plan === "pro" && prof.pro_until && new Date(prof.pro_until) > now
              ? new Date(prof.pro_until) : now;
            const until = new Date(base.getTime() + DAYS * 24 * 60 * 60 * 1000);
            await sb(env, `profiles?id=eq.${rec.user_id}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ plan: "pro", pro_until: until.toISOString() }),
            });
          }
        } else {
          await sb(env, `payments?mp_payment_id=eq.${id}&status=neq.approved`, {
            method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: p.status }),
          });
        }
        return new Response("ok", { status: 200 });
      }

      return text("not found", 404);
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};

// confere o login do Supabase e devolve o usuário (ou null)
async function getUser(req, env) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY } });
  return r.ok ? await r.json() : null;
}

// acesso de administrador ao banco do Supabase (service role, nunca vai para o navegador)
function sb(env, path, opts = {}) {
  const k = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: k, "Content-Type": "application/json", ...(opts.headers || {}) };
  if (!k.startsWith("sb_")) headers.Authorization = `Bearer ${k}`; // chave nova (sb_secret_) só usa o apikey
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers });
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
          }
  
