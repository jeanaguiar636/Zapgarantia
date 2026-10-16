import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "não autenticado" }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: prof } = await admin.from("profiles").select("plan").eq("id", user.id).single();
    if (prof?.plan === "pro") return json({ error: "você já é PRO" }, 400);

    const AMOUNT = 12.0;
    const mp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: AMOUNT,
        description: "ZapGarantia PRO",
        payment_method_id: "pix",
        payer: { email: user.email },
        external_reference: user.id,
        notification_url: `${url}/functions/v1/mp-webhook`,
      }),
    });
    const p = await mp.json();
    if (!mp.ok) return json({ error: "falha ao gerar Pix", detail: p.message }, 502);

    await admin.from("payments").insert({
      user_id: user.id, mp_payment_id: String(p.id), status: p.status, amount: AMOUNT,
    });
    const td = p.point_of_interaction.transaction_data;
    return json({ qr_code: td.qr_code, qr_base64: td.qr_code_base64 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
