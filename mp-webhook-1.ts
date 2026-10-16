import { createClient } from "npm:@supabase/supabase-js@2";

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const dataId = u.searchParams.get("data.id") ?? body?.data?.id;
    if (!dataId) return new Response("ignored", { status: 200 });

    // 1) valida a assinatura do Mercado Pago
    const sigHeader = req.headers.get("x-signature") ?? "";
    const parts = Object.fromEntries(sigHeader.split(",").map((s) => s.trim().split("=") as [string, string]));
    const manifest = `id:${String(dataId).toLowerCase()};request-id:${req.headers.get("x-request-id")};ts:${parts.ts};`;
    const expected = await hmacHex(Deno.env.get("MP_WEBHOOK_SECRET")!, manifest);
    if (!parts.v1 || parts.v1 !== expected) return new Response("invalid signature", { status: 401 });

    // 2) não confia no corpo: consulta o pagamento direto na API
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}` },
    });
    if (!r.ok) return new Response("payment not found", { status: 200 });
    const p = await r.json();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rec } = await admin.from("payments").select("user_id, amount").eq("mp_payment_id", String(p.id)).single();
    if (!rec) return new Response("unknown payment", { status: 200 });

    await admin.from("payments").update({ status: p.status }).eq("mp_payment_id", String(p.id));

    // 3) libera PRO só se aprovado, valor correto e dono conferido
    if (p.status === "approved" && Number(p.transaction_amount) >= Number(rec.amount) &&
        p.external_reference === rec.user_id) {
      await admin.from("profiles").update({ plan: "pro" }).eq("id", rec.user_id);
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
