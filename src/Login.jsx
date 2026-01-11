import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login({ theme, setTheme }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const dark = theme === "dark";

  const canSubmit = useMemo(() => {
    return (email || "").includes("@") && (senha || "").length >= 6 && !loading;
  }, [email, senha, loading]);

  useEffect(() => {
    setMsg(null);
  }, [mode]);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);

    const em = (email || "").trim().toLowerCase();
    const pw = senha || "";

    if (!em || !pw) return;

    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: em,
          password: pw,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: em,
          password: pw,
        });
        if (error) throw error;
        setMsg("Conta criada! Se o Supabase exigir confirmação, verifique seu e-mail.");
      }
    } catch (err) {
      setMsg(err?.message || "Erro ao autenticar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function resetSenha() {
    const em = (email || "").trim().toLowerCase();
    if (!em) return setMsg("Digite seu e-mail para recuperar a senha.");
    setLoading(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(em);
      if (error) throw error;
      setMsg("Enviamos um e-mail para redefinir sua senha.");
    } catch (err) {
      setMsg(err?.message || "Não foi possível enviar o e-mail de recuperação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.loginShell}>
        <div style={styles.hero}>
          <div style={styles.brand}>
            <LogoBig />
            <div>
              <div style={styles.title}>GFD</div>
              <div style={styles.subtitle}>Gestão Financeira Descomplicada</div>
            </div>
          </div>

          <div style={styles.heroText}>
            <h2 style={{ margin: 0, letterSpacing: -0.4 }}>
              Controle suas finanças com clareza.
            </h2>
            <p style={{ marginTop: 10, color: "var(--muted)", fontWeight: 800, lineHeight: 1.45 }}>
              Fixas automáticas, parcelamentos, lembretes de vencimento e relatórios completos.
              Pronto para celular e computador.
            </p>

            <div style={styles.badges}>
              <span style={styles.badge}>📌 Fixas</span>
              <span style={styles.badge}>🧩 Parcelas</span>
              <span style={styles.badge}>📊 Relatórios</span>
              <span style={styles.badge}>🔒 Por usuário</span>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTop}>
            <div>
              <div style={{ fontWeight: 1000, fontSize: 18, letterSpacing: -0.2 }}>
                {mode === "login" ? "Entrar" : "Criar conta"}
              </div>
              <div style={{ color: "var(--muted)", fontWeight: 800, marginTop: 4, fontSize: 12 }}>
                {mode === "login" ? "Acesse sua conta para continuar." : "Comece agora em poucos segundos."}
              </div>
            </div>

            <button
              onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
              style={styles.ghostBtn}
              title="Alternar tema"
            >
              {dark ? "🌙 Dark" : "☀️ Light"}
            </button>
          </div>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <label style={styles.label}>
              <span style={styles.labelTxt}>E-mail</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                style={styles.input}
                autoComplete="email"
              />
            </label>

            <label style={styles.label}>
              <span style={styles.labelTxt}>Senha</span>
              <input
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="mínimo 6 caracteres"
                style={styles.input}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>

            {msg && (
              <div style={styles.msg}>
                {msg}
              </div>
            )}

            <button disabled={!canSubmit} style={styles.primaryBtn} type="submit">
              {loading ? "Aguarde..." : (mode === "login" ? "Entrar" : "Criar conta")}
            </button>

            <div style={styles.row}>
              <button
                type="button"
                onClick={() => setMode((p) => (p === "login" ? "signup" : "login"))}
                style={styles.linkBtn}
              >
                {mode === "login" ? "Não tenho conta" : "Já tenho conta"}
              </button>

              <button type="button" onClick={resetSenha} style={styles.linkBtn}>
                Esqueci a senha
              </button>
            </div>

            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>
              Ao continuar, você concorda com boas práticas de uso e privacidade.
            </div>
          </form>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 16, color: "var(--muted)", fontWeight: 800 }}>
        © {new Date().getFullYear()} GFD
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 16,
  },

  loginShell: {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.9fr",
    gap: 14,
    alignItems: "stretch",
  },

  hero: {
    border: "1px solid var(--border)",
    borderRadius: 22,
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    padding: 18,
    minHeight: 420,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },

  brand: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },

  title: { fontWeight: 1000, fontSize: 20, letterSpacing: -0.4 },
  subtitle: { color: "var(--muted)", fontWeight: 800, fontSize: 12, marginTop: 3 },

  heroText: { marginTop: 14 },

  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 },

  badge: {
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.05)",
    padding: "8px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
  },

  card: {
    border: "1px solid var(--border)",
    borderRadius: 22,
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    padding: 18,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },

  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  label: { display: "grid", gap: 6 },
  labelTxt: { fontSize: 12, fontWeight: 950, color: "var(--muted)" },

  input: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 14,
    padding: "12px 12px",
    outline: "none",
    fontWeight: 900,
  },

  primaryBtn: {
    border: "1px solid rgba(37,99,235,0.35)",
    background: "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(34,197,94,0.85))",
    color: "white",
    borderRadius: 14,
    padding: "12px 12px",
    cursor: "pointer",
    fontWeight: 1000,
    letterSpacing: -0.2,
  },

  ghostBtn: {
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--text)",
    borderRadius: 14,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
    outline: "none",
  },

  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  linkBtn: {
    border: "none",
    background: "transparent",
    color: "var(--text)",
    cursor: "pointer",
    padding: 0,
    fontWeight: 950,
    opacity: 0.85,
    textDecoration: "underline",
  },

  msg: {
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.06)",
    padding: 10,
    borderRadius: 14,
    color: "var(--text)",
    fontWeight: 850,
    fontSize: 13,
    lineHeight: 1.35,
  },
};

// Logo “top”
function LogoBig() {
  return (
    <svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#22C55E" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="18" fill="url(#lg)" opacity="0.95" />
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
      <circle cx="24" cy="40" r="2.8" fill="rgba(255,255,255,0.92)" />
      <circle cx="40" cy="40" r="2.8" fill="rgba(255,255,255,0.92)" />
    </svg>
  );
}

/* Responsivo sem CSS externo */
if (typeof document !== "undefined") {
  const id = "gfd-login-responsive";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @media (max-width: 920px){
        .gfd-login-shell { grid-template-columns: 1fr !important; }
      }
    `;
    document.head.appendChild(style);
  }
}
