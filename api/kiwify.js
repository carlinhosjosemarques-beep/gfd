import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ nunca no front
);

// ======================
// Utils
// ======================
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function mask(t = "") {
  if (!t) return "";
  if (t.length <= 6) return "***";
  return `${t.slice(0, 3)}***${t.slice(-3)}(len=${t.length})`;
}

// ======================
// Assinatura Kiwify
// ======================
function isValidSignature({ rawBody, receivedSignature, secret }) {
  if (!receivedSignature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(receivedSignature)
  );
}

// ======================
// Handler
// ======================
export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const secret = (process.env.KIWIFY_WEBHOOK_TOKEN || "").trim();
    const debug = process.env.DEBUG_WEBHOOK === "true";

    if (!secret) {
      return res.status(500).json({
        ok: false,
        error: "Missing KIWIFY_WEBHOOK_TOKEN env",
      });
    }

    // ⚠️ Vercel pode entregar body como string
    const rawBody =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body || {});

    const body = JSON.parse(rawBody);

    const receivedSignature =
      req.query?.signature ||
      req.headers?.["x-kiwify-signature"] ||
      "";

    if (debug) {
      console.log("[KIWIFY] secret:", mask(secret));
      console.log("[KIWIFY] signature received:", mask(receivedSignature));
      console.log("[KIWIFY] body keys:", Object.keys(body || {}));
    }

    // ✅ VALIDAÇÃO CORRETA
    const valid = isValidSignature({
      rawBody,
      receivedSignature,
      secret,
    });

    if (!valid) {
      return res.status(401).json({
        ok: false,
        error: "Invalid webhook signature",
      });
    }

    // ======================
    // Email
    // ======================
    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.email ||
      body?.data?.customer?.email ||
      body?.data?.email;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: "Missing customer email",
      });
    }

    const emailNorm = email.toLowerCase().trim();

    // ======================
    // Status
    // ======================
    const event = body?.event || body?.type || "";
    const status = body?.order_status || body?.status || "";

    const norm = `${event} ${status}`.toLowerCase();

    const isPaid =
      norm.includes("paid") ||
      norm.includes("approved") ||
      norm.includes("aprov") ||
      norm.includes("active") ||
      norm.includes("renew");

    const isBlocked =
      norm.includes("cancel") ||
      norm.includes("refunded") ||
      norm.includes("chargeback") ||
      norm.includes("expired") ||
      norm.includes("overdue");

    if (!isPaid && !isBlocked) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    // ======================
    // Profile
    // ======================
    const { data: prof, error } = await supabase
      .from("profiles")
      .select("id, access_origin")
      .eq("email", emailNorm)
      .maybeSingle();

    if (error) throw error;

    if (!prof) {
      return res.status(200).json({
        ok: true,
        warning: "User not found yet",
      });
    }

    if (["admin", "promo"].includes(prof.access_origin)) {
      return res.status(200).json({
        ok: true,
        skipped: "manual_access_protected",
      });
    }

    const updates = {
      access_status: isPaid ? "active" : "inactive",
      subscription_status: isPaid ? "active" : "inactive",
      access_until: isPaid ? addDays(new Date(), 30) : null,
      access_origin: "paid",
    };

    const { error: upErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", prof.id);

    if (upErr) throw upErr;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[KIWIFY] ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "Webhook processing error",
    });
  }
}
