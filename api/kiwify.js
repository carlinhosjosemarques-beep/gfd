import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ NUNCA expor no front
);

// ✅ Aceita token tanto no header quanto no body (Kiwify varia)
function readToken(req, body) {
  const headers = req?.headers || {};

  // Vercel/Node costuma normalizar headers em lowercase
  const headerToken =
    headers["x-kiwify-token"] ||
    headers["x-kiwify-webhook-token"] ||
    headers["x-webhook-token"] ||
    headers["authorization"] ||
    headers["Authorization"];

  const cleanedHeaderToken =
    typeof headerToken === "string"
      ? headerToken.replace(/^Bearer\s+/i, "").trim()
      : "";

  // Kiwify pode mandar no body também (e às vezes dentro de data)
  const bodyToken =
    body?.token ||
    body?.webhook_token ||
    body?.secret ||
    body?.data?.webhook_token ||
    body?.data?.token ||
    body?.data?.secret ||
    "";

  return cleanedHeaderToken || bodyToken || "";
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
    // Body pode vir como string no Vercel
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    // ✅ Validar token (o mesmo que aparece no print da Kiwify)
    const receivedToken = readToken(req, body);
    const expectedToken = (process.env.KIWIFY_WEBHOOK_TOKEN || "").trim();

    if (!expectedToken) {
      return res.status(500).json({ ok: false, error: "Missing KIWIFY_WEBHOOK_TOKEN env" });
    }
    if (!receivedToken || receivedToken !== expectedToken) {
      return res.status(401).json({
        ok: false,
        error: "Invalid webhook token",
        debug: { hasToken: !!receivedToken }, // não vaza token
      });
    }

    // ✅ Email tolerante (payload varia)
    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.email ||
      body?.data?.customer?.email ||
      body?.data?.buyer?.email ||
      body?.data?.email;

    if (!email) {
      return res.status(400).json({ ok: false, error: "Missing customer email in payload" });
    }

    const emailNorm = String(email).toLowerCase().trim();

    // ✅ Identificar evento/status de forma tolerante
    const event =
      body?.event ||
      body?.type ||
      body?.webhook_event ||
      body?.data?.event ||
      body?.data?.type ||
      "";

    const status =
      body?.status ||
      body?.data?.status ||
      body?.subscription?.status ||
      body?.data?.subscription?.status ||
      "";

    const norm = `${event} ${status}`.toLowerCase();

    // ✅ Regras de liberação/bloqueio (tolerante PT/EN)
    const isPaid =
      norm.includes("paid") ||
      norm.includes("approved") ||
      norm.includes("aprov") ||
      norm.includes("active") ||
      norm.includes("ativa") ||
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

    // ✅ Busca o profile (pra existir + proteger acesso manual)
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, email, access_origin, can_write")
      .eq("email", emailNorm)
      .maybeSingle();

    if (profErr) throw profErr;

    if (!prof) {
      // comprou antes de criar conta no app
      return res.status(200).json({
        ok: true,
        warning: "No profile found for this email. User must sign up in the app with same email.",
        email: emailNorm,
      });
    }

    // ✅ NÃO sobrescreve acesso manual/promo
    if (prof.access_origin === "admin" || prof.access_origin === "promo") {
      return res.status(200).json({ ok: true, skipped: "manual_access_protected" });
    }

    // ✅ Atualização final
    // Pago: libera (e can_write true)
    // Bloqueado: remove (e can_write false)
    const accessUntil = isPaid ? addDays(new Date(), 30) : null;

    const updates = {
      email: emailNorm,

      // campos de assinatura (se você já usa)
      subscription_status: isPaid ? "active" : "inactive",
      access_status: isPaid ? "active" : "inactive",
      access_until: accessUntil,
      access_origin: "paid",

      // ✅ ESTE é o que seu app usa pra travar exportar/edição
      can_write: !!isPaid,
    };

    const { data: updated, error: upErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", prof.id)
      .select("id,email,can_write,access_status,access_until,subscription_status,access_origin")
      .maybeSingle();

    if (upErr) throw upErr;

    return res.status(200).json({ ok: true, updated, norm });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || "Webhook error" });
  }
}
