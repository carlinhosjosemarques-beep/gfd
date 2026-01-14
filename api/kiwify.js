import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false, // ✅ necessário para ler o RAW body e validar signature
  },
};

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

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ✅ Pega signature (Kiwify está mandando via query ?signature=...)
function readSignature(req) {
  const q = req.query || {};
  const h = req.headers || {};

  const sigQuery = (q.signature || q.sig || "").toString().trim();
  const sigHeader =
    (h["x-kiwify-signature"] ||
      h["x-webhook-signature"] ||
      h["x-signature"] ||
      "").toString().trim();

  return sigQuery || sigHeader || "";
}

// ✅ (fallback) se um dia a Kiwify mandar token fixo no header
function readFixedToken(req, body) {
  const h = req.headers || {};
  const headerToken =
    (h["x-kiwify-token"] ||
      h["x-webhook-token"] ||
      h["authorization"] ||
      "").toString().replace(/^Bearer\s+/i, "").trim();

  const bodyToken =
    (body?.token || body?.webhook_token || body?.secret || "").toString().trim();

  return headerToken || bodyToken || "";
}

function computeHmacSha1Hex(secret, rawBodyBuffer) {
  return crypto.createHmac("sha1", secret).update(rawBodyBuffer).digest("hex");
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const debug = String(process.env.DEBUG_WEBHOOK || "").trim() === "true";

  try {
    const secret = (process.env.KIWIFY_WEBHOOK_SECRET || "").trim();
    if (!secret) {
      return res.status(500).json({
        ok: false,
        error: "Missing KIWIFY_WEBHOOK_SECRET env",
      });
    }

    // ✅ raw body
    const raw = await readRawBody(req);
    const rawText = raw.toString("utf8") || "";

    // ✅ parse body (se vier vazio ou inválido, não quebra)
    let body = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = {};
    }

    // ✅ 1) Validação por SIGNATURE (se vier)
    const receivedSig = readSignature(req);

    if (debug) {
      console.log("[KIWIFY] secret:", maskToken(secret));
      console.log("[KIWIFY] signature received:", maskToken(receivedSig));
      console.log("[KIWIFY] query keys:", Object.keys(req.query || {}));
      console.log("[KIWIFY] headers keys:", Object.keys(req.headers || {}));
      console.log("[KIWIFY] body keys:", Object.keys(body || {}));
      console.log("[KIWIFY] raw len:", raw.length);
    }

    if (receivedSig) {
      const expectedSig = computeHmacSha1Hex(secret, raw);

      if (debug) {
        console.log("[KIWIFY] signature expected:", maskToken(expectedSig));
      }

      if (!timingSafeEq(receivedSig, expectedSig)) {
        return res.status(401).json({
          ok: false,
          error: "Invalid signature",
          hint: debug
            ? { received: maskToken(receivedSig), expected: maskToken(expectedSig) }
            : undefined,
        });
      }
    } else {
      // ✅ 2) fallback: token fixo (caso você mude no painel da Kiwify)
      const tokenExpected = (process.env.KIWIFY_WEBHOOK_TOKEN || "").trim();
      const tokenReceived = readFixedToken(req, body);

      if (!tokenExpected) {
        return res.status(401).json({
          ok: false,
          error:
            "No signature received and KIWIFY_WEBHOOK_TOKEN is not set (configure one auth method).",
        });
      }

      if (debug) {
        console.log("[KIWIFY] token expected:", maskToken(tokenExpected));
        console.log("[KIWIFY] token received:", maskToken(tokenReceived));
      }

      if (tokenReceived !== tokenExpected) {
        return res.status(401).json({
          ok: false,
          error: "Invalid webhook token",
        });
      }
    }

    // ✅ daqui pra baixo: seu fluxo normal
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

    if (prof.access_origin === "admin" || prof.access_origin === "promo") {
      return res.status(200).json({ ok: true, skipped: "manual_access_protected" });
    }

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
