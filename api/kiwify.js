import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ NUNCA expor no front
);

// Aceita token tanto no header quanto no body (porque a Kiwify pode variar)
function readToken(req, body) {
  const h =
    req.headers["x-kiwify-token"] ||
    req.headers["x-webhook-token"] ||
    req.headers["authorization"];
  const headerToken = typeof h === "string" ? h.replace("Bearer ", "").trim() : "";
  const bodyToken = body?.token || body?.webhook_token || body?.secret;
  return headerToken || bodyToken || "";
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // ✅ Validar token (o mesmo que aparece no print da Kiwify)
    const receivedToken = readToken(req, body);
    const expectedToken = (process.env.KIWIFY_WEBHOOK_TOKEN || "").trim();

    if (!expectedToken) {
      return res.status(500).json({ ok: false, error: "Missing KIWIFY_WEBHOOK_TOKEN env" });
    }
    if (receivedToken !== expectedToken) {
      return res.status(401).json({ ok: false, error: "Invalid webhook token" });
    }

    // Email tolerante (payload pode variar)
    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.email ||
      body?.data?.customer?.email ||
      body?.data?.email;

    if (!email) {
      return res.status(400).json({ ok: false, error: "Missing customer email in payload" });
    }

    const emailNorm = email.toLowerCase().trim();

    // Identificar evento/status de forma tolerante
    const event =
      body?.event ||
      body?.type ||
      body?.webhook_event ||
      body?.data?.event ||
      "";

    const status =
      body?.status ||
      body?.data?.status ||
      body?.subscription?.status ||
      "";

    const norm = `${event} ${status}`.toLowerCase();

    // ✅ Define o que libera / bloqueia
    const isPaid =
      norm.includes("paid") ||
      norm.includes("approved") ||
      norm.includes("aprov") ||
      norm.includes("active") ||
      norm.includes("assinatura_ativa") ||
      norm.includes("renewed") ||
      norm.includes("renew");

    const isBlocked =
      norm.includes("canceled") ||
      norm.includes("cancel") ||
      norm.includes("refunded") ||
      norm.includes("estorno") ||
      norm.includes("chargeback") ||
      norm.includes("past_due") ||
      norm.includes("overdue") ||
      norm.includes("inadimpl") ||
      norm.includes("expired") ||
      norm.includes("refused") ||
      norm.includes("recused");

    if (!isPaid && !isBlocked) {
      // evento desconhecido: não quebra
      return res.status(200).json({ ok: true, ignored: true, norm });
    }

    // ✅ Busca o profile pra:
    // 1) confirmar que existe
    // 2) respeitar acessos manuais (admin/promo/parceria)
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, email, access_origin")
      .eq("email", emailNorm)
      .maybeSingle();

    if (profErr) throw profErr;

    if (!prof) {
      // pessoa comprou antes de criar conta no app
      return res.status(200).json({
        ok: true,
        warning: "No profile found for this email. User must sign up in the app with same email.",
      });
    }

    // ✅ NÃO sobrescreve acesso manual/promo
    if (prof.access_origin === "admin" || prof.access_origin === "promo") {
      return res.status(200).json({ ok: true, skipped: "manual_access_protected" });
    }

    // ✅ Atualização final
    // - Pago: libera por 30 dias (você pode trocar para 31)
    // - Bloqueado: remove acesso
    const updates = {
      email: emailNorm,
      subscription_status: isPaid ? "active" : "inactive",
      access_status: isPaid ? "active" : "inactive",
      access_until: isPaid ? addDays(new Date(), 30) : null,
      access_origin: isPaid ? "paid" : "paid", // mantém como paid (sem virar admin/promo)
    };

    const { data: updated, error: upErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", prof.id)
      .select("id,email,access_status,access_until,subscription_status,access_origin")
      .maybeSingle();

    if (upErr) throw upErr;

    return res.status(200).json({ ok: true, updated, norm });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || "Webhook error" });
  }
}
