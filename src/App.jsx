import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

import Login from "./Login";
import Dashboard from "./Dashboard";
import Relatorios from "./Relatorios";
import Metas from "./Metas";

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState("dashboard");

  const [profile, setProfile] = useState(undefined);
  const [profileErr, setProfileErr] = useState(null);
  const [checkingProfile, setCheckingProfile] = useState(false);

  const [signingOut, setSigningOut] = useState(false);
  const lastFetchRef = useRef(0);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("gfd_theme");
    if (saved === "dark" || saved === "light") return saved;
    return "light";
  });

  // Menu avatar + modal perfil
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarRef = useRef(null);
  const [fullNameDraft, setFullNameDraft] = useState("");

  // Trocar senha (envia link por email)
  const [sendingPwd, setSendingPwd] = useState(false);

  // ✅ NOVO: menu do avatar “smart” (não corta no mobile)
  const [avatarDir, setAvatarDir] = useState("right"); // right | left

  useEffect(() => {
    localStorage.setItem("gfd_theme", theme);

    const root = document.documentElement;
    root.dataset.gfdTheme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

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
      danger: "#EF4444",
      controlBg: dark ? "rgba(2,6,23,0.35)" : "rgba(255,255,255,0.9)",
      controlBg2: dark ? "rgba(2,6,23,0.55)" : "rgba(255,255,255,1)",
      focusRing: dark
        ? "0 0 0 3px rgba(56,189,248,0.22)"
        : "0 0 0 3px rgba(37,99,235,0.18)",
      tabActiveBg: dark ? "rgba(37,99,235,0.22)" : "rgba(37,99,235,0.10)",
      tabActiveBorder: dark
        ? "rgba(96,165,250,0.55)"
        : "rgba(37,99,235,0.35)",
      tabHoverBg: dark ? "rgba(148,163,184,0.10)" : "rgba(15,23,42,0.06)",
    };
  }, [theme]);

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
    r.setProperty("--danger", tokens.danger);
    r.setProperty("--controlBg", tokens.controlBg);
    r.setProperty("--controlBg2", tokens.controlBg2);
    r.setProperty("--focusRing", tokens.focusRing);
    r.setProperty("--tabActiveBg", tokens.tabActiveBg);
    r.setProperty("--tabActiveBorder", tokens.tabActiveBorder);
    r.setProperty("--tabHoverBg", tokens.tabHoverBg);
  }, [tokens]);

  function parseDateSafe(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function computeAccessInfo(p) {
    if (!p) return { canUseApp: false, canWrite: false, reason: "no_profile", until: null };

    if (p.is_admin === true) {
      return { canUseApp: true, canWrite: true, reason: "admin", until: null };
    }

    const now = new Date();

    const accessUntil = parseDateSafe(p.access_until);
    const accessExpiresAt = parseDateSafe(p.access_expires_at);

    const hasExpiry = !!accessUntil || !!accessExpiresAt;
    const expiry = accessUntil || accessExpiresAt || null;

    if (accessUntil && accessUntil <= now) {
      return { canUseApp: false, canWrite: false, reason: "expired", until: accessUntil };
    }
    if (accessExpiresAt && accessExpiresAt <= now) {
      return { canUseApp: false, canWrite: false, reason: "expired", until: accessExpiresAt };
    }

    const accessStatus = p.access_status;
    const accessGranted = p.access_granted;
    const subStatus = String(p.subscription_status || "").toLowerCase();

    const okByAccessStatus = accessStatus === "active";
    const okByGranted = accessGranted === true;
    const okBySubscription =
      subStatus === "active" || subStatus === "paid" || subStatus === "approved";

    const canWrite = !!(okByAccessStatus || okByGranted || okBySubscription);

    return {
      canUseApp: true,
      canWrite,
      reason: canWrite ? "active" : hasExpiry ? "inactive_with_expiry" : "inactive",
      until: expiry,
    };
  }

  const accessInfo = useMemo(() => computeAccessInfo(profile), [profile]);
  const canWrite = accessInfo.canWrite;

  // Saudação
  const greetingName = useMemo(() => {
    const full = String(profile?.full_name || "").trim();
    const first = full.split(/\s+/).filter(Boolean)[0];
    if (first) return first;

    const email = String(user?.email || "").trim();
    if (email && email.includes("@")) return email.split("@")[0];
    return "";
  }, [profile?.full_name, user?.email]);

  const greeting = greetingName ? `Olá, ${greetingName}` : "Olá";

  async function ensureProfileRow(u) {
    if (!u?.id) return;
    try {
      const payload = {
        id: u.id,
        email: u.email ?? null,
        updated_at: new Date().toISOString(),
      };
      await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    } catch {}
  }

  async function fetchProfile(u, { force = false } = {}) {
    if (!u?.id) {
      setProfile(undefined);
      setProfileErr(null);
      return;
    }

    const now = Date.now();
    if (!force && now - lastFetchRef.current < 1200) return;
    lastFetchRef.current = now;

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
      const colsAll =
        "id,email,created_at,updated_at,is_admin,access_status,access_until,subscription_status,access_granted,access_origin,access_expires_at,full_name";
      let data1 = await trySelect(colsAll);

      if (data1 === null) {
        await ensureProfileRow(u);
        data1 = await trySelect(colsAll);
      }

      setProfile(data1);
    } catch (e1) {
      try {
        const colsLegacy =
          "id,email,created_at,access_granted,access_origin,access_expires_at,subscription_status,full_name";
        let data2 = await trySelect(colsLegacy);

        if (data2 === null) {
          await ensureProfileRow(u);
          data2 = await trySelect(colsLegacy);
        }

        setProfile(data2);
      } catch (e2) {
        try {
          let data3 = await trySelect("id,email,created_at,full_name");

          if (data3 === null) {
            await ensureProfileRow(u);
            data3 = await trySelect("id,email,created_at,full_name");
          }

          setProfile(data3);
        } catch (e3) {
          setProfile(undefined);
          setProfileErr(
            e3?.message ||
              e2?.message ||
              e1?.message ||
              "Não foi possível verificar seu acesso."
          );
        }
      }
    } finally {
      setCheckingProfile(false);
    }
  }

  useEffect(() => {
    if (user && user !== null) fetchProfile(user, { force: true });

    if (user === null) {
      setProfile(undefined);
      setProfileErr(null);
      setCheckingProfile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user || user === null) return;

    const onFocus = () => fetchProfile(user, { force: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchProfile(user, { force: true });
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user]);

  useEffect(() => {
    if (!user || user === null) return;
    if (canWrite) return;

    const t = setInterval(() => {
      fetchProfile(user, { force: true });
    }, 8000);

    return () => clearInterval(t);
  }, [user, canWrite]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function onDoc(e) {
      if (!avatarOpen) return;
      if (!avatarRef.current) return;
      if (!avatarRef.current.contains(e.target)) setAvatarOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [avatarOpen]);

  // ✅ NOVO: decidir se o menu abre pra direita ou esquerda (pra não cortar)
  useEffect(() => {
    function computeDir() {
      try {
        if (!avatarRef.current) return;
        const r = avatarRef.current.getBoundingClientRect();
        const menuW = Math.min(280, window.innerWidth - 24);
        const spaceRight = window.innerWidth - r.right;
        const spaceLeft = r.left;
        setAvatarDir(spaceRight >= menuW ? "right" : spaceLeft >= menuW ? "left" : "right");
      } catch {}
    }
    computeDir();
    window.addEventListener("resize", computeDir);
    return () => window.removeEventListener("resize", computeDir);
  }, []);

  // Draft sincronizado quando abrir modal
  useEffect(() => {
    if (profileModalOpen) setFullNameDraft(String(profile?.full_name || ""));
  }, [profileModalOpen, profile?.full_name]);

  function fmtBRDateTime(d) {
    try {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
    } catch {
      return d ? String(d) : "";
    }
  }

  function fmtBRDateOnly(d) {
    try {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
    } catch {
      return d ? String(d) : "";
    }
  }

  function openRenew() {
    const url =
      (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_GFD_RENEW_URL) ||
      localStorage.getItem("gfd_renew_url") ||
      "";
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    alert(
      "Link de ativação/renovação não configurado.\n\nDefina VITE_GFD_RENEW_URL no .env (ou salve em localStorage: gfd_renew_url)."
    );
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();

      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith("sb-") || k.includes("supabase")) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      } catch {}

      setUser(null);
      setProfile(undefined);
      setProfileErr(null);

      window.location.assign("/");
    } catch (e) {
      alert(e?.message || "Não foi possível sair. Tente novamente.");
    } finally {
      setSigningOut(false);
    }
  }

  // Salvar nome no perfil
  async function saveProfileName() {
    if (!user?.id) return;
    const name = String(fullNameDraft || "").trim();

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) throw error;

      await fetchProfile(user, { force: true });
      setProfileModalOpen(false);
    } catch (e) {
      alert(e?.message || "Erro ao salvar nome");
    } finally {
      setSavingProfile(false);
    }
  }

  // Enviar link para troca de senha
  async function sendPasswordReset() {
    const email = String(user?.email || "").trim();
    if (!email) return;

    setSendingPwd(true);
    try {
      const redirectTo =
        (typeof import.meta !== "undefined" &&
          import.meta.env &&
          import.meta.env.VITE_GFD_RESET_URL) ||
        `${window.location.origin}/`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;

      alert("Pronto! Enviamos um link para trocar a senha no seu e-mail.");
    } catch (e) {
      alert(e?.message || "Não foi possível enviar o link de troca de senha.");
    } finally {
      setSendingPwd(false);
    }
  }

  // Iniciais do avatar
  const avatarInitials = useMemo(() => {
    const base = String(profile?.full_name || user?.email || "U").trim();
    const parts = base.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0] || "U").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return `${a}${b}`.slice(0, 2);
  }, [profile?.full_name, user?.email]);

  const showReadOnlyBanner = user && user !== null && profile && accessInfo.canUseApp && !canWrite;

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

  if (profileErr) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.centerCard }}>
          <div style={{ fontWeight: 1000, fontSize: 16 }}>
            Não foi possível verificar seu acesso
          </div>
          <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 900, lineHeight: 1.4 }}>
            {profileErr}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button
              onClick={() => fetchProfile(user, { force: true })}
              style={styles.primaryBtn}
              disabled={checkingProfile}
            >
              {checkingProfile ? "Aguarde..." : "Tentar novamente"}
            </button>

            <button onClick={handleSignOut} style={styles.dangerBtn} disabled={signingOut}>
              {signingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.centerCard }}>
          <div style={{ fontWeight: 1000, fontSize: 16 }}>Seu perfil ainda não foi criado</div>
          <div
            style={{
              marginTop: 8,
              color: "var(--knowMuted, var(--muted))",
              fontWeight: 900,
              lineHeight: 1.4,
            }}
          >
            Estou tentando criar automaticamente agora. Se mesmo assim não aparecer, seu Supabase
            pode estar sem política/trigger para perfis.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button
              onClick={() => fetchProfile(user, { force: true })}
              style={styles.primaryBtn}
              disabled={checkingProfile}
            >
              {checkingProfile ? "Aguarde..." : "Atualizar"}
            </button>

            <button onClick={handleSignOut} style={styles.dangerBtn} disabled={signingOut}>
              {signingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (accessInfo.reason === "expired") {
    return (
      <div style={styles.page}>
        <div style={{ ...styles.centerCard }}>
          <div style={{ fontWeight: 1100, fontSize: 18, letterSpacing: -0.2 }}>
            Assinatura expirada
          </div>

          <div style={{ marginTop: 10, color: "var(--muted)", fontWeight: 900, lineHeight: 1.4 }}>
            Seu acesso expirou{accessInfo.until ? ` em ${fmtBRDateTime(accessInfo.until)}` : ""}.
            Para continuar usando o GFD, renove sua assinatura.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={openRenew} style={styles.primaryBtn}>
              Renovar assinatura
            </button>

            <button
              onClick={() => fetchProfile(user, { force: true })}
              style={styles.ghostBtn}
              disabled={checkingProfile}
              title="Recarregar status do acesso"
            >
              {checkingProfile ? "Verificando..." : "Já renovei (atualizar)"}
            </button>

            <button onClick={handleSignOut} style={styles.dangerBtn} disabled={signingOut}>
              {signingOut ? "Saindo..." : "Sair"}
            </button>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.22)",
              background: "rgba(2,6,23,0.12)",
              color: "var(--muted)",
              fontWeight: 850,
              lineHeight: 1.35,
              fontSize: 13,
            }}
          >
            Dica: configure o link com <b>VITE_GFD_RENEW_URL</b> no seu <b>.env</b>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.topbar}>
          <div style={styles.brand}>
            <LogoMark />
            <div style={{ minWidth: 0 }}>
              <div style={styles.brandTitle}>GFD</div>
              <div style={styles.brandSub}>Gestão Financeira Descomplicada</div>
            </div>

            <div style={styles.greeting} title={user?.email || ""}>
              {greeting}
            </div>

            <span style={badgeStyle(canWrite)} title={canWrite ? "Assinatura ativa" : "Modo leitura"}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{canWrite ? "✅" : "🔒"}</span>
              {canWrite ? "Ativo" : "Modo leitura"}
              {accessInfo?.until ? (
                <span style={{ opacity: 0.85, fontWeight: 900 }}>
                  • até {fmtBRDateOnly(accessInfo.until)}
                </span>
              ) : null}
            </span>
          </div>

          <div style={styles.topbarActions}>
            {!canWrite ? (
              <button onClick={openRenew} style={styles.primaryBtn} title="Ativar/Renovar assinatura">
                Ativar / Renovar
              </button>
            ) : null}

            <button
              onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
              style={styles.ghostBtn}
              title="Alternar tema"
            >
              {tokens.dark ? "🌙 Dark" : "☀️ Light"}
            </button>

            <div style={styles.avatarWrap} ref={avatarRef}>
              <button
                onClick={() => {
                  setAvatarOpen((v) => !v);
                }}
                style={styles.avatarBtn}
                title="Menu do perfil"
                aria-haspopup="menu"
                aria-expanded={avatarOpen ? "true" : "false"}
              >
                <span style={styles.avatarCircle}>{avatarInitials}</span>
              </button>

              {avatarOpen ? (
                <div
                  style={{
                    ...styles.avatarMenu,
                    right: avatarDir === "right" ? 0 : "auto",
                    left: avatarDir === "left" ? 0 : "auto",
                  }}
                  role="menu"
                >
                  <button
                    style={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      setAvatarOpen(false);
                      setProfileModalOpen(true);
                    }}
                  >
                    👤 Perfil
                  </button>

                  <button
                    style={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      setAvatarOpen(false);
                      openRenew();
                    }}
                  >
                    {canWrite ? "🧾 Gerenciar assinatura" : "🧾 Ativar / Renovar"}
                  </button>

                  <button
                    style={styles.menuItem}
                    role="menuitem"
                    disabled={checkingProfile}
                    onClick={() => {
                      setAvatarOpen(false);
                      fetchProfile(user, { force: true });
                    }}
                    title="Recarregar status"
                  >
                    🔄 {checkingProfile ? "Atualizando..." : "Já paguei (atualizar)"}
                  </button>

                  <div style={styles.menuSep} />

                  <button
                    style={styles.menuItem}
                    role="menuitem"
                    disabled={sendingPwd}
                    onClick={() => {
                      setAvatarOpen(false);
                      setProfileModalOpen(true);
                    }}
                    title="Abrir perfil para trocar senha"
                  >
                    🔑 Trocar senha
                  </button>

                  <button
                    style={{ ...styles.menuItem, ...styles.menuDanger }}
                    role="menuitem"
                    disabled={signingOut}
                    onClick={() => {
                      setAvatarOpen(false);
                      handleSignOut();
                    }}
                  >
                    🚪 {signingOut ? "Saindo..." : "Sair"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

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

        {showReadOnlyBanner ? (
          <div style={styles.readOnlyBanner}>
            <div style={{ fontWeight: 1000, letterSpacing: -0.2 }}>
              🔒 Modo leitura (assinatura inativa)
            </div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 850, lineHeight: 1.35 }}>
              Você pode visualizar seus dados, mas não pode criar, editar ou excluir.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button onClick={openRenew} style={styles.primaryBtn}>
                Ativar / Renovar assinatura
              </button>
              <button
                onClick={() => fetchProfile(user, { force: true })}
                style={styles.ghostBtn}
                disabled={checkingProfile}
              >
                {checkingProfile ? "Verificando..." : "Já paguei (atualizar)"}
              </button>
            </div>
          </div>
        ) : null}

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

      {profileModalOpen ? (
        <div
          style={styles.modalBackdrop}
          onMouseDown={() => setProfileModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>Perfil</div>
              <button
                style={styles.modalClose}
                onClick={() => setProfileModalOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div style={styles.modalGrid}>
              <div style={styles.modalField}>
                <div style={styles.modalLabel}>Nome</div>
                <input
                  value={fullNameDraft}
                  onChange={(e) => setFullNameDraft(e.target.value)}
                  placeholder="Seu nome"
                  style={styles.modalInput}
                />
              </div>

              <div style={styles.modalField}>
                <div style={styles.modalLabel}>E-mail</div>
                <input value={String(user?.email || "")} disabled style={styles.modalInput} />
              </div>

              <div style={styles.modalFieldFull}>
                <div style={styles.modalLabel}>Assinatura</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={badgeStyle(canWrite)}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>{canWrite ? "✅" : "🔒"}</span>
                    {canWrite ? "Ativa" : "Inativa (modo leitura)"}
                    {accessInfo?.until ? (
                      <span style={{ opacity: 0.85, fontWeight: 900 }}>
                        • até {fmtBRDateOnly(accessInfo.until)}
                      </span>
                    ) : null}
                  </span>

                  <button onClick={openRenew} style={styles.ghostBtn}>
                    {canWrite ? "Gerenciar" : "Ativar / Renovar"}
                  </button>

                  <button
                    onClick={() => fetchProfile(user, { force: true })}
                    style={styles.ghostBtn}
                    disabled={checkingProfile}
                    title="Atualizar status"
                  >
                    {checkingProfile ? "Atualizando..." : "Atualizar status"}
                  </button>
                </div>

                <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 850, lineHeight: 1.35 }}>
                  Origem: {String(profile?.access_origin || "—")} • Status:{" "}
                  {String(profile?.subscription_status || profile?.access_status || "—")}
                </div>
              </div>

              <div style={styles.modalFieldFull}>
                <div style={styles.modalLabel}>Segurança</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    style={styles.primaryBtn}
                    onClick={sendPasswordReset}
                    disabled={sendingPwd}
                    title="Envia um link no seu e-mail para trocar a senha"
                  >
                    {sendingPwd ? "Enviando..." : "🔑 Enviar link para trocar senha"}
                  </button>
                </div>
                <div style={{ marginTop: 8, color: "var(--muted)", fontWeight: 850, lineHeight: 1.35 }}>
                  Você receberá um e-mail do Supabase com um link para redefinir a senha.
                </div>
              </div>
            </div>

            <div style={styles.modalActions}>
              <button
                style={styles.ghostBtn}
                onClick={() => setProfileModalOpen(false)}
                disabled={savingProfile || sendingPwd}
              >
                Fechar
              </button>
              <button
                style={styles.primaryBtn}
                onClick={saveProfileName}
                disabled={savingProfile || sendingPwd}
              >
                {savingProfile ? "Salvando..." : "Salvar nome"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

function badgeStyle(isActive) {
  const border = isActive ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)";
  const bg = isActive
    ? "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(37,99,235,0.10))"
    : "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(249,115,22,0.08))";

  return {
    marginLeft: 10,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 999,
    border: `1px solid ${border}`,
    background: bg,
    fontWeight: 1000,
    fontSize: 12.5,
    color: "var(--text)",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

const styles = {
  page: {
    minHeight: "100dvh",
    width: "100%",
    maxWidth: "100%",
    overflowX: "hidden",
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
    flexWrap: "wrap",
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

  greeting: {
    marginLeft: 10,
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.05)",
    fontWeight: 1000,
    fontSize: 13,
    letterSpacing: -0.15,
    whiteSpace: "nowrap",
  },

  topbarActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },

  tabs: {
    marginTop: 12,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    width: "100%",
  },

  readOnlyBanner: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(239,68,68,0.28)",
    background: "linear-gradient(180deg, rgba(239,68,68,0.10), rgba(2,6,23,0.06))",
    boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
  },

  // ✅ CORREÇÃO DO “CORTADO NO FINAL”:
  // - garante padding inferior (pra menus/ações no rodapé da tela não ficarem por baixo da UI do celular)
  // - e permite overflow visível (pra dropdowns não serem cortados)
  content: {
    marginTop: 12,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    paddingBottom: "max(28px, env(safe-area-inset-bottom))",
    overflow: "visible",
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

  // Avatar/menu/modal
  avatarWrap: { position: "relative" },
  avatarBtn: {
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--text)",
    padding: 4,
    borderRadius: 999,
    cursor: "pointer",
    outline: "none",
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 1100,
    letterSpacing: -0.3,
    border: "1px solid rgba(148,163,184,0.20)",
    background: "rgba(2,6,23,0.10)",
  },
  avatarMenu: {
    position: "absolute",
    top: 48,
    minWidth: 240,
    width: "min(280px, calc(100vw - 24px))",
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    overflow: "hidden",
    zIndex: 5000,
  },
  menuItem: {
    width: "100%",
    textAlign: "left",
    padding: "12px 12px",
    background: "transparent",
    border: "none",
    color: "var(--text)",
    cursor: "pointer",
    fontWeight: 950,
  },
  menuSep: { height: 1, background: "rgba(148,163,184,0.18)" },
  menuDanger: { color: "var(--text)", background: "rgba(239,68,68,0.10)" },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.38)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    zIndex: 9000,
  },
  modal: {
    width: "min(560px, 96vw)",
    maxHeight: "min(84vh, 720px)",
    overflow: "auto",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    padding: 16,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: { fontWeight: 1100, fontSize: 16, letterSpacing: -0.2 },
  modalClose: {
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 950,
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  modalField: { marginBottom: 0, minWidth: 0 },
  modalFieldFull: { gridColumn: "1 / -1" },
  modalLabel: { fontSize: 12, color: "var(--muted)", fontWeight: 900, marginBottom: 6 },
  modalInput: {
    width: "100%",
    padding: 12,
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "var(--controlBg2)",
    color: "var(--text)",
    outline: "none",
    fontWeight: 900,
    minWidth: 0,
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
  },
};

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
      /* ✅ deixa conteúdo respirar no fim no mobile */
      #root { padding-bottom: max(18px, env(safe-area-inset-bottom)); }

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

      @media (max-width: 520px) {
        .gfd-hide-mobile { display: none !important; }
        /* ✅ evita “quebrar” o topo e cortar badge/saudação em telas pequenas */
        button { max-width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }
}
