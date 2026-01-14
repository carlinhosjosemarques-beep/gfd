import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ NUNCA expor no front
);

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default async function handler(req, res) {
  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Só POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const debug = String(process.env.DEBUG_WEBHOOK || "") === "true";

    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    if (debug) {
      console.log("[KIWIFY] headers keys:", Object.keys(req.headers || {}));
      console.log("[KIWIFY] query keys:", Object.keys(req.query || {}));
      console.log("[KIWIFY] body keys:", Object.keys(body || {}));
    }

    // 📧 Email (estrutura real da Kiwify)
    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: "Missing customer email",
      });
    }

    const emailNorm = email.toLowerCase().trim();

    // 📌 Status real que a Kiwify envia
    const status =
      body?.order_status ||
      body?.status ||
      "";

    const statusNorm = status.toLowerCase();

    const isPaid =
      statusNorm === "paid" ||
      statusNorm === "approved";

    const isBlocked =
      statusNorm === "refused" ||
      statusNorm === "canceled" ||
      statusNorm === "refunded" ||
      statusNorm === "chargeback";

    if (!isPaid && !isBlocked) {
      return res.status(200).json({
        ok: true,
        ignored: true,
        status: statusNorm,
      });
    }

    // 🔎 Busca profile
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, access_origin")
      .eq("email", emailNorm)
      .maybeSingle();

    if (profErr) throw profErr;

    if (!prof) {
      return res.status(200).json({
        ok: true,
        warning: "User not found. Will activate after signup.",
      });
    }

    // 🛡️ Não sobrescreve acesso manual
    if (prof.access_origin === "admin" || prof.access_origin === "promo") {
      return res.status(200).json({
        ok: true,
        skipped: "manual_access",
      });
    }

    // ✅ Atualiza assinatura
    const updates = {
      subscription_status: isPaid ? "active" : "inactive",
      access_status: isPaid ? "active" : "inactive",
      access_until: isPaid ? addDays(new Date(), 30) : null,
      access_origin: "paid",
    };

    const { data: updated, error: upErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", prof.id)
      .select(
        "id,email,access_status,access_until,subscription_status,access_origin"
      )
      .maybeSingle();

    if (upErr) throw upErr;

    return res.status(200).json({
      ok: true,
      updated,
      status: statusNorm,
    });
  } catch (err) {
    console.error("[KIWIFY] error:", err);
    return res.status(500).json({
      ok: false,
      error: "Webhook processing failed",
    });
  }
}
