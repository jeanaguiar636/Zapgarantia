// Cloudflare Worker com binding R2 chamado BUCKET
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGIN (ex: https://seusite.com)
const LIMITS = { "image/jpeg": 5, "image/png": 5, "image/webp": 5, "video/mp4": 50, "video/webm": 50 }; // MB
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" };

export default {
  async fetch(req, env) {
    // ALLOWED_ORIGIN aceita vários sites separados por vírgula
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
    const origin = req.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "*", // o upload exige login do Supabase, então nunca bloqueia por origem
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "PUT, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);

    // leitura pública (links dos termos enviados ao cliente)
    if (req.method === "GET") {
      const obj = await env.BUCKET.get(decodeURIComponent(url.pathname.slice(1)));
      if (!obj) return new Response("not found", { status: 404, headers: cors });
      return new Response(obj.body, { headers: { ...cors, "Content-Type": obj.httpMetadata.contentType,
        "Cache-Control": "public, max-age=31536000, immutable" } });
    }

    // upload: só usuário logado no Supabase
    if (req.method === "PUT" && url.pathname === "/upload") {
      const auth = req.headers.get("Authorization") ?? "";
      const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY },
      });
      if (!who.ok) return new Response("unauthorized", { status: 401, headers: cors });
      const user = await who.json();

      const type = req.headers.get("Content-Type");
      if (!LIMITS[type]) return new Response("tipo não permitido", { status: 415, headers: cors });
      const size = Number(req.headers.get("Content-Length") ?? 0);
      if (!size || size > LIMITS[type] * 1024 * 1024)
        return new Response("arquivo grande demais", { status: 413, headers: cors });

      const key = `${user.id}/${crypto.randomUUID()}.${EXT[type]}`; // nome gerado no servidor
      await env.BUCKET.put(key, req.body, { httpMetadata: { contentType: type } });
      return new Response(JSON.stringify({ key }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404, headers: cors });
  },
};
