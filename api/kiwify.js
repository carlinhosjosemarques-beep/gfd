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

function parseJsonSafe(rawText) {
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return {};
  }
}

function isEmailLike(v) {
  const s = String(v || "").trim();
  return s.includes("@") && s.includes(".") && s.length <= 254;
}

function getPath(obj, path) {
  try {
    return path.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
  } catch {
    return undefined;
  }
}

function findFirstEmailDeep(obj, maxNodes = 5000) {
  const queue = [{ v: obj, d: 0 }];
  let visited = 0;

  while (queue.length) {
    const { v, d } = queue.shift();
    visited++;
    if (visited > maxNodes) break;

    if (isEmailLike(v)) return String(v).toLowerCase().trim();
    if (!v || typeof v !== "object") continue;

    const keys = Object.keys(v);
    for (const k of keys) {
      const val = v[k];

      // prioridade: chaves comuns
      const kn = String(k).toLowerCase();
      if (
        kn === "email" ||
        kn === "customer_email" ||
        kn === "buyer_email" ||
        kn === "client_email" ||
        kn === "user_email"
      ) {
        if (isEmailLike(val)) return String(val).toLowerCase().trim();
      }

      // varre também strings parecidas
      if (typeof val === "string" && kn.includes("mail") && isEmailLike(val)) {
        return String(val).toLowerCase().trim();
      }

      if (typeof val === "object" && val !== null && d < 8) {
        queue.push({ v: val, d: d + 1 });
      }
    }
  }

  return "";
}

function pickEmail(body) {
  // caminhos mais comuns (inclui variações que a Kiwify costuma mandar)
  const candidates = [
    "customer.email",
    "buyer.email",
    "buyerEmail",
    "buyer_email",
    "customer_email",
    "email",
    "data.customer.email",
    "data.buyer.email",
    "data.customer_email",
    "data.buyer_email",
    "data.email",

    // variações dentro de order/purchase
    "order.customer.email",
    "order.buyer.email",
    "order.customer_email",
    "order.buyer_email",
    "order.email",
    "data.order.customer.email",
    "data.order.buyer.email",
    "data.order.customer_email",
    "data.order.buyer_email",
    "data.order.email",

    // variações com letras maiúsculas (alguns webhooks usam)
    "Customer.email",
    "Buyer.email",
    "Order.Customer.email",
    "Order.Buyer.email",
  ];

  for (const p of candidates) {
    const v = getPath(body, p);
    if (isEmailLike(v)) return String(v).toLowerCase().trim();
  }

  // fallback: varredura profunda
  return findFirstEmailDeep(body);
}

function pickEvent(body) {
  return (
    body?.event ||
    body?.type ||
    body?.webhook_event ||
    body?.data?.event ||
    body?.data?.type ||
    body?.data?.webhook_event ||
    body?.order?.event ||
    body?.order?.type ||
    body?.data?.order?.event ||
    body?.data?.order?.type ||
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
    body?.order?.status ||
    body?.order?.order_status ||
    body?.data?.order?.status ||
    body?.data?.order?.order_status ||
    ""
  );
}

function inferPaidBlocked(event, status) {
  const norm = `${event} ${status}`.toLowerCase();

  const isPaid =
    norm.includes("paid") ||
    norm.includes("approved") ||
    norm.includes("aprov") ||
    norm.includes("active") ||
    norm.includes("assinatura_ativa") ||
    norm.includes("assinatura ativa") ||
    norm.includes("renewed") ||
    norm.includes("renov") ||
    norm.includes("completed") ||
    norm.includes("success") ||
    norm.includes("compra aprovada");

  const isBlocked =
    norm.includes("canceled") ||
    norm.includes("cancel") ||
    norm.includes("refunded") ||
    norm.includes("refund") ||
    norm.includes("estorno") ||
    norm.includes("chargeback") ||
    norm.includes("past_due") ||
    norm.includes("overdue") ||
    norm.includes("inadimpl") ||
    norm.includes("expired") ||
    norm.includes("refused") ||
    norm.includes("recused") ||
    norm.includes("failed") ||
    norm.includes("compra recusada");

  return { isPaid, isBlocked, norm };
}

function addDaysISOFrom(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function normalizeSupabaseUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s}`;
}

function getSupabase() {
  const urlRaw = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const url = normalizeSupabaseUrl(urlRaw);

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
      console.log("[KIWIFY] raw len:", raw.length);
      console.log("[KIWIFY] sig received:", maskToken(receivedSig));
      console.log("[KIWIFY] has secret:", Boolean(secretForSignature));
      console.log("[KIWIFY] has token:", Boolean(tokenExpected));
      console.log("[KIWIFY] query keys:", Object.keys(req.query || {}));
      console.log("[KIWIFY] headers keys:", Object.keys(req.headers || {}));
      console.log("[KIWIFY] body keys:", Object.keys(body || {}));
    }

    // Auth: assinatura (preferida) ou token fixo (fallback)
    if (receivedSig && secretForSignature) {
      const expectedSig = computeHmacSha1Hex(secretForSignature, raw);
      if (debug) console.log("[KIWIFY] sig expected:", maskToken(expectedSig));

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
            "No signature secret configured and KIWIFY_WEBHOOK_TOKEN is not set (configure at least one auth method).",
        });
      }

      const tokenReceived = readFixedToken(req, body);

      if (debug) {
        console.log("[KIWIFY] token expected:", maskToken(tokenExpected));
        console.log("[KIWIFY] token received:", maskToken(tokenReceived));
      }

      if (!timingSafeEq(tokenReceived, tokenExpected)) {
        return res.status(401).json({ ok: false, error: "Invalid webhook token" });
      }
    }

    const emailNorm = pickEmail(body);
    const event = pickEvent(body);
    const status = pickStatus(body);
    const { isPaid, isBlocked, norm } = inferPaidBlocked(event, status);

    if (debug) {
      const orderId =
        body?.order_id ||
        body?.orderId ||
        body?.data?.order_id ||
        body?.data?.orderId ||
        body?.order?.id ||
        body?.data?.order?.id ||
        "";
      console.log("[KIWIFY] email:", emailNorm);
      console.log("[KIWIFY] orderId:", orderId);
      console.log("[KIWIFY] event:", event);
      console.log("[KIWIFY] status:", status);
      console.log("[KIWIFY] norm:", norm);
      console.log("[KIWIFY] isPaid:", isPaid, "isBlocked:", isBlocked);
    }

    if (!emailNorm) {
      // se o email não veio no payload, não tem como liberar automaticamente
      await tryInsertPayment(supabase, {
        email: null,
        provider: "kiwify",
        status: isPaid ? "active" : isBlocked ? "inactive" : "ignored",
        event: String(event || ""),
        norm: String(norm || ""),
        raw: body,
        created_at: new Date().toISOString(),
        note: "missing_email_in_payload",
      });

      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "missing_email_in_payload",
        norm,
      });
    }

    if (!isPaid && !isBlocked) {
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
