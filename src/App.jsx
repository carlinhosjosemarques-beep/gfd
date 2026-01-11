import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

import Login from "./Login";
import Dashboard from "./Dashboard";
import Relatorios from "./Relatorios";
import Metas from "./Metas"; // ✅ NOVO

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = carregando
  const [tab, setTab] = useState("dashboard");

  // Tema global (tudo junto)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("gfd_theme");
    if (saved === "dark" || saved === "light") return saved;
    return "light";
  });

  // aplica dataset + classe + color-scheme (corrige inputs brancos / autofill no dark)
  useEffect(() => {
    localStorage.setItem("gfd_theme", theme);

    const root = document.documentElement;

    // mantém o dataset (ok)
    root.dataset.gfdTheme = theme;

    // IMPORTANTÍSSIMO: define o color-scheme do navegador (controles nativos)
    root.style.colorScheme = theme; // "dark" ou "light"

    // classe para CSS (Dashboard usa html.light em alguns cenários)
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

      // superfícies
      bg: dark ? "#070B14" : "#F6F7FB",
      card: dark ? "rgba(17,24,39,0.78)" : "rgba(255,255,255,0.92)",
      card2: dark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.85)",

      // texto
      text: dark ? "#E5E7EB" : "#0F172A",
      muted: dark ? "rgba(226,232,240,0.74)" : "rgba(15,23,42,0.62)",

      // bordas / sombras
      border: dark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.12)",
      shadowSoft: dark ? "0 18px 45px rgba(0,0,0,0.45)" : "0 18px 45px rgba(15,23,42,0.10)",

      // destaque
      accent: "#2563EB",
      accent2: "#22C55E",
      warn: "#F97316",

      // inputs/botoes
      controlBg: dark ? "rgba(2,6,23,0.35)" : "rgba(255,255,255,0.9)",
      controlBg2: dark ? "rgba(2,6,23,0.55)" : "rgba(255,255,255,1)",
      focusRing: dark ? "0 0 0 3px rgba(56,189,248,0.22)" : "0 0 0 3px rgba(37,99,235,0.18)",

      // aba ativa (resolve “sumir no dark”)
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

  if (user === undefined) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.centerCard, textAlign: "center" }}>
          <div style={styles.spinner} />
          <div style={{ marginTop: 12, color: "var(--muted)", fontWeight: 900 }}>
            Carregando…
          </div>
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
          </div>

          <div style={styles.topbarActions}>
            <button
              onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
              style={styles.ghostBtn}
              title="Alternar tema"
            >
              {tokens.dark ? "🌙 Dark" : "☀️ Light"}
            </button>

            <button
              onClick={() => supabase.auth.signOut()}
              style={styles.dangerBtn}
              title="Sair"
            >
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

          {/* ✅ NOVO */}
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
          {tab === "dashboard" && <Dashboard />}
          {tab === "relatorios" && <Relatorios />}
          {tab === "metas" && <Metas />}
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
    overflowX: "visible",
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

  footer: {
    marginTop: 16,
    padding: 10,
    textAlign: "center",
    width: "100%",
  },

  centerCard: {
    maxWidth: 420,
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

      /* ✅ AQUI É O “ANTI-CORTE” DEFINITIVO */
      *, *::before, *::after { box-sizing: border-box; }

      html, body, #root {
        min-height: 100%;
        width: 100%;
        max-width: 100%;
        margin: 0;
        padding: 0;
        background: var(--bg);
      }

      /* Faz o navegador respeitar dark/light nos controles nativos */
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

      /* CHROME AUTOFILL (culpado do “branco no dark”) */
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
