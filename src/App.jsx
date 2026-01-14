import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

import Login from "./Login";
import Dashboard from "./Dashboard";
import Relatorios from "./Relatorios";
import Metas from "./Metas";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = carregando
  const [tab, setTab] = useState("dashboard");

  // ✅ perfil (para evitar erro de acesso/RLS e para liberar paywall no futuro)
  const [profile, setProfile] = useState(undefined); // undefined = carregando, null = não existe
  const [profileErr, setProfileErr] = useState(null);
  const [checkingProfile, setCheckingProfile] = useState(false);

  // Tema global (tudo junto)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("gfd_theme");
    if (saved === "dark" || saved === "light") return saved;
    return "light";
  });

  // aplica dataset + classe + color-scheme
  useEffect(() => {
    localStorage.setItem("gfd_theme", theme);

    const root = document.documentElement;
    root.dataset.gfdTheme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  // sessão + listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const tokens = useMemo(() => {
    const dark = theme === "dark";
    return {
      dark,
      bg: dark ? "#070B14" : "#F6F7FB",
      card: dark ? "rgba(17,24,39,0.78)" : "rgba(255,255,255,0.92)",
      card2: dark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.85)",
      text: dark ? "#E5E7EB" : "#0F172A",
      muted: dark ? "rgba(226,232,240,0.74)" : "rgba(15,23,42,0.62)",
      border: dark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.12)",
      shadowSoft: dark
        ? "0 18px 45px rgba(0,0,0,0.45)"
        : "0 18px 45px rgba(15,23,42,0.10)",
      accent: "#2563EB",
      accent2: "#22C55E",
      warn: "#F97316",
      controlBg: dark ? "rgba(2,6,23,0.35)" : "rgba(255,255,255,0.9)",
      controlBg2: dark ? "rgba(2,6,23,0.55)" : "rgba(255,255,255,1)",
      focusRing: dark ? "0 0 0 3px rgba(56,189,248,0.22)" : "0 0 0 3px rgba(37,99,235,0.18)",
      tabActiveBg: dark ? "rgba(37,99,235,0.22)" : "rgba(37,99,235,0.10)",
      tabActiveBorder: dark ? "rgba(96,165,250,0.55)" : "rgba(37,99,235,0.35)",
      tabHoverBg: dark ? "rgba(148,163,184,0.10)" : "rgba(15,23,42,0.06)",
    };
  }, [theme]);

  // aplica CSS vars globalmente
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--bg", tokens.bg);
    r.setProperty("--card", tokens.card);
    r.setProperty("--card2", tokens.card2);
    r.setProperty("--text", tokens.text);
    r.setProperty("--muted", tokens.muted);
    r.setProperty("--border", tokens.border);
    r.setProperty("--shadowSoft", tokens.shadowSoft);
    r.setProperty("--accent", tokens.accent);
    r.setProperty("--accent2", tokens.accent2);
    r.setProperty("--warn", tokens.warn);
    r.setProperty("--controlBg", tokens.controlBg);
    r.setProperty("--controlBg2", tokens.controlBg2);
    r.setProperty("--focusRing", tokens.focusRing);
    r.setProperty("--tabActiveBg", tokens.tabActiveBg);
    r.setProperty("--tabActiveBorder", tokens.tabActiveBorder);
    r.setProperty("--tabHoverBg", tokens.tabHoverBg);
  }, [tokens]);

  // ======= helpers (canWrite) =======

  function parseDateSafe(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function computeCanWrite(p) {
    // sem profile => modo leitura
    if (!p) return false;

    // admin sempre pode
    if (p.is_admin === true) return true;

    // suportar schema "novo"
    const accessStatus = p.access_status;
    const accessUntil = parseDateSafe(p.access_until);

    // suportar schema "antigo"
    const accessGranted = p.access_granted;
    const accessExpiresAt = parseDateSafe(p.access_expires_at);
    const subStatus = String(p.subscription_status || "").toLowerCase();

    const now = new Date();

    const notExpiredNew = !accessUntil || accessUntil > now;
    const notExpiredOld = !accessExpiresAt || accessExpiresAt > now;

    // critérios possíveis
    const okByAccessStatus = accessStatus === "active" && notExpiredNew;
    const okByGranted = accessGranted === true && notExpiredOld;

    // se você usa subscription_status, considere "active/paid"
    const okBySubscription =
      (subStatus === "active" || subStatus === "paid" || subStatus === "approved") &&
      (notExpiredNew || notExpiredOld);

    return !!(okByAccessStatus || okByGranted || okBySubscription);
  }

  const canWrite = useMemo(() => computeCanWrite(profile), [profile]);

  // ✅ Carrega profile quando loga (apenas SELECT) + fallback (não quebra se colunas não existirem)
  async function fetchProfile(u) {
    if (!u?.id) {
      setProfile(undefined);
      setProfileErr(null);
      return;
    }

    setCheckingProfile(true);
    setProfileErr(null);

    async function trySelect(cols) {
      const { data, error } = await supabase
        .from("profiles")
        .select(cols)
        .eq("id", u.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    }

    try {
      // 1) tenta pegar tudo (novo + antigo). Se alguma coluna não existir, cai no catch.
      const colsAll =
        "id,email,created_at,updated_at,is_admin,access_status,access_until,subscription_status,access_granted,access_origin,access_expires_at";
      const data1 = await trySelect(colsAll);
      setProfile(data1);
    } catch (e1) {
      try {
        // 2) fallback para o seu schema “print” atual (antigo)
        const colsLegacy =
          "id,email,created_at,access_granted,access_origin,access_expires_at,subscription_status";
        const data2 = await trySelect(colsLegacy);
        setProfile(data2);
      } catch (e2) {
        try {
          // 3) último fallback (mínimo)
          const data3 = await trySelect("id,email,created_at");
          setProfile(data3);
        } catch (e3) {
          setProfile(undefined);
          setProfileErr(e3?.message || e2?.message || e1?.message || "Não foi possível verificar seu acesso.");
        }
      }
    } finally {
      setCheckingProfile(false);
    }
  }

  useEffect(() => {
    if (user && user !== null) fetchProfile(user);
    if (user === null) {
      setProfile(undefined);
      setProfileErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ====== telas de estado ======
  if (user === undefined) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.centerCard, textAlign: "center" }}>
          <div style={styles.spinner} />
          <div style={{ marginTop: 12, color: "var(--muted)", fontWeight: 900 }}>Carregando…</div>
        </div>
      </div>
    );
  }

  if (user === null) {
    return (
      <div style={styles.page}>
        <Login theme={theme} setTheme={setTheme} />
      </div>
    );
  }

  // ✅ Se deu erro ao carregar profile
  if (profileErr) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.centerCard }}>
          <div style={{ fontWeight: 1000, fontSize: 16 }}>Não foi possível verificar seu acesso</div>
          <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 900, lineHeight: 1.4 }}>
            {profileErr}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={() => fetchProfile(user)} style={styles.primaryBtn} disabled={checkingProfile}>
              {checkingProfile ? "Aguarde..." : "Tentar novamente"}
            </button>

            <button onClick={() => supabase.auth.signOut()} style={styles.dangerBtn}>
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Caso extremamente raro: profile ainda não existe (trigger não rodou)
  if (profile === null) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.centerCard }}>
          <div style={{ fontWeight: 1000, fontSize: 16 }}>Seu perfil ainda não foi criado</div>
          <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 900, lineHeight: 1.4 }}>
            Isso normalmente acontece quando o trigger de criação automática do perfil ainda não está configurado
            no Supabase. Rode o SQL que eu te passei e depois clique em atualizar.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={() => fetchProfile(user)} style={styles.primaryBtn} disabled={checkingProfile}>
              {checkingProfile ? "Aguarde..." : "Atualizar"}
            </button>

            <button onClick={() => supabase.auth.signOut()} style={styles.dangerBtn}>
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Aqui profile existe e não dá mais RLS/erro
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        {/* Topbar */}
        <header style={styles.topbar}>
          <div style={styles.brand}>
            <LogoMark />
            <div>
              <div style={styles.brandTitle}>GFD</div>
              <div style={styles.brandSub}>Gestão Financeira Descomplicada</div>
            </div>

            {/* ✅ badge de acesso */}
            {!canWrite ? (
              <span
                style={{
                  marginLeft: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.12)",
                  fontWeight: 1000,
                  fontSize: 12,
                  color: "var(--text)",
                }}
                title="Conta em modo leitura"
              >
                🔒 Modo leitura
              </span>
            ) : null}
          </div>

          <div style={styles.topbarActions}>
            <button
              onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
              style={styles.ghostBtn}
              title="Alternar tema"
            >
              {tokens.dark ? "🌙 Dark" : "☀️ Light"}
            </button>

            <button onClick={() => supabase.auth.signOut()} style={styles.dangerBtn} title="Sair">
              Sair
            </button>
          </div>
        </header>

        {/* Tabs */}
        <nav style={styles.tabs}>
          <button
            onClick={() => setTab("dashboard")}
            style={tabStyle(tab === "dashboard")}
            aria-current={tab === "dashboard" ? "page" : undefined}
          >
            📋 Dashboard
          </button>

          <button
            onClick={() => setTab("relatorios")}
            style={tabStyle(tab === "relatorios")}
            aria-current={tab === "relatorios" ? "page" : undefined}
          >
            📊 Relatórios
          </button>

          <button
            onClick={() => setTab("metas")}
            style={tabStyle(tab === "metas")}
            aria-current={tab === "metas" ? "page" : undefined}
          >
            🎯 Metas
          </button>
        </nav>

        {/* Conteúdo */}
        <main style={styles.content}>
          {tab === "dashboard" && <Dashboard canWrite={canWrite} />}
          {tab === "relatorios" && <Relatorios canWrite={canWrite} />}
          {tab === "metas" && <Metas canWrite={canWrite} />}
        </main>

        <footer style={styles.footer}>
          <span style={{ color: "var(--muted)", fontWeight: 800 }}>
            © {new Date().getFullYear()} GFD • versão profissional
          </span>
        </footer>
      </div>
    </div>
  );
}

