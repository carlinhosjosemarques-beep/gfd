import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function env(name) {
  return String(process.env[name] || "").trim();
}

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

function normalizeSig(sig) {
  return String(sig || "")
    .trim()
    .replace(/^sha1\s*=\s*/i, "")
    .replace(/^hmac\s*=\s*/i, "")
    .toLowerCase();
}

function readSignature(req) {
  const q = req.query || {};
  const h = req.headers || {};

  const sigQuery = (q.signature || q.sig || "").toString().trim();
  const sigHeader =
    (h["x-kiwify-signature"] ||
      h["x-webhook-signature"] ||
      h["x-signature"] ||
      h["x-hook-signature"] ||
      "")
      .toString()
      .trim();

  return normalizeSig(sigQuery || sigHeader || "");
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
    (body?.token || body?.webhook_token || body?.secret || body?.data?.token || "")
      .toString()
      .trim();

  return headerToken || bodyToken || "";
}

function computeHmacSha1Hex(secret, rawBodyBuffer) {
  return crypto.createHmac("sha1", secret).update(rawBodyBuffer).digest("hex");
}

function parseJsonSafe(rawText) {
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return {};
  }
}

function pickEmail(body) {
  const email =
    body?.customer?.email ||
    body?.buyer?.email ||
    body?.customer_email ||
    body?.email ||
    body?.data?.customer?.email ||
    body?.data?.buyer?.email ||
    body?.data?.email ||
    body?.data?.customer_email ||
    body?.data?.customer?.email_address ||
    body?.customer?.email_address;

  return email ? String(email).toLowerCase().trim() : "";
}

function pickEvent(body) {
  return (
    body?.event ||
    body?.type ||
    body?.webhook_event ||
    body?.event_name ||
    body?.name ||
    body?.data?.event ||
    body?.data?.type ||
    body?.data?.webhook_event ||
    body?.data?.event_name ||
    body?.data?.name ||
    ""
  );
}

function pickStatus(body) {
  return (
    body?.status ||
    body?.data?.status ||
    body?.subscription?.status ||
    body?.order_status ||
    body?.data?.order_status ||
    body?.sale_status ||
    body?.data?.sale_status ||
    body?.payment_status ||
    body?.data?.payment_status ||
    ""
  );
}

function inferPaidBlocked(event, status) {
  const e = String(event || "");
  const s = String(status || "");
  const norm = `${e} ${s}`.toLowerCase().trim();

  const paidNeedles = [
    "compra aprovada",
    "compra_aprovada",
    "purchase_approved",
    "approved",
    "aprov",
    "paid",
    "pago",
    "completed",
    "success",
    "confirmed",
    "confirmado",
    "payment_approved",
    "pix_paid",
    "pix aprovado",
    "assinatura renovada",
    "assinatura_renovada",
    "subscription_renewed",
    "renewed",
    "renew",
    "assinatura ativa",
    "assinatura_ativa",
    "active",
  ];

  const blockedNeedles = [
    "compra recusada",
    "compra_recusada",
    "purchase_refused",
    "refused",
    "recused",
    "failed",
    "cancelada",
    "canceled",
    "cancelled",
    "cancel",
    "reembolso",
    "refunded",
    "estorno",
    "chargeback",
    "expired",
    "expir",
    "past_due",
    "overdue",
    "atrasada",
    "inadimpl",
    "inactive",
    "inativa",
  ];

  const isPaid = paidNeedles.some((k) => norm.includes(k));
  const isBlocked = blockedNeedles.some((k) => norm.includes(k));

  return { isPaid, isBlocked, norm };
}

