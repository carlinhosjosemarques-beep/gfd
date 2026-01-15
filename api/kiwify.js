import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const config = {
  api: {
    bodyParser: false,
  },
};

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

function readSignature(req) {
  const q = req.query || {};
  const h = req.headers || {};

  const sigQuery = (q.signature || q.sig || "").toString().trim();
  const sigHeader =
    (h["x-kiwify-signature"] ||
      h["x-webhook-signature"] ||
      h["x-signature"] ||
      "")
      .toString()
      .trim();

  return sigQuery || sigHeader || "";
}

function readFixedToken(req, body) {
  const h = req.headers || {};
  const headerToken =
    (h["x-kiwify-token"] ||
      h["x-webhook-token"] ||
      h["authorization"] ||
      "")
      .toString()
      .replace(/^Bearer\s+/i, "")
      .trim();

  const bodyToken =
    (body?.token || body?.webhook_token || body?.secret || "")
      .toString()
      .trim();

  return headerToken || bodyToken || "";
}

function computeHmacSha1Hex(secret, rawBodyBuffer) {
  return crypto.createHmac("sha1", secret).update(rawBodyBuffer).digest("hex");
}

function addDaysISO(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getEnv(name) {
  return String(process.env[name] || "").trim();
}

function getSupabase() {
  const url = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const key =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SERVICE_ROLE") ||
    getEnv("SUPABASE_SERVICE_ROLEKEY") ||
    getEnv("SUPABASE_SERVICE_ROLE");

  if (!url) throw new Error("Missing SUPABASE_URL env");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env");

  return createClient(url, key);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const debug = getEnv("DEBUG_WEBHOOK") === "true";

  try {
    const supabase = getSupabase();

    const raw = await readRawBody(req);
    const rawText = raw.toString("utf8") || "";

    let body = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      body = {};
    }

    const receivedSig = readSignature(req);

    const secretForSignature =
      getEnv("KIWIFY_WEBHOOK_SECRET") ||
      getEnv("KIWIFY_WEBHOOK_SIGNATURE_SECRET");

    const tokenExpected =
      getEnv("KIWIFY_WEBHOOK_TOKEN") || getEnv("KIWIFY_WEBHOOK_TOKEN_SECRET");

    if (debug) {
      console.log("[KIWIFY] sig received:", maskToken(receivedSig));
      console.log("[KIWIFY] has secret:", Boolean(secretForSignature));
      console.log("[KIWIFY] has token:", Boolean(tokenExpected));
      console.log("[KIWIFY] query keys:", Object.keys(req.query || {}));
      console.log("[KIWIFY] headers keys:", Object.keys(req.headers || {}));
      console.log("[KIWIFY] body keys:", Object.keys(body || {}));
      console.log("[KIWIFY] raw len:", raw.length);
    }

    if (receivedSig && secretForSignature) {
      const expectedSig = computeHmacSha1Hex(secretForSignature, raw);

      if (debug) {
        console.log("[KIWIFY] sig expected:", maskToken(expectedSig));
      }

      if (!timingSafeEq(receivedSig, expectedSig)) {
        return res.status(401).json({
          ok: false,
          error: "Invalid signature",
          hint: debug
            ? {
                received: maskToken(receivedSig),
                expected: maskToken(expectedSig),
              }
            : undefined,
        });
      }
    } else {
      if (!tokenExpected) {
        return res.status(401).json({
          ok: false,
          error:
            "No valid signature secret configured and KIWIFY_WEBHOOK_TOKEN is not set (configure at least one auth method).",
        });
      }

      const tokenReceived = readFixedToken(req, body);

      if (debug) {
        console.log("[KIWIFY] token expected:", maskToken(tokenExpected));
        console.log("[KIWIFY] token received:", maskToken(tokenReceived));
      }

      if (tokenReceived !== tokenExpected) {
        return res.status(401).json({ ok: false, error: "Invalid webhook token" });
      }
    }

    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.email ||
      body?.data?.customer?.email ||
      body?.data?.email;

    if (!email) {
      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "missing_email_in_payload",
      });
    }

    const emailNorm = String(email).toLowerCase().trim();

    const event =
      body?.event || body?.type || body?.webhook_event || body?.data?.event || "";

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
        warning:
          "No profile found for this email. User must sign up in the app with same email.",
      });
    }

    if (prof.access_origin === "admin" || prof.access_origin === "promo") {
      return res.status(200).json({
        ok: true,
        skipped: "manual_access_protected",
      });
    }

    const updates = {
      email: emailNorm,
      subscription_status: isPaid ? "active" : "inactive",
      access_status: isPaid ? "active" : "inactive",
      access_until: isPaid ? addDaysISO(new Date(), 30) : null,
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

    return res.status(200).json({ ok: true, updated, norm });
  } catch (e) {
    console.error("[KIWIFY] error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Webhook error" });
  }
}
