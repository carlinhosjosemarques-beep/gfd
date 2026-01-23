import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

function fmtDateBR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

function isActive(profile) {
  if (!profile) return false;
  if (profile.access_status === "active") return true;
  if (profile.access_until) {
    const until = new Date(profile.access_until);
    return until.getTime() > Date.now();
  }
  return false;
}

export default function ProfileMenu({ user, profile, profileLoading, onRefresh, onGoTab }) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");

  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setFullName(profile?.full_name || "");
  }, [profile?.full_name]);

  const active = useMemo(() => isActive(profile), [profile]);

  const badgeText = useMemo(() => {
    if (profileLoading) return "Carregando...";
    if (active) {
      const v = fmtDateBR(profile?.access_until);
      return v ? `Ativa até ${v}` : "Assinatura ativa";
    }
    return "Modo leitura";
  }, [active, profile?.access_until, profileLoading]);

  const initials = useMemo(() => {
    const base = (profile?.full_name || user?.email || "U").trim();
    const parts = base.split(/\s+/).filter(Boolean);
    const a = (parts[0]?.[0] || "U").toUpperCase();
    const b = (parts[1]?.[0] || "").toUpperCase();
    return `${a}${b}`.slice(0, 2);
  }, [profile?.full_name, user?.email]);

  async function saveName() {
    const name = fullName.trim();
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) throw error;
      await onRefresh?.();
      setProfileOpen(false);
    } catch (e) {
      alert(e?.message || "Erro ao salvar nome");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function goRenew() {
    const url =
      (import.meta?.env?.VITE_GFD_RENEW_URL || "").trim() ||
      localStorage.getItem("gfd_renew_url") ||
      "";

    if (!url) {
      alert(
        "Link de ativação/renovação não configurado.\n\nDefina VITE_GFD_RENEW_URL no ambiente (Vercel/ .env) ou salve no localStorage: gfd_renew_url"
      );
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="profile-wrap" ref={ref}>
      <div className={active ? "sub-badge active" : "sub-badge inactive"}>{badgeText}</div>

      <button className="avatar-btn" onClick={() => setOpen((v) => !v)} aria-label="Abrir menu do perfil">
        <div className="avatar">{initials}</div>
      </button>

      {open && (
        <div className="dropdown">
          <button
            className="dd-item"
            onClick={() => {
              setOpen(false);
              setProfileOpen(true);
            }}
          >
            Perfil
          </button>

          <button
            className="dd-item"
            onClick={() => {
              setOpen(false);
              goRenew();
            }}
          >
            {active ? "Gerenciar assinatura" : "Ativar / Renovar"}
          </button>

          <button
            className="dd-item"
            onClick={() => {
              setOpen(false);
              onRefresh?.();
            }}
          >
            Atualizar status
          </button>

          <button
            className="dd-item"
            onClick={() => {
              setOpen(false);
              onGoTab?.("dashboard");
            }}
          >
            Ir para Dashboard
          </button>

          <div className="dd-sep" />

          <button
            className="dd-item danger"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            Sair
          </button>
        </div>
      )}

      {profileOpen && (
        <div className="modal-backdrop" onMouseDown={() => setProfileOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-title">Perfil</div>

            <div className="field">
              <div className="label">Nome</div>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" />
            </div>

            <div className="field">
              <div className="label">E-mail</div>
              <input value={user?.email || ""} disabled />
            </div>

            <div className="field">
              <div className="label">Assinatura</div>
              <div className="sub-line">
                <span>{active ? "Ativa" : "Inativa"}</span>
                {profile?.access_until ? <span>• até {fmtDateBR(profile.access_until)}</span> : null}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setProfileOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn primary" onClick={saveName} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
