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
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

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

    /**
     * ⚠️ A estrutura exata do payload pode variar.
     * Por isso, pegamos email e status de vários lugares possíveis.
     */
    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.email ||
      body?.data?.customer?.email ||
      body?.data?.email;

    if (!email) {
      return res.status(400).json({ ok: false, error: "Missing customer email in payload" });
    }

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

    // ✅ Regra base:
    // - pagamento aprovado / assinatura ativa => libera
    // - cancelado / estornado / chargeback / atrasado => bloqueia novos lançamentos
    let access_status = "inactive";
    let subscription_status = "inactive";

    const isPaid =
      norm.includes("paid") ||
      norm.includes("approved") ||
      norm.includes("aprov") ||
      norm.includes("active") ||
      norm.includes("assinatura_ativa");

    const isBlocked =
      norm.includes("canceled") ||
      norm.includes("cancel") ||
      norm.includes("refunded") ||
      norm.includes("estorno") ||
      norm.includes("chargeback") ||
      norm.includes("past_due") ||
      norm.includes("overdue") ||
      norm.includes("inadimpl") ||
      norm.includes("expired");

    if (isPaid) {
      access_status = "active";
      subscription_status = "active";
    } else if (isBlocked) {
      access_status = "inactive";
      subscription_status = "inactive";
    } else {
      // Se vier evento desconhecido, não quebra — só registra como ok
      return res.status(200).json({ ok: true, ignored: true });
    }

    // ✅ Atualiza pelo email (importante: o usuário precisa se cadastrar no app com o mesmo email da compra)
    // Extende acesso por 30 dias quando pago (pode mudar para 31, etc.)
    const now = new Date().toISOString();
    const newAccessUntil = addDays(new Date(), 30);

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({
        subscription_status,
        access_status,
        access_until: access_status === "active" ? newAccessUntil : null,
        email: email.toLowerCase().trim(),
        updated_at: now, // se você tiver essa coluna (se não tiver, pode remover)
      })
      .eq("email", email.toLowerCase().trim())
      .select("id,email,access_status,access_until,subscription_status");

    if (error) throw error;

    // Se não achou profile, provavelmente a pessoa comprou antes de criar conta no app
    if (!updated || updated.length === 0) {
      return res.status(200).json({
        ok: true,
        warning: "No profile found for this email. User must sign up in the app with same email.",
      });
    }

    return res.status(200).json({ ok: true, updated: updated[0] });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || "Webhook error" });
  }
}