/* ================= UI helpers ================= */

function tabStyle(active) {
  return {
    border: `1px solid ${active ? "var(--tabActiveBorder)" : "var(--border)"}`,
    background: active ? "var(--tabActiveBg)" : "var(--card)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 950,
    letterSpacing: -0.2,
    boxShadow: active ? "0 12px 26px rgba(37,99,235,0.18)" : "none",
    transition: "transform 120ms ease, background 120ms ease",
    outline: "none",
    minWidth: 160,
  };
}

const styles = {
  page: {
    minHeight: "100dvh",
    width: "100%",
    maxWidth: "100%",
    overflowX: "hidden", // ✅ evita “faixa” lateral por overflow
    boxSizing: "border-box",
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(37,99,235,0.18), transparent 55%), radial-gradient(900px 500px at 80% 20%, rgba(34,197,94,0.16), transparent 55%), var(--bg)",
    color: "var(--text)",
  },

  shell: {
    width: "100%",
    maxWidth: "100%",
    margin: 0,
    padding: "clamp(12px, 1.8vw, 18px)",
    boxSizing: "border-box",
  },

  topbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    padding: 14,
    border: "1px solid var(--border)",
    borderRadius: 18,
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    width: "100%",
    boxSizing: "border-box",
  },

  brand: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    minWidth: 240,
  },
  brandTitle: {
    fontWeight: 1000,
    letterSpacing: -0.4,
    fontSize: 18,
    lineHeight: 1.05,
  },
  brandSub: {
    color: "var(--muted)",
    fontWeight: 800,
    fontSize: 12,
    marginTop: 2,
  },

  topbarActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },

  tabs: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    width: "100%",
  },

  content: {
    marginTop: 12,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
  },

  ghostBtn: {
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 950,
    outline: "none",
  },

  dangerBtn: {
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.14)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 950,
    outline: "none",
  },

  primaryBtn: {
    border: "1px solid rgba(37,99,235,0.35)",
    background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(34,197,94,0.85))",
    color: "white",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 1000,
    letterSpacing: -0.2,
  },

  footer: {
    marginTop: 16,
    padding: 10,
    textAlign: "center",
    width: "100%",
  },

  centerCard: {
    maxWidth: 560,
    margin: "0 auto",
    marginTop: 110,
    padding: 18,
    border: "1px solid var(--border)",
    borderRadius: 18,
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
  },

  spinner: {
    width: 28,
    height: 28,
    borderRadius: 999,
    border: "3px solid rgba(148,163,184,0.35)",
    borderTopColor: "var(--accent)",
    margin: "0 auto",
    animation: "gfdSpin 1s linear infinite",
  },
};