function addDaysISOFrom(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getSupabase() {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key =
    env("SUPABASE_SERVICE_ROLE_KEY") ||
    env("SUPABASE_SERVICE_ROLE") ||
    env("SUPABASE_SERVICE_ROLEKEY");

  if (!url) throw new Error("Missing SUPABASE_URL env");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function tryInsertPayment(supabase, payload) {
  try {
    const { error } = await supabase.from("payments").insert(payload);
    if (error) console.warn("[KIWIFY] payments insert skipped:", error.message);
  } catch (e) {
    console.warn("[KIWIFY] payments insert skipped:", e?.message || e);
  }
}

function pickOrderId(body) {
  return (
    body?.order_id ||
    body?.order?.id ||
    body?.sale_id ||
    body?.sale?.id ||
    body?.subscription?.id ||
    body?.data?.order_id ||
    body?.data?.order?.id ||
    body?.data?.sale_id ||
    body?.data?.sale?.id ||
    body?.data?.subscription?.id ||
    ""
  );
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const debug = env("DEBUG_WEBHOOK") === "true";

  try {
    const supabase = getSupabase();

    const raw = await readRawBody(req);
    const rawText = raw.toString("utf8") || "";
    const body = parseJsonSafe(rawText);

    const receivedSig = readSignature(req);

    const secretForSignature =
      env("KIWIFY_WEBHOOK_SECRET") || env("KIWIFY_WEBHOOK_SIGNATURE_SECRET");

    const tokenExpected =
      env("KIWIFY_WEBHOOK_TOKEN") || env("KIWIFY_WEBHOOK_TOKEN_SECRET");

    if (debug) {
      console.log("[KIWIFY] sig received:", maskToken(receivedSig));
      console.log("[KIWIFY] has secret:", Boolean(secretForSignature));
      console.log("[KIWIFY] has token:", Boolean(tokenExpected));
      console.log("[KIWIFY] query keys:", Object.keys(req.query || {}));
      console.log("[KIWIFY] headers keys:", Object.keys(req.headers || {}));
      console.log("[KIWIFY] body keys:", Object.keys(body || {}));
      console.log("[KIWIFY] raw len:", raw.length);
    }

    // Auth: assinatura (preferida) ou token fixo (fallback)
    if (receivedSig && secretForSignature) {
      const expectedSig = normalizeSig(computeHmacSha1Hex(secretForSignature, raw));
      if (debug) console.log("[KIWIFY] sig expected:", maskToken(expectedSig));

      if (!timingSafeEq(receivedSig, expectedSig)) {
        await tryInsertPayment(supabase, {
          provider: "kiwify",
          status: "rejected",
          event: String(pickEvent(body) || ""),
          norm: "invalid_signature",
          raw: body,
          created_at: new Date().toISOString(),
          note: "invalid_signature",
        });

        return res.status(401).json({
          ok: false,
          error: "Invalid signature",
          hint: debug
            ? { received: maskToken(receivedSig), expected: maskToken(expectedSig) }
            : undefined,
        });
      }
    } else {
      if (!tokenExpected) {
        return res.status(401).json({
          ok: false,
          error:
            "No signature secret configured and KIWIFY_WEBHOOK_TOKEN is not set (configure at least one auth method).",
        });
      }

      const tokenReceived = readFixedToken(req, body);

      if (debug) {
        console.log("[KIWIFY] token expected:", maskToken(tokenExpected));
        console.log("[KIWIFY] token received:", maskToken(tokenReceived));
      }

      if (!timingSafeEq(tokenReceived, tokenExpected)) {
        await tryInsertPayment(supabase, {
          provider: "kiwify",
          status: "rejected",
          event: String(pickEvent(body) || ""),
          norm: "invalid_token",
          raw: body,
          created_at: new Date().toISOString(),
          note: "invalid_token",
        });

        return res.status(401).json({ ok: false, error: "Invalid webhook token" });
      }
    }

    const emailNorm = pickEmail(body);
    const orderId = String(pickOrderId(body) || "").trim();
    const event = pickEvent(body);
    const status = pickStatus(body);
    const { isPaid, isBlocked, norm } = inferPaidBlocked(event, status);

    if (debug) {
      console.log("[KIWIFY] email:", emailNorm);
      console.log("[KIWIFY] orderId:", orderId);
      console.log("[KIWIFY] event:", event);
      console.log("[KIWIFY] status:", status);
      console.log("[KIWIFY] norm:", norm);
      console.log("[KIWIFY] isPaid:", isPaid, "isBlocked:", isBlocked);
    }

    if (!emailNorm) {
      await tryInsertPayment(supabase, {
        provider: "kiwify",
        status: "ignored",
        event: String(event || ""),
        norm: String(norm || ""),
        raw: body,
        created_at: new Date().toISOString(),
        note: "missing_email_in_payload",
        external_id: orderId || null,
      });

      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "missing_email_in_payload",
      });
    }

    if (!isPaid && !isBlocked) {
      await tryInsertPayment(supabase, {
        email: emailNorm,
        provider: "kiwify",
        status: "ignored",
        event: String(event || ""),
        norm: String(norm || ""),
        raw: body,
        created_at: new Date().toISOString(),
        note: "ignored_unmatched_event_status",
        external_id: orderId || null,
      });

      return res.status(200).json({ ok: true, ignored: true, norm });
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, email, access_origin, access_until")
      .eq("email", emailNorm)
      .maybeSingle();

    if (profErr) throw profErr;

    if (!prof) {
      await tryInsertPayment(supabase, {
        email: emailNorm,
        provider: "kiwify",
        status: isPaid ? "active" : "inactive",
        event: String(event || ""),
        norm: String(norm || ""),
        raw: body,
        created_at: new Date().toISOString(),
        note: "profile_not_found",
        external_id: orderId || null,
      });

      return res.status(200).json({
        ok: true,
        warning:
          "No profile found for this email. User must sign up in the app with same email.",
        norm,
      });
    }

    if (prof.access_origin === "admin" || prof.access_origin === "promo") {
      await tryInsertPayment(supabase, {
        user_id: prof.id,
        email: emailNorm,
        provider: "kiwify",
        status: "skipped",
        event: String(event || ""),
        norm: String(norm || ""),
        raw: body,
        created_at: new Date().toISOString(),
        note: "manual_access_protected",
        external_id: orderId || null,
      });

      return res.status(200).json({
        ok: true,
        skipped: "manual_access_protected",
        norm,
      });
    }

    const now = new Date();
    const currentUntil = prof.access_until ? new Date(prof.access_until) : null;
    const base =
      currentUntil && currentUntil.getTime() > now.getTime() ? currentUntil : now;

    const updates = {
      email: emailNorm,
      subscription_status: isPaid ? "active" : "inactive",
      access_status: isPaid ? "active" : "inactive",
      access_until: isPaid ? addDaysISOFrom(base, 30) : null,
      access_origin: isPaid ? "paid" : "inactive",
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: upErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", prof.id)
      .select("id,email,access_status,access_until,subscription_status,access_origin")
      .maybeSingle();

    if (upErr) throw upErr;

    await tryInsertPayment(supabase, {
      user_id: prof.id,
      email: emailNorm,
      provider: "kiwify",
      status: isPaid ? "active" : "inactive",
      event: String(event || ""),
      norm: String(norm || ""),
      access_until: updated?.access_until || updates.access_until,
      raw: body,
      created_at: new Date().toISOString(),
      external_id: orderId || null,
    });

    return res.status(200).json({ ok: true, updated, norm });
  } catch (e) {
    console.error("[KIWIFY] error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Webhook error",
    });
  }
}
