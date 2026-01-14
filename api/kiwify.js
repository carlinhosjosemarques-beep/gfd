import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ NUNCA expor no front
);

// ✅ máscara pra log (não vaza segredo)
function maskToken(t) {
  const s = String(t || "");
  if (!s) return "";
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}***${s.slice(-3)}(len=${s.length})`;
}

// ✅ pega token do header / body / query (caso exista)
function readToken(req, body) {
  const h = req.headers || {};

  const headerCandidates = [
    h["x-kiwify-token"],
    h["x-webhook-token"],
    h["x-kiwify-webhook-token"],
    h["x-hook-token"],
    h["x-token"],
    h["authorization"],
  ];

  const headerTokenRaw = headerCandidates.find(Boolean) || "";
  const headerToken =
    typeof headerTokenRaw === "string"
      ? headerTokenRaw.replace(/^Bearer\s+/i, "").trim()
      : Array.isArray(headerTokenRaw)
        ? String(headerTokenRaw[0] || "").trim()
        : "";

  const bodyToken =
    (body?.token ||
      body?.Token ||
      body?.webhook_token ||
      body?.webhookToken ||
      body?.secret ||
      body?.Secret ||
      body?.data?.token ||
      body?.data?.webhook_token ||
      body?.data?.secret ||
      "").toString().trim();

  const queryToken =
    (req.query?.token || req.query?.webhook_token || req.query?.secret || "")
      .toString()
      .trim();

  return headerToken || bodyToken || queryToken || "";
}

// ✅ pega signature (Kiwify está mandando via query "signature")
function readSignature(req) {
  const h = req.headers || {};
  const sig =
    req.query?.signature ||
    h["x-kiwify-signature"] ||
    h["x-webhook-signature"] ||
    h["x-signature"] ||
    "";
  return String(sig || "").trim();
}

// ✅ valida HMAC da Kiwify (sha1 normalmente dá 40 chars)
function validateSignature({ signature, secret, rawBody }) {
  if (!signature) return false;

  const sig = signature.toLowerCase();

  // tenta SHA1 (40 hex) e SHA256 (64 hex), sem assumir
  const sha1 = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");
  if (sha1 === sig) return true;

  const sha256 = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (sha256 === sig) return true;

  return false;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default async function handler(req, res) {
  // ✅ Ajuda preflight / chamadas acidentais
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const expectedToken = (process.env.KIWIFY_WEBHOOK_TOKEN || "").trim();
    const debug = String(process.env.DEBUG_WEBHOOK || "").trim() === "true";

    if (!expectedToken) {
      return res.status(500).json({ ok: false, error: "Missing KIWIFY_WEBHOOK_TOKEN env" });
    }

    // body (Vercel às vezes manda string)
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    const receivedToken = readToken(req, body);
    const receivedSignature = readSignature(req);

    // ✅ validação: aceita (1) signature válida OU (2) token igual
    const signatureOk = validateSignature({
      signature: receivedSignature,
      secret: expectedToken,
      rawBody,
    });

    const tokenOk = receivedToken && receivedToken === expectedToken;

    if (debug) {
      console.log("[KIWIFY] expected(secret):", maskToken(expectedToken));
      console.log("[KIWIFY] received token:", maskToken(receivedToken));
      console.log("[KIWIFY] received signature:", maskToken(receivedSignature));
      console.log("[KIWIFY] signature ok?:", signatureOk);
      console.log("[KIWIFY] token ok?:", tokenOk);
      console.log("[KIWIFY] query keys:", Object.keys(req.query || {}));
      console.log("[KIWIFY] headers keys:", Object.keys(req.headers || {}));
      console.log("[KIWIFY] body keys:", Object.keys(body || {}));
    }

    if (!signatureOk && !tokenOk) {
      return res.status(401).json({
        ok: false,
        error: "Invalid webhook auth (token/signature)",
        hint: debug
          ? {
              expected: maskToken(expectedToken),
              receivedToken: maskToken(receivedToken),
              receivedSignature: maskToken(receivedSignature),
              signatureOk,
              tokenOk,
            }
          : undefined,
      });
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
      body?.order_status ||
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
      return res.status(200).json({ ok: true, ignored: true, norm });
    }

    // ✅ Busca profile
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, email, access_origin")
      .eq("email", emailNorm)
      .maybeSingle();

    if (profErr) throw profErr;

    if (!prof) {
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
    const updates = {
      email: emailNorm,
      subscription_status: isPaid ? "active" : "inactive",
      access_status: isPaid ? "active" : "inactive",
      access_until: isPaid ? addDays(new Date(), 30) : null,
      access_origin: "paid",
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
    console.error("[KIWIFY] error:", e);
    return res.status(400).json({ ok: false, error: e?.message || "Webhook error" });
  }
}