// logo simples e top (SVG)
function LogoMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#22C55E" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#g)" opacity="0.92" />
      <path
        d="M20 34c6-8 18-8 24 0"
        fill="none"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M22 26h20"
        fill="none"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="40" r="2.6" fill="rgba(255,255,255,0.92)" />
      <circle cx="40" cy="40" r="2.6" fill="rgba(255,255,255,0.92)" />
    </svg>
  );
}

/* injeta keyframes + correções de tema/autofill sem CSS externo */
if (typeof document !== "undefined") {
  const id = "gfd-global-style";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes gfdSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
      *, *::before, *::after { box-sizing: border-box; }
      html, body, #root {
        min-height: 100%;
        width: 100%;
        max-width: 100%;
        margin: 0;
        padding: 0;
        background: var(--bg);
        overflow-x: hidden;
      }
      :root { color-scheme: light dark; }
      html.dark { color-scheme: dark; }
      html.light { color-scheme: light; }
      button:hover { transform: translateY(-1px); }
      button:focus { box-shadow: var(--focusRing); }
      input:focus, select:focus, textarea:focus { box-shadow: var(--focusRing); outline: none; }
      input, select, textarea {
        background: var(--controlBg);
        color: var(--text);
        border: 1px solid var(--border);
      }
      input:-webkit-autofill,
      textarea:-webkit-autofill,
      select:-webkit-autofill {
        -webkit-text-fill-color: var(--text) !important;
        box-shadow: 0 0 0px 1000px var(--controlBg) inset !important;
        -webkit-box-shadow: 0 0 0px 1000px var(--controlBg) inset !important;
        caret-color: var(--text) !important;
        transition: background-color 9999s ease-in-out 0s;
      }
    `;
    document.head.appendChild(style);
  }
}
