import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const meses = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

const categoriasDespesa = [
  "Alimentação","Moradia","Transporte","Lazer","Saúde",
  "Educação","Assinaturas","Investimentos","Dívidas","Outros"
];

const categoriasReceita = [
  "Salário","Bônus","Rendimento de investimentos",
  "Freelance","Aluguel","Outros"
];

function money(n) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(n || 0));
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ym(ano, mes) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

function parseValor(str) {
  const v = Number(String(str ?? "").trim().replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

function addMonthsKeepDay(yyyyMmDd, add) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const base = new Date(y, m - 1, 1);
  const target = new Date(base.getFullYear(), base.getMonth() + add, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return ymd(new Date(target.getFullYear(), target.getMonth(), day));
}

function uuidLike() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stripParcelaSuffix(desc) {
  const s = String(desc ?? "").trim();
  return s.replace(/\s*\(\d+\/\d+\)\s*$/g, "").trim();
}

function lastDayOfMonth(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

function toDateAtMidnight(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function daysDiff(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const da = toDateAtMidnight(a).getTime();
  const db = toDateAtMidnight(b).getTime();
  return Math.round((da - db) / ms);
}

function vencimentoInfo(l) {
  if (!l || l.pago) return null;
  if (!l.data) return null;

  const hoje = ymd(new Date());
  const diff = daysDiff(l.data, hoje);

  if (diff === 0) return { key: "hoje", label: "vence hoje", bg: "rgba(245,158,11,.14)", fg: "#F59E0B", ring: "#F59E0B" };
  if (diff === 1) return { key: "amanha", label: "vence amanhã", bg: "rgba(56,189,248,.14)", fg: "#38BDF8", ring: "#38BDF8" };
  if (diff < 0) return { key: "atrasado", label: "atrasado", bg: "rgba(239,68,68,.14)", fg: "#EF4444", ring: "#EF4444" };
  return null;
}

// ✅ sem new Date("YYYY-MM-DD") (evita -1 dia)
function formatBRfromYmd(ymdStr) {
  if (!ymdStr) return "";
  const [y, m, d] = String(ymdStr).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("pt-BR");
}

function isMobileNow() {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
}

function useDebouncedValue(value, delayMs = 220) {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return deb;
}

function safeBoolLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v === null || v === undefined) return fallback;
    return v === "true";
  } catch {
    return fallback;
  }
}

function setBoolLS(key, val) {
  try { localStorage.setItem(key, String(!!val)); } catch {}
}

function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsv(v) {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows) {
  const header = [
    "data","mes_ano","tipo","categoria","descricao","valor","pago","conta_id",
    "parcelado","parcela_num","parcela_total","parcela_grupo",
  ];
  const lines = [header.join(";")];
  for (const r of rows || []) {
    const line = header.map((k) => escapeCsv(r?.[k]));
    lines.push(line.join(";"));
  }
  return lines.join("\n");
}

function CollapseSection({ id, title, subtitle, open, onToggle, children, rightSlot = null }) {
  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`sec_${id}`}
        style={styles.collapseHeaderBtn}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={styles.collapseChevron}>{open ? "▾" : "▸"}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 1000, letterSpacing: -0.15 }}>{title}</span>
              {subtitle ? <span style={styles.badgeMuted}>{subtitle}</span> : null}
            </div>
          </div>
        </div>

        {rightSlot ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{rightSlot}</div> : null}
      </button>

      <div
        id={`sec_${id}`}
        style={{
          ...styles.collapseBody,
          maxHeight: open ? 9999 : 0,
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0)" : "translateY(-4px)",
          pointerEvents: open ? "auto" : "none",
          marginTop: open ? 10 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ✅ recebe canWrite do App.jsx (sem default "true" para não liberar por engano)
export default function Dashboard({ canWrite } = {}) {
  // ✅ trava central (modo leitura)
  function guardWrite(msg = "Assinatura inativa. Você está no modo leitura.") {
    if (canWrite) return true;
    alert(msg);
    return false;
  }

  const hoje = new Date();
  const currentYear = hoje.getFullYear();

  const anosOptions = useMemo(() => {
    const min = 2010;
    const max = 2050;
    const start = Math.max(min, currentYear - 10);
    const end = Math.min(max, currentYear + 10);
    const out = [];
    for (let a = start; a <= end; a++) out.push(a);
    return out;
  }, [currentYear]);

  const [ano, setAno] = useState(() => {
    const s = localStorage.getItem("gfd_ano");
    return s ? Number(s) : hoje.getFullYear();
  });

  const [mes, setMes] = useState(() => {
    const s = localStorage.getItem("gfd_mes");
    return s ? Number(s) : hoje.getMonth();
  });

  useEffect(() => {
    localStorage.setItem("gfd_ano", String(ano));
    localStorage.setItem("gfd_mes", String(mes));
  }, [ano, mes]);

  const filtroYM = useMemo(() => ym(ano, mes), [ano, mes]);

  const range = useMemo(() => {
    const start = new Date(ano, mes, 1);
    const end = new Date(ano, mes + 1, 1);
    return { start: ymd(start), end: ymd(end) };
  }, [ano, mes]);

  const defaultCollapsedMobile = useMemo(() => isMobileNow(), []);
  const [uiPersonalizarOpen, setUiPersonalizarOpen] = useState(() => safeBoolLS("gfd_ui_personalizar", false));
  const [uiShowContas, setUiShowContas] = useState(() => safeBoolLS("gfd_ui_contas", !defaultCollapsedMobile));
  const [uiShowFixas, setUiShowFixas] = useState(() => safeBoolLS("gfd_ui_fixas", !defaultCollapsedMobile));
  const [uiShowNovo, setUiShowNovo] = useState(() => safeBoolLS("gfd_ui_novo", !defaultCollapsedMobile));
  const [uiShowLista, setUiShowLista] = useState(() => safeBoolLS("gfd_ui_lista", true));
  const [uiShowListaFixas, setUiShowListaFixas] = useState(() => safeBoolLS("gfd_ui_lista_fixas", true));
  const [uiShowListaParcelas, setUiShowListaParcelas] = useState(() => safeBoolLS("gfd_ui_lista_parcelas", true));
  const [uiShowListaAvulsos, setUiShowListaAvulsos] = useState(() => safeBoolLS("gfd_ui_lista_avulsos", true));

  useEffect(() => setBoolLS("gfd_ui_personalizar", uiPersonalizarOpen), [uiPersonalizarOpen]);
  useEffect(() => setBoolLS("gfd_ui_contas", uiShowContas), [uiShowContas]);
  useEffect(() => setBoolLS("gfd_ui_fixas", uiShowFixas), [uiShowFixas]);
  useEffect(() => setBoolLS("gfd_ui_novo", uiShowNovo), [uiShowNovo]);
  useEffect(() => setBoolLS("gfd_ui_lista", uiShowLista), [uiShowLista]);
  useEffect(() => setBoolLS("gfd_ui_lista_fixas", uiShowListaFixas), [uiShowListaFixas]);
  useEffect(() => setBoolLS("gfd_ui_lista_parcelas", uiShowListaParcelas), [uiShowListaParcelas]);
  useEffect(() => setBoolLS("gfd_ui_lista_avulsos", uiShowListaAvulsos), [uiShowListaAvulsos]);

  const buscaRef = useRef(null);
  const novoRef = useRef(null);

  function isTypingTarget(el) {
    const t = el?.tagName?.toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || el?.isContentEditable;
  }

  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 220 });
  const menuBoxRef = useRef(null);
  const menuBtnRefs = useRef(new Map());

  function setMenuBtnRef(id, node) {
    if (!id) return;
    if (node) menuBtnRefs.current.set(id, node);
    else menuBtnRefs.current.delete(id);
  }

  function openMenuAtButton(id) {
    const btn = menuBtnRefs.current.get(id);
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const w = 240;
    const margin = 10;

    let top = r.bottom + 8;
    let left = r.right - w;

    const vh = window.innerHeight;
    const vw = window.innerWidth;

    if (left < margin) left = margin;
    if (left + w > vw - margin) left = vw - w - margin;

    const menuH = 260;
    if (top + menuH > vh - margin) {
      top = Math.max(margin, r.top - 8 - menuH);
    }

    setMenuPos({ top, left, width: w });
  }

  function toggleMenu(id) {
    if (!canWrite) return; // ✅ read-only: não abre menu
    setMenuOpenId((prev) => {
      const next = prev === id ? null : id;
      if (next) openMenuAtButton(id);
      return next;
    });
  }

  const [contaMenuOpenId, setContaMenuOpenId] = useState(null);
  const [contaMenuPos, setContaMenuPos] = useState({ top: 0, left: 0, width: 230 });
  const contaMenuRef = useRef(null);
  const contaBtnRefs = useRef(new Map());

  function setContaBtnRef(id, node) {
    const map = contaBtnRefs.current;
    if (!id) return;
    if (!node) map.delete(id);
    else map.set(id, node);
  }

  function openContaMenuAtButton(id) {
    const btn = contaBtnRefs.current.get(id);
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const w = 240;
    const margin = 10;

    let top = r.bottom + 8;
    let left = r.right - w;

    const vh = window.innerHeight;
    const vw = window.innerWidth;

    if (left < margin) left = margin;
    if (left + w > vw - margin) left = vw - w - margin;

    const menuH = 200;
    if (top + menuH > vh - margin) {
      top = Math.max(margin, r.top - 8 - menuH);
    }

    setContaMenuPos({ top, left, width: w });
  }

  function toggleContaMenu(id) {
    if (!canWrite) return; // ✅ read-only: não abre menu
    setContaMenuOpenId((prev) => {
      const next = prev === id ? null : id;
      if (next) openContaMenuAtButton(id);
      return next;
    });
  }

  const [fixaMenuOpenId, setFixaMenuOpenId] = useState(null);
  const [fixaMenuPos, setFixaMenuPos] = useState({ top: 0, left: 0, width: 230 });
  const fixaMenuRef = useRef(null);
  const fixaBtnRefs = useRef(new Map());

  function setFixaBtnRef(id, node) {
    const map = fixaBtnRefs.current;
    if (!id) return;
    if (!node) map.delete(id);
    else map.set(id, node);
  }

  function openFixaMenuAtButton(id) {
    const btn = fixaBtnRefs.current.get(id);
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const w = 240;
    const margin = 10;

    let top = r.bottom + 8;
    let left = r.right - w;

    const vh = window.innerHeight;
    const vw = window.innerWidth;

    if (left < margin) left = margin;
    if (left + w > vw - margin) left = vw - w - margin;

    const menuH = 200;
    if (top + menuH > vh - margin) {
      top = Math.max(margin, r.top - 8 - menuH);
    }

    setFixaMenuPos({ top, left, width: w });
  }

  function toggleFixaMenu(id) {
    if (!canWrite) return; // ✅ read-only: não abre menu
    setFixaMenuOpenId((prev) => {
      const next = prev === id ? null : id;
      if (next) openFixaMenuAtButton(id);
      return next;
    });
  }

  useEffect(() => {
    function onDown(e) {
      if (menuOpenId) {
        const box = menuBoxRef.current;
        const btn = menuBtnRefs.current.get(menuOpenId);
        const inside = box && box.contains(e.target);
        const onBtn = btn && btn.contains(e.target);
        if (!inside && !onBtn) setMenuOpenId(null);
      }

      if (contaMenuOpenId) {
        const box = contaMenuRef.current;
        const btn = contaBtnRefs.current.get(contaMenuOpenId);
        const inside = box && box.contains(e.target);
        const onBtn = btn && btn.contains(e.target);
        if (!inside && !onBtn) setContaMenuOpenId(null);
      }

      if (fixaMenuOpenId) {
        const box = fixaMenuRef.current;
        const btn = fixaBtnRefs.current.get(fixaMenuOpenId);
        const inside = box && box.contains(e.target);
        const onBtn = btn && btn.contains(e.target);
        if (!inside && !onBtn) setFixaMenuOpenId(null);
      }
    }

    function onScrollOrResize() {
      if (menuOpenId) openMenuAtButton(menuOpenId);
      if (contaMenuOpenId) openContaMenuAtButton(contaMenuOpenId);
      if (fixaMenuOpenId) openFixaMenuAtButton(fixaMenuOpenId);
    }

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpenId, contaMenuOpenId, fixaMenuOpenId]);

  const [contas, setContas] = useState([]);
  const [loadingContas, setLoadingContas] = useState(false);
  const [contaNome, setContaNome] = useState("");
  const [contaSaldoInicial, setContaSaldoInicial] = useState("");
  const [contaTipo, setContaTipo] = useState("Conta");
  const [contaId, setContaId] = useState("");
  const [filtroContaId, setFiltroContaId] = useState("todas");

  async function carregarContas() {
    setLoadingContas(true);

    const { data, error } = await supabase
      .from("contas")
      .select("id,nome,tipo,saldo_inicial,ativo,criado_em")
      .eq("ativo", true)
      .order("criado_em", { ascending: true });

    if (error) {
      console.error("Erro carregar contas:", error);
      setContas([]);
      setLoadingContas(false);
      return [];
    }

    const lista = data || [];
    setContas(lista);
    setLoadingContas(false);

    setContaId((prev) => (prev ? prev : (lista.length > 0 ? lista[0].id : "")));
    return lista;
  }

  async function criarConta() {
    if (!guardWrite()) return;

    const nome = (contaNome || "").trim();
    const saldo = parseValor(contaSaldoInicial);
    if (!nome) return;

    const payload = { nome, tipo: (contaTipo || "Conta").trim(), saldo_inicial: saldo, ativo: true };
    const { error } = await supabase.from("contas").insert(payload);
    if (error) {
      console.error("Erro criar conta:", error);
      return;
    }

    setContaNome("");
    setContaSaldoInicial("");
    setContaTipo("Conta");
    await carregarContas();
  }

  const [editContaOpen, setEditContaOpen] = useState(false);
  const [editContaId, setEditContaId] = useState(null);
  const [editContaNome, setEditContaNome] = useState("");
  const [editContaTipo, setEditContaTipo] = useState("Conta");
  const [editContaSaldo, setEditContaSaldo] = useState("");

  function abrirEditarConta(c) {
    if (!canWrite) return guardWrite();
    setEditContaId(c.id);
    setEditContaNome(c.nome ?? "");
    setEditContaTipo(c.tipo ?? "Conta");
    setEditContaSaldo(String(c.saldo_inicial ?? 0));
    setEditContaOpen(true);
  }

  function fecharEditarConta() {
    setEditContaOpen(false);
    setEditContaId(null);
  }

  const [lancamentos, setLancamentos] = useState([]);

  async function salvarEdicaoConta() {
    if (!guardWrite()) return;
    if (!editContaId) return;

    const nome = (editContaNome || "").trim();
    const tipo = (editContaTipo || "Conta").trim();
    const saldo = parseValor(editContaSaldo);
    if (!nome) return;

    const { error } = await supabase
      .from("contas")
      .update({ nome, tipo, saldo_inicial: saldo })
      .eq("id", editContaId);

    if (error) {
      console.error("Erro ao editar conta:", error);
      return;
    }

    fecharEditarConta();
    await carregarContas();
    await carregarLancamentos();
  }

  async function excluirConta(c) {
    if (!guardWrite()) return;
    if (!confirm(`Excluir a conta "${c.nome}"?`)) return;

    const { data: tem, error: e0 } = await supabase
      .from("lancamentos")
      .select("id")
      .eq("conta_id", c.id)
      .limit(1);

    if (e0) {
      console.error("Erro verificando lançamentos da conta:", e0);
      return;
    }

    if ((tem || []).length > 0) {
      alert("Não é possível excluir: existem lançamentos nessa conta. Mova/edite os lançamentos antes.");
      return;
    }

    const { error } = await supabase.from("contas").delete().eq("id", c.id);
    if (error) {
      console.error("Erro ao excluir conta:", error);
      return;
    }

    setContaId((prev) => (prev === c.id ? "" : prev));
    setFiltroContaId((prev) => (prev === c.id ? "todas" : prev));

    await carregarContas();
    await carregarLancamentos();
  }

  const contasById = useMemo(() => {
    const m = new Map();
    for (const c of contas || []) m.set(c.id, c);
    return m;
  }, [contas]);

  const [fixas, setFixas] = useState([]);
  const [fixasOk, setFixasOk] = useState(true);
  const [loadingFixas, setLoadingFixas] = useState(false);

  const [fixaDescricao, setFixaDescricao] = useState("");
  const [fixaValor, setFixaValor] = useState("");
  const [fixaTipo, setFixaTipo] = useState("despesa");
  const [fixaCategoria, setFixaCategoria] = useState("Alimentação");
  const [fixaDia, setFixaDia] = useState(5);
  const [fixaContaId, setFixaContaId] = useState("");

  async function carregarFixas() {
    setLoadingFixas(true);

    const { data, error } = await supabase
      .from("fixas")
      .select("id,descricao,tipo,categoria,valor,dia_vencimento,conta_id,ativo,criado_em")
      .eq("ativo", true)
      .order("criado_em", { ascending: true });

    if (error) {
      console.warn("Tabela fixas não disponível ou erro ao carregar fixas:", error);
      setFixas([]);
      setFixasOk(false);
      setLoadingFixas(false);
      return [];
    }

    const lista = data || [];
    setFixasOk(true);
    setFixas(lista);
    setLoadingFixas(false);
    return lista;
  }

  async function criarFixa() {
    if (!guardWrite()) return;

    if (!fixasOk) {
      alert("A tabela 'fixas' ainda não existe no Supabase. Crie a tabela e tente novamente.");
      return;
    }

    const desc = (fixaDescricao || "").trim();
    const v = parseValor(fixaValor);
    const dia = Math.max(1, Math.min(31, Number(fixaDia || 1)));
    if (!desc || !v) return;

    const payload = {
      descricao: desc,
      tipo: fixaTipo,
      categoria: fixaCategoria,
      valor: v,
      dia_vencimento: dia,
      conta_id: fixaContaId || null,
      ativo: true,
    };

    const { error } = await supabase.from("fixas").insert(payload);
    if (error) {
      console.error("Erro ao criar fixa:", error);
      alert("Erro ao criar fixa. Verifique a tabela 'fixas' no Supabase.");
      return;
    }

    setFixaDescricao("");
    setFixaValor("");
    setFixaTipo("despesa");
    setFixaCategoria("Alimentação");
    setFixaDia(5);
    setFixaContaId("");

    const lista = await carregarFixas();
    await garantirFixasNoMes(lista);
    await carregarLancamentos();
  }

  const [editFixaOpen, setEditFixaOpen] = useState(false);
  const [editFixaId, setEditFixaId] = useState(null);
  const [editFixaDescricao, setEditFixaDescricao] = useState("");
  const [editFixaValor, setEditFixaValor] = useState("");
  const [editFixaTipo, setEditFixaTipo] = useState("despesa");
  const [editFixaCategoria, setEditFixaCategoria] = useState("Alimentação");
  const [editFixaDia, setEditFixaDia] = useState(5);
  const [editFixaContaId, setEditFixaContaId] = useState("");

  function abrirEditarFixa(f) {
    if (!canWrite) return guardWrite();
    setEditFixaId(f.id);
    setEditFixaDescricao(f.descricao ?? "");
    setEditFixaValor(String(f.valor ?? ""));
    setEditFixaTipo(f.tipo ?? "despesa");
    setEditFixaCategoria(f.categoria ?? (f.tipo === "receita" ? "Salário" : "Alimentação"));
    setEditFixaDia(Number(f.dia_vencimento || 5));
    setEditFixaContaId(f.conta_id ?? "");
    setEditFixaOpen(true);
  }

  function fecharEditarFixa() {
    setEditFixaOpen(false);
    setEditFixaId(null);
  }

  async function salvarEdicaoFixa() {
    if (!guardWrite()) return;
    if (!editFixaId) return;
    if (!fixasOk) return;

    const desc = (editFixaDescricao || "").trim();
    const v = parseValor(editFixaValor);
    const dia = Math.max(1, Math.min(31, Number(editFixaDia || 1)));
    if (!desc || !v) return;

    const { error } = await supabase
      .from("fixas")
      .update({
        descricao: desc,
        valor: v,
        tipo: editFixaTipo,
        categoria: editFixaCategoria,
        dia_vencimento: dia,
        conta_id: editFixaContaId || null,
      })
      .eq("id", editFixaId);

    if (error) {
      console.error("Erro ao editar fixa:", error);
      return;
    }

    fecharEditarFixa();
    const lista = await carregarFixas();
    await garantirFixasNoMes(lista);
    await carregarLancamentos();
  }

  async function excluirFixa(f) {
    if (!guardWrite()) return;
    if (!fixasOk) return;
    if (!confirm(`Excluir a fixa "${f.descricao}"?`)) return;

    const { error } = await supabase.from("fixas").update({ ativo: false }).eq("id", f.id);
    if (error) {
      console.error("Erro ao excluir (desativar) fixa:", error);
      return;
    }

    setFixaMenuOpenId(null);
    await carregarFixas();
    await carregarLancamentos();
  }

  async function garantirFixasNoMes(fixasList = null) {
    // ✅ modo leitura: NÃO insere lançamentos automaticamente
    if (!canWrite) return;
    if (!fixasOk) return;

    const baseFixas = Array.isArray(fixasList) ? fixasList : (Array.isArray(fixas) ? fixas : []);
    if (baseFixas.length === 0) return;

    const ids = baseFixas.map((f) => f.id).filter(Boolean);
    if (ids.length === 0) return;

    const { data: existentes, error: e0 } = await supabase
      .from("lancamentos")
      .select("id,parcela_grupo,mes_ano")
      .eq("mes_ano", filtroYM)
      .in("parcela_grupo", ids);

    if (e0) {
      console.error("Erro ao verificar fixas do mês:", e0);
      return;
    }

    const setExist = new Set((existentes || []).map((x) => x.parcela_grupo).filter(Boolean));
    const lastDay = lastDayOfMonth(ano, mes);
    const inserir = [];

    for (const f of baseFixas) {
      if (!f?.id) continue;
      if (setExist.has(f.id)) continue;

      const dia = Math.max(1, Math.min(lastDay, Number(f.dia_vencimento || 1)));
      const dataMes = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

      inserir.push({
        conta_id: f.conta_id ?? null,
        data: dataMes,
        mes_ano: filtroYM,
        valor: Number(f.valor) || 0,
        descricao: (f.descricao || "").trim(),
        tipo: f.tipo || "despesa",
        categoria: f.categoria || (f.tipo === "receita" ? "Salário" : "Alimentação"),
        pago: false,
        parcelado: false,
        parcela_num: null,
        parcela_total: null,
        parcela_grupo: f.id,
      });
    }

    if (inserir.length === 0) return;

    const { error: e1 } = await supabase.from("lancamentos").insert(inserir);
    if (e1) console.error("Erro ao gerar fixas do mês:", e1);
  }

  const [data, setData] = useState(ymd(hoje));
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("despesa");
  const [categoria, setCategoria] = useState("Alimentação");
  const [parcelado, setParcelado] = useState(false);
  const [qtdParcelas, setQtdParcelas] = useState(2);
  const [modoParcela, setModoParcela] = useState("dividir");

  const [receitasRecebidas, setReceitasRecebidas] = useState(0);
  const [despesasPagas, setDespesasPagas] = useState(0);
  const [despesasAPagar, setDespesasAPagar] = useState(0);
  const [receitasAReceber, setReceitasAReceber] = useState(0);

  function recalcular(lista) {
    let rr = 0, dp = 0, dap = 0, rar = 0;
    (lista || []).forEach((l) => {
      const v = Number(l.valor) || 0;
      if (l.tipo === "receita") l.pago ? (rr += v) : (rar += v);
      if (l.tipo === "despesa") l.pago ? (dp += v) : (dap += v);
    });
    setReceitasRecebidas(rr);
    setDespesasPagas(dp);
    setDespesasAPagar(dap);
    setReceitasAReceber(rar);
  }

  async function carregarLancamentos() {
    let q = supabase
      .from("lancamentos")
      .select("*")
      .gte("data", range.start)
      .lt("data", range.end);

    if (filtroContaId !== "todas" && filtroContaId !== "sem") q = q.eq("conta_id", filtroContaId);
    if (filtroContaId === "sem") q = q.is("conta_id", null);

    const { data, error } = await q.order("data", { ascending: false });
    if (!error) {
      const lista = data || [];
      setLancamentos(lista);
      recalcular(lista);
    } else {
      console.error("Erro carregar lançamentos:", error);
    }
  }

  useEffect(() => {
    (async () => {
      const contasList = await carregarContas();
      const fixasList = await carregarFixas();
      await garantirFixasNoMes(fixasList);
      await carregarLancamentos();

      if (!contaId && (contasList || []).length > 0) setContaId(contasList[0].id);
      if (!fixaContaId && (contasList || []).length > 0) setFixaContaId("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroYM, filtroContaId]);

  async function salvar() {
    if (!guardWrite()) return;

    const vInformado = parseValor(valor);
    if (!vInformado) return;

    const desc = (descricao || "").trim();
    const cat = categoria;
    const t = tipo;
    const contaEscolhida = contaId || null;

    if (!parcelado) {
      const { error } = await supabase.from("lancamentos").insert({
        conta_id: contaEscolhida,
        data,
        mes_ano: String(data).slice(0, 7),
        valor: vInformado,
        descricao: desc,
        tipo: t,
        categoria: cat,
        pago: false,
        parcelado: false,
        parcela_num: null,
        parcela_total: null,
        parcela_grupo: null,
      });

      if (error) console.error("Erro ao salvar:", error);

      setValor("");
      setDescricao("");
      await carregarLancamentos();
      return;
    }
    const n = Math.max(2, Math.min(120, Number(qtdParcelas || 2)));
    const grupo = uuidLike();

    let valorParcela = vInformado;
    if (modoParcela === "dividir") valorParcela = Math.round((vInformado / n) * 100) / 100;
    else valorParcela = Math.round(vInformado * 100) / 100;

    const rows = [];
    let soma = 0;

    for (let i = 1; i <= n; i++) {
      let valorI = valorParcela;

      if (modoParcela === "dividir") {
        if (i === n) {
          const totalAteAntes = Math.round(soma * 100) / 100;
          const diff = Math.round((vInformado - totalAteAntes) * 100) / 100;
          valorI = diff;
        }
        soma += valorI;
      }

      const dataI = addMonthsKeepDay(data, i - 1);
      const mesAnoI = String(dataI).slice(0, 7);

      rows.push({
        conta_id: contaEscolhida,
        data: dataI,
        mes_ano: mesAnoI,
        valor: valorI,
        descricao: `${desc}${desc ? " " : ""}(${i}/${n})`,
        tipo: t,
        categoria: cat,
        pago: false,
        parcelado: true,
        parcela_num: i,
        parcela_total: n,
        parcela_grupo: grupo,
      });
    }

    const { error } = await supabase.from("lancamentos").insert(rows);
    if (error) {
      console.error("Erro ao salvar parcelado:", error);
      return;
    }

    setValor("");
    setDescricao("");
    setParcelado(false);
    setQtdParcelas(2);
    setModoParcela("dividir");

    await carregarLancamentos();
  }

  async function togglePago(l) {
    if (!guardWrite()) return;

    const novo = !l.pago;

    const atual = lancamentos.map((x) => (x.id === l.id ? { ...x, pago: novo } : x));
    setLancamentos(atual);
    recalcular(atual);

    const { error } = await supabase.from("lancamentos").update({ pago: novo }).eq("id", l.id);
    if (error) {
      console.error("Erro atualizar pago:", error);
      await carregarLancamentos();
    }
  }

  async function excluirLanc(l) {
    if (!guardWrite()) return;
    if (!confirm("Excluir esse lançamento?")) return;

    const { error } = await supabase.from("lancamentos").delete().eq("id", l.id);
    if (error) {
      console.error("Erro ao excluir:", error);
      return;
    }

    await carregarLancamentos();
  }

  async function excluirGrupo(l) {
    if (!guardWrite()) return;
    if (!l.parcelado || !l.parcela_grupo) return;
    if (!confirm("Excluir TODAS as parcelas dessa compra?")) return;

    const { error } = await supabase.from("lancamentos").delete().eq("parcela_grupo", l.parcela_grupo);
    if (error) {
      console.error("Erro ao excluir grupo:", error);
      return;
    }

    await carregarLancamentos();
  }

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editTipo, setEditTipo] = useState("despesa");
  const [editCategoria, setEditCategoria] = useState("Alimentação");
  const [editLancContaId, setEditLancContaId] = useState(null);
  const [editIsParcelado, setEditIsParcelado] = useState(false);
  const [editParcelaNum, setEditParcelaNum] = useState(null);
  const [editParcelaTotal, setEditParcelaTotal] = useState(null);

  function abrirEditar(l) {
    if (!canWrite) return guardWrite();
    setEditId(l.id);
    setEditData(l.data);
    setEditValor(String(l.valor ?? ""));
    setEditDescricao(l.descricao ?? "");
    setEditTipo(l.tipo ?? "despesa");
    setEditCategoria(l.categoria ?? (l.tipo === "receita" ? "Salário" : "Alimentação"));
    setEditLancContaId(l.conta_id ?? null);

    setEditIsParcelado(!!l.parcelado);
    setEditParcelaNum(l.parcela_num ?? null);
    setEditParcelaTotal(l.parcela_total ?? null);

    setEditOpen(true);
  }

  function fecharEditar() {
    setEditOpen(false);
    setEditId(null);
  }

  async function salvarEdicao() {
    if (!guardWrite()) return;
    if (!editId) return;

    const v = parseValor(editValor);
    if (!v) return;

    const mesAnoNovo = String(editData).slice(0, 7);

    const { error } = await supabase
      .from("lancamentos")
      .update({
        data: editData,
        mes_ano: mesAnoNovo,
        valor: v,
        descricao: (editDescricao || "").trim(),
        tipo: editTipo,
        categoria: editCategoria,
        conta_id: editLancContaId,
      })
      .eq("id", editId);

    if (error) {
      console.error("Erro salvar edição:", error);
      return;
    }

    fecharEditar();
    await carregarLancamentos();
  }

  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [grpRef, setGrpRef] = useState(null);
  const [grpDescricaoBase, setGrpDescricaoBase] = useState("");
  const [grpTipo, setGrpTipo] = useState("despesa");
  const [grpCategoria, setGrpCategoria] = useState("Alimentação");
  const [grpContaId, setGrpContaId] = useState(null);
  const [grpModo, setGrpModo] = useState("parcela");
  const [grpValor, setGrpValor] = useState("");

  function abrirEditarGrupo(l) {
    if (!canWrite) return guardWrite();
    if (!l.parcelado || !l.parcela_grupo) return;

    const base = stripParcelaSuffix(l.descricao || "");
    setGrpDescricaoBase(base || "Compra parcelada");
    setGrpTipo(l.tipo || "despesa");
    setGrpCategoria(l.categoria || (l.tipo === "receita" ? "Salário" : "Alimentação"));
    setGrpContaId(l.conta_id ?? null);

    setGrpModo("parcela");
    setGrpValor(String(l.valor ?? ""));

    setGrpRef({
      parcela_grupo: l.parcela_grupo,
      total: Number(l.parcela_total || 0) || null,
    });

    setEditGroupOpen(true);
  }

  function fecharEditarGrupo() {
    setEditGroupOpen(false);
    setGrpRef(null);
  }

  async function salvarEdicaoGrupo() {
    if (!guardWrite()) return;
    if (!grpRef?.parcela_grupo) return;

    const { data: rows, error: e1 } = await supabase
      .from("lancamentos")
      .select("id,data,parcela_num,parcela_total,valor")
      .eq("parcela_grupo", grpRef.parcela_grupo)
      .order("data", { ascending: true });

    if (e1) {
      console.error("Erro buscar grupo:", e1);
      return;
    }

    const lista = rows || [];
    const n = Number(lista?.[0]?.parcela_total || lista.length || 0);
    if (!n || lista.length === 0) return;

    const descBase = (grpDescricaoBase || "").trim();
    const tipoNovo = grpTipo;
    const catNovo = grpCategoria;

    const vInformado = parseValor(grpValor);
    if (!vInformado) return;

    let valores = new Array(n).fill(0);

    if (grpModo === "parcela") {
      const vp = Math.round(vInformado * 100) / 100;
      valores = valores.map(() => vp);
    } else {
      const vp = Math.round((vInformado / n) * 100) / 100;
      let soma = 0;
      for (let i = 0; i < n; i++) {
        let vi = vp;
        if (i === n - 1) {
          const totalAteAntes = Math.round(soma * 100) / 100;
          const diff = Math.round((vInformado - totalAteAntes) * 100) / 100;
          vi = diff;
        }
        valores[i] = vi;
        soma += vi;
      }
    }

    for (const r of lista) {
      const num = Number(r.parcela_num || 0) || 0;
      const idx = Math.max(0, Math.min(n - 1, num - 1));

      const { error } = await supabase
        .from("lancamentos")
        .update({
          valor: valores[idx],
          tipo: tipoNovo,
          categoria: catNovo,
          descricao: `${descBase}${descBase ? " " : ""}(${num}/${n})`,
          conta_id: grpContaId,
        })
        .eq("id", r.id);

      if (error) {
        console.error("Erro atualizar parcela do grupo:", error);
        return;
      }
    }

    fecharEditarGrupo();
    await carregarLancamentos();
  }

  function mesAnterior() {
    let m = mes - 1, a = ano;
    if (m < 0) { m = 11; a--; }
    setMes(m); setAno(a);
  }

  function proximoMes() {
    let m = mes + 1, a = ano;
    if (m > 11) { m = 0; a++; }
    setMes(m); setAno(a);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setMenuOpenId(null);
        setContaMenuOpenId(null);
        setFixaMenuOpenId(null);
        if (editOpen) fecharEditar();
        if (editGroupOpen) fecharEditarGrupo();
        if (editContaOpen) fecharEditarConta();
        if (editFixaOpen) fecharEditarFixa();
        return;
      }

      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setUiShowLista(true);
        setTimeout(() => buscaRef.current?.focus?.(), 0);
        return;
      }

      if ((e.key === "n" || e.key === "N") && !isTypingTarget(e.target)) {
        e.preventDefault();
        setUiShowNovo(true);
        setTimeout(() => {
          novoRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        }, 0);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!isTypingTarget(e.target)) return;
        const el = e.target;
        if (novoRef.current && novoRef.current.contains(el)) {
          e.preventDefault();
          salvar();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, editGroupOpen, editContaOpen, editFixaOpen, canWrite]);

  const saldosPorConta = useMemo(() => {
    const map = new Map();
    for (const c of contas || []) {
      map.set(c.id, {
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        saldo: Number(c.saldo_inicial) || 0,
        receitas: 0,
        despesas: 0,
      });
    }

    for (const l of lancamentos || []) {
      if (!l.pago) continue;
      const cid = l.conta_id;
      if (!cid || !map.has(cid)) continue;

      const v = Number(l.valor) || 0;
      const obj = map.get(cid);

      if (l.tipo === "receita") obj.receitas += v;
      if (l.tipo === "despesa") obj.despesas += v;
    }

    for (const obj of map.values()) {
      obj.saldo = (Number(obj.saldo) || 0) + (obj.receitas || 0) - (obj.despesas || 0);
    }

    return Array.from(map.values());
  }, [contas, lancamentos]);

  const saldoTotalContas = useMemo(() => {
    return (saldosPorConta || []).reduce((s, x) => s + (Number(x.saldo) || 0), 0);
  }, [saldosPorConta]);

  const fixaIdsSet = useMemo(() => new Set((fixas || []).map((f) => f.id).filter(Boolean)), [fixas]);

  const [busca, setBusca] = useState("");
  const buscaDeb = useDebouncedValue(busca, 220);

  const chips = [
    { key: "todos", label: "Todos" },
    { key: "pendentes", label: "Pendentes" },
    { key: "pagos", label: "Pagos/Recebidos" },
    { key: "atrasados", label: "Atrasados" },
    { key: "hoje", label: "Vence hoje" },
    { key: "amanha", label: "Vence amanhã" },
    { key: "receitas", label: "Receitas" },
    { key: "despesas", label: "Despesas" },
  ];
  const [chip, setChip] = useState("todos");

  const [sortMode, setSortMode] = useState("data");

  function sortComparator(a, b) {
    if (sortMode === "valor") {
      const va = Number(a.valor) || 0;
      const vb = Number(b.valor) || 0;
      if (vb !== va) return vb - va;
      return String(b.data || "").localeCompare(String(a.data || ""));
    }

    if (sortMode === "vencimento") {
      const ia = vencimentoInfo(a);
      const ib = vencimentoInfo(b);

      const pa = a.pago ? 10 : ia?.key === "atrasado" ? 0 : ia?.key === "hoje" ? 1 : ia?.key === "amanha" ? 2 : 3;
      const pb = b.pago ? 10 : ib?.key === "atrasado" ? 0 : ib?.key === "hoje" ? 1 : ib?.key === "amanha" ? 2 : 3;

      if (pa !== pb) return pa - pb;
      return String(b.data || "").localeCompare(String(a.data || ""));
    }

    return String(b.data || "").localeCompare(String(a.data || ""));
  }

  const listaBase = useMemo(() => lancamentos || [], [lancamentos]);

  const listaBusca = useMemo(() => {
    const q = String(buscaDeb || "").trim().toLowerCase();
    if (!q) return listaBase;

    return (listaBase || []).filter((l) => {
      const contaNome = l.conta_id ? (contasById.get(l.conta_id)?.nome || "") : "";
      const t = String(l.tipo || "");
      const cat = String(l.categoria || "");
      const desc = String(l.descricao || "");
      const pack = `${desc} ${cat} ${t} ${contaNome}`.toLowerCase();
      return pack.includes(q);
    });
  }, [listaBase, buscaDeb, contasById]);

  const listaChips = useMemo(() => {
    const out = (listaBusca || []).filter((l) => {
      const vinf = vencimentoInfo(l);
      switch (chip) {
        case "pendentes": return !l.pago;
        case "pagos": return !!l.pago;
        case "atrasados": return !l.pago && vinf?.key === "atrasado";
        case "hoje": return !l.pago && vinf?.key === "hoje";
        case "amanha": return !l.pago && vinf?.key === "amanha";
        case "receitas": return l.tipo === "receita";
        case "despesas": return l.tipo === "despesa";
        default: return true;
      }
    });

    return out.slice().sort(sortComparator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaBusca, chip, sortMode]);

  const fixasDoMes = useMemo(() => {
    if (!fixasOk) return [];
    return (listaChips || []).filter((l) =>
      !l.parcelado && l.parcela_grupo && fixaIdsSet.has(l.parcela_grupo)
    );
  }, [listaChips, fixaIdsSet, fixasOk]);

  const parcelasDoMes = useMemo(() => (listaChips || []).filter((l) => !!l.parcelado), [listaChips]);

  const avulsosDoMes = useMemo(() => {
    return (listaChips || []).filter((l) => {
      const isFixa = !l.parcelado && l.parcela_grupo && fixaIdsSet.has(l.parcela_grupo);
      const isParc = !!l.parcelado;
      return !isFixa && !isParc;
    });
  }, [listaChips, fixaIdsSet]);

  const alertas = useMemo(() => {
    let atrasados = 0, hojeC = 0, amanhaC = 0;
    let pendenteTotal = 0, atrasadoTotal = 0;

    for (const l of listaBase || []) {
      if (l.pago) continue;
      const v = Number(l.valor) || 0;
      pendenteTotal += v;

      const vi = vencimentoInfo(l);
      if (vi?.key === "atrasado") { atrasados++; atrasadoTotal += v; }
      if (vi?.key === "hoje") hojeC++;
      if (vi?.key === "amanha") amanhaC++;
    }

    return { atrasados, hojeC, amanhaC, pendenteTotal, atrasadoTotal };
  }, [listaBase]);

  function exportarCsv() {
    if (!guardWrite("Assinatura inativa. Exportação está indisponível no modo leitura.")) return;

    const rows = listaChips || [];
    const csv = buildCsv(rows);
    const fn = `GFD_${filtroYM}_${filtroContaId}_${chip}_${sortMode}.csv`.replace(/[^\w.\-]+/g, "_");
    downloadText(fn, csv, "text/csv;charset=utf-8");
  }

  function agruparPorDia(lista) {
    const map = {};
    (lista || []).forEach((l) => {
      if (!map[l.data]) map[l.data] = [];
      map[l.data].push(l);
    });
    return map;
  }

  function menuItemStyle({ danger = false, disabled = false } = {}) {
    return {
      width: "100%",
      textAlign: "left",
      padding: "10px 10px",
      border: "1px solid var(--border)",
      borderRadius: 12,
      background: danger ? "rgba(239,68,68,.08)" : "var(--card)",
      color: danger ? "var(--danger)" : "var(--text)",
      fontWeight: 1000,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      pointerEvents: disabled ? "none" : "auto",
    };
  }

  function Modal({ title, onClose, children }) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={styles.modalOverlay}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      >
        <div style={styles.modalCard}>
          <div style={styles.modalHeaderSticky}>
            <div style={{ fontWeight: 1000 }}>{title}</div>
            <button onClick={onClose} style={styles.iconButton} aria-label="Fechar modal">✖️</button>
          </div>
          <div style={styles.modalBodyScroll}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  function renderListaSecao(titulo, lista, open, onToggle, hint = null) {
    const mapPorDia = agruparPorDia(lista);
    const dias = Object.keys(mapPorDia).sort((a, b) => b.localeCompare(a));

    return (
      <CollapseSection
        id={`lista_${titulo}`}
        title={titulo}
        subtitle={`${(lista || []).length}`}
        open={open}
        onToggle={onToggle}
        rightSlot={hint ? <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>{hint}</span> : null}
      >
        {dias.length === 0 ? (
          <div style={{ ...styles.card, marginTop: 8 }}>
            <p style={{ margin: 0, color: "var(--muted)", fontWeight: 900 }}>
              Nada aqui. {buscaDeb || chip !== "todos" ? "Tente limpar a busca ou trocar o filtro." : ""}
            </p>
          </div>
        ) : (
          dias.map((dia) => (
            <div key={dia} style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h4 style={{ margin: "6px 0" }}>{formatBRfromYmd(dia)}</h4>
                <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>
                  {mapPorDia[dia].length} item(ns)
                </span>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {mapPorDia[dia].map((l) => {
                  const isParc = !!l.parcelado && !!l.parcela_grupo;
                  const badge = vencimentoInfo(l);

                  const contaNomeExib =
                    l.conta_id ? (contasById.get(l.conta_id)?.nome || "Conta") : null;

                  const rowStyle = {
                    ...styles.row,
                    background: badge ? badge.bg : "var(--card)",
                    boxShadow: badge ? `0 0 0 2px ${badge.ring}33` : "var(--shadowSoft, var(--shadow))",
                    borderColor: badge ? `${badge.ring}55` : "var(--border)",
                  };

                  return (
                    <div key={l.id} style={rowStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={styles.pillType(l.tipo)}>{String(l.tipo).toUpperCase()}</span>

                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ opacity: 0.95, fontWeight: 900 }}>
                                {l.descricao || "(sem descrição)"}
                              </span>
                              <span style={{ opacity: 0.55 }}>•</span>
                              <span style={{ opacity: 0.88 }}>{l.categoria}</span>
                              <span style={{ opacity: 0.55 }}>•</span>
                              <b style={{ fontSize: 14 }}>{money(l.valor)}</b>

                              {contaNomeExib ? (
                                <>
                                  <span style={{ opacity: 0.55 }}>•</span>
                                  <span style={{ color: "var(--muted)", fontWeight: 900 }}>{contaNomeExib}</span>
                                </>
                              ) : null}

                              {!l.pago ? (
                                <span style={styles.pendente}>(pendente)</span>
                              ) : (
                                <span style={styles.pago}>(pago)</span>
                              )}

                              {badge ? (
                                <span style={{
                                  padding: "2px 10px",
                                  borderRadius: 999,
                                  background: "var(--controlBg2, var(--card2, var(--card)))",
                                  border: `1px solid ${badge.ring}88`,
                                  color: badge.fg,
                                  fontWeight: 1000,
                                  fontSize: 12
                                }}>
                                  {badge.label}
                                </span>
                              ) : null}

                              {isParc && l.parcela_num && l.parcela_total ? (
                                <span style={{ color: "var(--muted)", fontWeight: 900 }}>
                                  • parcela {l.parcela_num}/{l.parcela_total}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <button
                          ref={(node) => setMenuBtnRef(l.id, node)}
                          onClick={() => toggleMenu(l.id)}
                          aria-haspopup="menu"
                          aria-expanded={menuOpenId === l.id}
                          aria-label="Abrir opções do lançamento"
                          title={canWrite ? "Opções" : "Modo leitura"}
                          style={{
                            ...styles.iconButton,
                            opacity: canWrite ? 1 : 0.45,
                            cursor: canWrite ? "pointer" : "not-allowed",
                          }}
                          disabled={!canWrite}
                        >
                          ⋮
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </CollapseSection>
    );
  }

  const saldoReal = receitasRecebidas - despesasPagas;
  const categoriasNovo = tipo === "despesa" ? categoriasDespesa : categoriasReceita;
  const categoriasEdit = editTipo === "despesa" ? categoriasDespesa : categoriasReceita;
  const categoriasGrupo = grpTipo === "despesa" ? categoriasDespesa : categoriasReceita;
  const categoriasFixaNovo = fixaTipo === "despesa" ? categoriasDespesa : categoriasReceita;
  const categoriasFixaEdit = editFixaTipo === "despesa" ? categoriasDespesa : categoriasReceita;

  return (
    <div style={styles.page}>
      <style>{globalCss()}</style>

      <div style={styles.container}>
        <div style={styles.header}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, letterSpacing: -0.2 }}>Dashboard</h2>

              <span style={styles.badgeMonthYear}>{meses[mes]} • {ano}</span>

              {!canWrite ? (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(239,68,68,.45)",
                  background: "rgba(239,68,68,.10)",
                  color: "rgba(239,68,68,1)",
                  fontWeight: 1100,
                  fontSize: 12,
                }}>
                  🔒 Modo leitura (assinatura inativa)
                </span>
              ) : null}
            </div>

            {!canWrite ? (
              <div style={{
                border: "1px solid rgba(239,68,68,.35)",
                background: "rgba(239,68,68,.08)",
                padding: 12,
                borderRadius: 16,
                fontWeight: 1000,
                color: "var(--text)",
              }}>
                🔒 Sua assinatura está inativa. Você pode <b>visualizar</b> seus dados, mas não pode <b>criar, editar ou excluir</b>.
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={styles.alertPill("danger")}>
                ⛔ Atrasados: <b>{alertas.atrasados}</b> • {money(alertas.atrasadoTotal)}
              </span>
              <span style={styles.alertPill("warn")}>⏰ Hoje: <b>{alertas.hojeC}</b></span>
              <span style={styles.alertPill("info")}>📅 Amanhã: <b>{alertas.amanhaC}</b></span>
              <span style={styles.alertPill("muted")}>🧾 Pendente total: <b>{money(alertas.pendenteTotal)}</b></span>
            </div>

            <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 900 }}>
              Dica: <b>/</b> foca na busca • <b>N</b> abre “Novo lançamento” • <b>Esc</b> fecha menus/modais.
            </div>
          </div>

          <button
            onClick={() => setUiPersonalizarOpen((v) => !v)}
            style={styles.secondaryBtn}
            aria-expanded={uiPersonalizarOpen}
            aria-label="Abrir personalização do dashboard"
            title="Personalizar"
          >
            ⚙️ Personalizar
          </button>
        </div>

        {uiPersonalizarOpen ? (
          <div style={{ ...styles.card, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <label style={styles.checkLabel}>
                <input type="checkbox" checked={uiShowContas} onChange={(e) => setUiShowContas(e.target.checked)} />
                Mostrar Contas
              </label>

              <label style={styles.checkLabel}>
                <input type="checkbox" checked={uiShowFixas} onChange={(e) => setUiShowFixas(e.target.checked)} />
                Mostrar Fixas
              </label>

              <label style={styles.checkLabel}>
                <input type="checkbox" checked={uiShowNovo} onChange={(e) => setUiShowNovo(e.target.checked)} />
                Mostrar Novo lançamento
              </label>

              <label style={styles.checkLabel}>
                <input type="checkbox" checked={uiShowLista} onChange={(e) => setUiShowLista(e.target.checked)} />
                Mostrar Lista
              </label>

              <span style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                No celular, seções podem iniciar recolhidas (mobile-first).
              </span>
            </div>
          </div>
        ) : null}

        <div style={{ ...styles.card, padding: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={mesAnterior} style={styles.iconButtonCompact} aria-label="Mês anterior" title="Mês anterior">⬅️</button>

            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={styles.selectCompact} aria-label="Selecionar mês">
              {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>

            <select value={ano} onChange={(e) => setAno(Number(e.target.value))} style={styles.selectCompact} aria-label="Selecionar ano">
              {anosOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>

            <button onClick={proximoMes} style={styles.iconButtonCompact} aria-label="Próximo mês" title="Próximo mês">➡️</button>

            <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 900 }}>
                Período: <b>{range.start}</b> até <b>{range.end}</b>
              </span>

              <span style={{ color: "var(--muted)", fontSize: 13, fontWeight: 900 }}>Conta:</span>
              <select value={filtroContaId} onChange={(e) => setFiltroContaId(e.target.value)} style={styles.select} aria-label="Filtrar por conta">
                <option value="todas">Todas</option>
                <option value="sem">Sem conta</option>
                {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="gfd-grid2" style={styles.grid2}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Receitas</div>
            <div style={styles.bigNumber}>{money(receitasRecebidas)}</div>
            <div style={styles.mutedLine}>⏳ A receber: <b>{money(receitasAReceber)}</b></div>
            <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.88, fontWeight: 900 }}>
              💰 Recebido: <b>{money(receitasRecebidas)}</b> | ⏳ A receber: {money(receitasAReceber)}
            </p>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Despesas</div>
            <div style={styles.bigNumber}>{money(despesasPagas)}</div>
            <div style={styles.mutedLine}>⏳ A pagar: <b>{money(despesasAPagar)}</b></div>
            <p style={{ marginTop: 10, marginBottom: 0, opacity: 0.88, fontWeight: 900 }}>
              💸 Pago: <b>{money(despesasPagas)}</b> | ⏳ A pagar: {money(despesasAPagar)}
            </p>
          </div>
        </div>

        <div style={{ ...styles.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={styles.cardTitle}>Saldo real (mês)</div>
            <div style={{ fontSize: 22, fontWeight: 1000 }}>
              {saldoReal >= 0 ? "🟢" : "🔴"} {money(saldoReal)}
            </div>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 900 }}>
            Saldo real = receitas recebidas − despesas pagas
          </div>
        </div>

        {uiShowContas ? (
          <CollapseSection
            id="contas"
            title="Contas"
            subtitle={`${contas.length} conta(s)`}
            open={uiShowContas}
            onToggle={() => setUiShowContas((v) => !v)}
            rightSlot={<span style={{ fontWeight: 1000 }}>Total: {money(saldoTotalContas)}</span>}
          >
            <div style={{ ...styles.card, padding: 12 }}>
              <div style={styles.formRow}>
                <input
                  placeholder="Nome da conta (ex: Nubank)"
                  value={contaNome}
                  onChange={(e) => setContaNome(e.target.value)}
                  style={styles.input}
                  aria-label="Nome da conta"
                  disabled={!canWrite}
                />

                <select value={contaTipo} onChange={(e) => setContaTipo(e.target.value)} style={styles.select} aria-label="Tipo da conta" disabled={!canWrite}>
                  <option value="Conta">Conta</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Investimento">Investimento</option>
                  <option value="Outros">Outros</option>
                </select>

                <input
                  placeholder="Saldo inicial (opcional)"
                  value={contaSaldoInicial}
                  onChange={(e) => setContaSaldoInicial(e.target.value)}
                  style={styles.input}
                  aria-label="Saldo inicial da conta"
                  disabled={!canWrite}
                />

                <button onClick={criarConta} style={styles.primaryBtn} aria-label="Criar conta" disabled={!canWrite}>
                  ➕ Criar conta
                </button>

                <span style={{ color: "var(--muted)", fontWeight: 900 }}>
                  {loadingContas ? "Carregando..." : ""}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {contas.length === 0 ? (
                <div style={styles.card}>
                  <p style={{ margin: 0, color: "var(--muted)", fontWeight: 900 }}>
                    Nenhuma conta cadastrada. Crie pelo menos uma (ex: Nubank, Itaú, Dinheiro).
                  </p>
                </div>
              ) : null}

              {saldosPorConta.map((c) => (
                <div
                  key={c.id}
                  style={{ ...styles.card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      <b style={{ fontSize: 15 }}>{c.nome}</b>
                      <span style={{ color: "var(--muted)", fontWeight: 900 }}>({c.tipo})</span>
                      <span style={styles.badgeMuted}>mês</span>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, fontWeight: 900 }}>
                      + Receitas pagas: {money(c.receitas)} | - Despesas pagas: {money(c.despesas)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 1000, fontSize: 16 }}>{money(c.saldo)}</div>

                    <button
                      ref={(node) => setContaBtnRef(c.id, node)}
                      onClick={() => toggleContaMenu(c.id)}
                      title={canWrite ? "Opções da conta" : "Modo leitura"}
                      aria-haspopup="menu"
                      aria-expanded={contaMenuOpenId === c.id}
                      aria-label="Abrir opções da conta"
                      style={{
                        ...styles.iconButton,
                        opacity: canWrite ? 1 : 0.45,
                        cursor: canWrite ? "pointer" : "not-allowed",
                      }}
                      disabled={!canWrite}
                    >
                      ⋮
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {editContaOpen ? (
              <Modal title="Editar conta" onClose={fecharEditarConta}>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={styles.label}>
                    Nome
                    <input value={editContaNome} onChange={(e) => setEditContaNome(e.target.value)} style={styles.input} disabled={!canWrite} />
                  </label>

                  <label style={styles.label}>
                    Tipo
                    <select value={editContaTipo} onChange={(e) => setEditContaTipo(e.target.value)} style={styles.select} disabled={!canWrite}>
                      <option value="Conta">Conta</option>
                      <option value="Cartão">Cartão</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Investimento">Investimento</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </label>

                  <label style={styles.label}>
                    Saldo inicial
                    <input
                      value={editContaSaldo}
                      onChange={(e) => setEditContaSaldo(e.target.value)}
                      placeholder="Ex: 1000 ou 1000,50"
                      style={styles.input}
                      disabled={!canWrite}
                    />
                  </label>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={fecharEditarConta} style={styles.secondaryBtn}>Cancelar</button>
                    <button onClick={salvarEdicaoConta} style={styles.primaryBtn} disabled={!canWrite}>Salvar</button>
                  </div>

                  <p style={{ color: "var(--muted)", fontSize: 12, margin: 0, fontWeight: 900 }}>
                    O saldo mostrado no card é: saldo inicial + receitas pagas − despesas pagas (no mês).
                  </p>
                </div>
              </Modal>
            ) : null}
          </CollapseSection>
        ) : (
          <CollapseSection id="contas_closed" title="Contas" subtitle="recolhido" open={false} onToggle={() => setUiShowContas(true)}>
            <div />
          </CollapseSection>
        )}

        {uiShowFixas ? (
          <CollapseSection
            id="fixas"
            title="Fixas recorrentes"
            subtitle={fixasOk ? `${(fixas || []).length} ativa(s)` : "indisponível"}
            open={uiShowFixas}
            onToggle={() => setUiShowFixas((v) => !v)}
          >
            {!fixasOk ? (
              <div style={{ ...styles.card, borderColor: "rgba(239,68,68,.35)", background: "rgba(239,68,68,.08)" }}>
                <b>Atenção:</b> a tabela <code>fixas</code> não foi encontrada (ou deu erro).<br />
                Crie a tabela no Supabase para habilitar fixas recorrentes automaticamente.
              </div>
            ) : null}

            <div style={{ ...styles.card, padding: 12, marginTop: 10 }}>
              <div style={styles.formRow}>
                <input
                  placeholder="Descrição da fixa (ex: Aluguel)"
                  value={fixaDescricao}
                  onChange={(e) => setFixaDescricao(e.target.value)}
                  style={styles.input}
                  aria-label="Descrição da fixa"
                  disabled={!canWrite}
                />

                <input
                  placeholder="Valor (ex: 1200 ou 1200,50)"
                  value={fixaValor}
                  onChange={(e) => setFixaValor(e.target.value)}
                  style={styles.input}
                  aria-label="Valor da fixa"
                  disabled={!canWrite}
                />

                <select
                  value={fixaTipo}
                  onChange={(e) => {
                    const t = e.target.value;
                    setFixaTipo(t);
                    setFixaCategoria(t === "receita" ? "Salário" : "Alimentação");
                  }}
                  style={styles.select}
                  aria-label="Tipo da fixa"
                  disabled={!canWrite}
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>

                <select value={fixaCategoria} onChange={(e) => setFixaCategoria(e.target.value)} style={styles.select} aria-label="Categoria da fixa" disabled={!canWrite}>
                  {categoriasFixaNovo.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 1000 }}>
                  Dia:
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={fixaDia}
                    onChange={(e) => setFixaDia(e.target.value)}
                    style={{ ...styles.input, width: 84 }}
                    aria-label="Dia de vencimento da fixa"
                    disabled={!canWrite}
                  />
                </label>

                <select value={fixaContaId} onChange={(e) => setFixaContaId(e.target.value)} style={styles.select} aria-label="Conta vinculada da fixa" disabled={!canWrite}>
                  <option value="">(Sem conta)</option>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>

                <button onClick={criarFixa} disabled={!fixasOk || !canWrite} style={styles.primaryBtn} aria-label="Criar fixa">
                  ➕ Criar fixa
                </button>

                <button
                  onClick={async () => {
                    if (!guardWrite()) return;
                    const lista = await carregarFixas();
                    await garantirFixasNoMes(lista);
                    await carregarLancamentos();
                    alert("Fixas do mês geradas/verificadas.");
                  }}
                  disabled={!fixasOk || !canWrite}
                  style={styles.secondaryBtn}
                  aria-label="Gerar fixas do mês"
                >
                  🔁 Gerar fixas do mês
                </button>

                <span style={{ color: "var(--muted)", fontWeight: 900 }}>
                  {loadingFixas ? "Carregando..." : ""}
                </span>
              </div>
            </div>

            {fixasOk && (fixas || []).length > 0 ? (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {(fixas || []).map((f) => (
                  <div
                    key={f.id}
                    style={{ ...styles.card, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                        <b>{f.descricao}</b>
                        <span style={{ color: "var(--muted)", fontWeight: 900 }}>
                          ({String(f.tipo).toUpperCase()} • dia {f.dia_vencimento})
                        </span>
                        <span style={styles.badgeMuted}>{f.categoria}</span>
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, fontWeight: 900 }}>
                        {money(f.valor)}{" "}
                        {f.conta_id ? (
                          <span>• {contasById.get(f.conta_id)?.nome || "Conta"}</span>
                        ) : (
                          <span>• (Sem conta)</span>
                        )}
                      </div>
                    </div>

                    <button
                      ref={(node) => setFixaBtnRef(f.id, node)}
                      onClick={() => toggleFixaMenu(f.id)}
                      title={canWrite ? "Opções da fixa" : "Modo leitura"}
                      aria-haspopup="menu"
                      aria-expanded={fixaMenuOpenId === f.id}
                      aria-label="Abrir opções da fixa"
                      style={{
                        ...styles.iconButton,
                        opacity: canWrite ? 1 : 0.45,
                        cursor: canWrite ? "pointer" : "not-allowed",
                      }}
                      disabled={!canWrite}
                    >
                      ⋮
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {editFixaOpen ? (
              <Modal title="Editar fixa" onClose={fecharEditarFixa}>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={styles.label}>
                    Descrição
                    <input value={editFixaDescricao} onChange={(e) => setEditFixaDescricao(e.target.value)} style={styles.input} disabled={!canWrite} />
                  </label>

                  <label style={styles.label}>
                    Valor
                    <input value={editFixaValor} onChange={(e) => setEditFixaValor(e.target.value)} style={styles.input} disabled={!canWrite} />
                  </label>

                  <label style={styles.label}>
                    Tipo
                    <select
                      value={editFixaTipo}
                      onChange={(e) => {
                        const t = e.target.value;
                        setEditFixaTipo(t);
                        setEditFixaCategoria(t === "receita" ? "Salário" : "Alimentação");
                      }}
                      style={styles.select}
                      disabled={!canWrite}
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </label>

                  <label style={styles.label}>
                    Categoria
                    <select value={editFixaCategoria} onChange={(e) => setEditFixaCategoria(e.target.value)} style={styles.select} disabled={!canWrite}>
                      {categoriasFixaEdit.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>

                  <label style={{ ...styles.label, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    Dia do vencimento:
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={editFixaDia}
                      onChange={(e) => setEditFixaDia(e.target.value)}
                      style={{ ...styles.input, width: 110 }}
                      disabled={!canWrite}
                    />
                    <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>
                      (se o mês tiver menos dias, ajusta para o último dia)
                    </span>
                  </label>

                  <label style={styles.label}>
                    Conta
                    <select value={editFixaContaId} onChange={(e) => setEditFixaContaId(e.target.value)} style={styles.select} disabled={!canWrite}>
                      <option value="">(Sem conta)</option>
                      {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={fecharEditarFixa} style={styles.secondaryBtn}>Cancelar</button>
                    <button onClick={salvarEdicaoFixa} style={styles.primaryBtn} disabled={!canWrite}>Salvar</button>
                  </div>
                </div>
              </Modal>
            ) : null}
          </CollapseSection>
        ) : (
          <CollapseSection id="fixas_closed" title="Fixas recorrentes" subtitle="recolhido" open={false} onToggle={() => setUiShowFixas(true)}>
            <div />
          </CollapseSection>
        )}

        <div ref={novoRef} />
        {uiShowNovo ? (
          <CollapseSection
            id="novo"
            title="Novo lançamento"
            subtitle={parcelado ? `parcelado (${qtdParcelas}x)` : "rápido"}
            open={uiShowNovo}
            onToggle={() => setUiShowNovo((v) => !v)}
          >
            <div style={{ ...styles.card, padding: 12, opacity: canWrite ? 1 : 0.65 }}>
              <div style={styles.formRow}>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={styles.input} disabled={!canWrite} />

                <input
                  placeholder="Valor (ex: 1200 ou 1200,50)"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  style={styles.input}
                  disabled={!canWrite}
                />

                <select
                  value={tipo}
                  onChange={(e) => {
                    const t = e.target.value;
                    setTipo(t);
                    setCategoria(t === "receita" ? "Salário" : "Alimentação");
                  }}
                  style={styles.select}
                  disabled={!canWrite}
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>

                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={styles.select} disabled={!canWrite}>
                  {categoriasNovo.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <select value={contaId} onChange={(e) => setContaId(e.target.value)} style={styles.select} aria-label="Conta do lançamento" disabled={!canWrite}>
                  <option value="">(Sem conta)</option>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>

                <input
                  placeholder="Descrição (ex: Mercado)"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  style={styles.input}
                  disabled={!canWrite}
                />

                <label style={styles.checkLabel}>
                  <input type="checkbox" checked={parcelado} onChange={(e) => setParcelado(e.target.checked)} disabled={!canWrite} />
                  Parcelado
                </label>

                {parcelado ? (
                  <>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, fontWeight: 1000 }}>
                      Parcelas:
                      <input
                        type="number"
                        min="2"
                        max="120"
                        value={qtdParcelas}
                        onChange={(e) => setQtdParcelas(e.target.value)}
                        style={{ ...styles.input, width: 84 }}
                        disabled={!canWrite}
                      />
                    </label>

                    <select value={modoParcela} onChange={(e) => setModoParcela(e.target.value)} style={styles.select} aria-label="Modo do valor parcelado" disabled={!canWrite}>
                      <option value="dividir">Dividir total</option>
                      <option value="parcela">Valor é por parcela</option>
                    </select>
                  </>
                ) : null}

                <button onClick={salvar} style={styles.primaryBtn} disabled={!canWrite}>💾 Salvar</button>

                <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>
                  Dica premium: <b>Ctrl+Enter</b> salva quando você estiver aqui.
                </span>
              </div>
            </div>
          </CollapseSection>
        ) : (
          <CollapseSection id="novo_closed" title="Novo lançamento" subtitle="recolhido" open={false} onToggle={() => setUiShowNovo(true)}>
            <div />
          </CollapseSection>
        )}

        {uiShowLista ? (
          <CollapseSection
            id="lista"
            title="Lista"
            subtitle={`${(listaChips || []).length} item(ns)`}
            open={uiShowLista}
            onToggle={() => setUiShowLista((v) => !v)}
            rightSlot={
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={exportarCsv} style={styles.secondaryBtn} title="Exportar CSV" disabled={!canWrite}>
                  📤 Exportar CSV
                </button>
              </div>
            }
          >
            <div style={{ ...styles.card, padding: 12 }}>
              <div style={styles.formRow}>
                <input
                  ref={buscaRef}
                  placeholder="Buscar… (descrição, categoria, tipo, conta)"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={{ ...styles.input, minWidth: 0 }}
                />

                <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={styles.select} aria-label="Ordenar lista">
                  <option value="data">Ordenar: Data</option>
                  <option value="valor">Ordenar: Valor</option>
                  <option value="vencimento">Ordenar: Vencimento</option>
                </select>

                <button
                  onClick={() => { setBusca(""); setChip("todos"); setSortMode("data"); }}
                  style={styles.secondaryBtn}
                  title="Limpar filtros"
                >
                  🧹 Limpar
                </button>

                <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                  Busca com debounce • filtros instantâneos
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {chips.map((c) => {
                  const active = chip === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setChip(c.key)}
                      style={{
                        ...styles.chip,
                        background: active ? "var(--chipOnBg)" : "var(--chipBg)",
                        borderColor: active ? "var(--chipOnBorder)" : "var(--border)",
                        color: active ? "var(--chipOnText)" : "var(--text)",
                      }}
                      aria-pressed={active}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {renderListaSecao("Fixas do mês", fixasDoMes, uiShowListaFixas, () => setUiShowListaFixas((v) => !v), fixasOk ? null : "indisponível")}
              {renderListaSecao("Parcelas do mês", parcelasDoMes, uiShowListaParcelas, () => setUiShowListaParcelas((v) => !v))}
              {renderListaSecao("Avulsos do mês", avulsosDoMes, uiShowListaAvulsos, () => setUiShowListaAvulsos((v) => !v))}
            </div>

            {editOpen ? (
              <Modal title="Editar lançamento" onClose={fecharEditar}>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={styles.label}>
                    Data
                    <input type="date" value={editData} onChange={(e) => setEditData(e.target.value)} style={styles.input} disabled={!canWrite} />
                  </label>

                  <label style={styles.label}>
                    Valor
                    <input value={editValor} onChange={(e) => setEditValor(e.target.value)} style={styles.input} disabled={!canWrite} />
                  </label>

                  <label style={styles.label}>
                    Tipo
                    <select
                      value={editTipo}
                      onChange={(e) => {
                        const t = e.target.value;
                        setEditTipo(t);
                        setEditCategoria(t === "receita" ? "Salário" : "Alimentação");
                      }}
                      style={styles.select}
                      disabled={!canWrite}
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </label>

                  <label style={styles.label}>
                    Categoria
                    <select value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} style={styles.select} disabled={!canWrite}>
                      {categoriasEdit.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>

                  <label style={styles.label}>
                    Conta
                    <select value={editLancContaId ?? ""} onChange={(e) => setEditLancContaId(e.target.value || null)} style={styles.select} disabled={!canWrite}>
                      <option value="">(Sem conta)</option>
                      {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>

                  <label style={styles.label}>
                    Descrição
                    <input value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} style={styles.input} disabled={!canWrite} />
                  </label>

                  {editIsParcelado ? (
                    <div style={{ ...styles.card2, padding: 10 }}>
                      <div style={{ fontWeight: 1000 }}>ℹ️ Parcela {editParcelaNum}/{editParcelaTotal}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>
                        Para alterar todas as parcelas, use “Editar grupo”.
                      </div>
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={fecharEditar} style={styles.secondaryBtn}>Cancelar</button>
                    <button onClick={salvarEdicao} style={styles.primaryBtn} disabled={!canWrite}>Salvar</button>
                  </div>
                </div>
              </Modal>
            ) : null}

            {editGroupOpen ? (
              <Modal title="Editar grupo (parcelas)" onClose={fecharEditarGrupo}>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={styles.label}>
                    Descrição base
                    <input value={grpDescricaoBase} onChange={(e) => setGrpDescricaoBase(e.target.value)} style={styles.input} disabled={!canWrite} />
                  </label>

                  <label style={styles.label}>
                    Tipo
                    <select
                      value={grpTipo}
                      onChange={(e) => {
                        const t = e.target.value;
                        setGrpTipo(t);
                        setGrpCategoria(t === "receita" ? "Salário" : "Alimentação");
                      }}
                      style={styles.select}
                      disabled={!canWrite}
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </label>

                  <label style={styles.label}>
                    Categoria
                    <select value={grpCategoria} onChange={(e) => setGrpCategoria(e.target.value)} style={styles.select} disabled={!canWrite}>
                      {categoriasGrupo.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>

                  <label style={styles.label}>
                    Conta
                    <select value={grpContaId ?? ""} onChange={(e) => setGrpContaId(e.target.value || null)} style={styles.select} disabled={!canWrite}>
                      <option value="">(Sem conta)</option>
                      {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>

                  <div style={{ ...styles.card2, padding: 12, opacity: canWrite ? 1 : 0.7 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <b>Valor</b>

                      <select value={grpModo} onChange={(e) => setGrpModo(e.target.value)} style={styles.select} disabled={!canWrite}>
                        <option value="parcela">Valor por parcela</option>
                        <option value="total">Valor total do grupo</option>
                      </select>

                      <input value={grpValor} onChange={(e) => setGrpValor(e.target.value)} style={{ ...styles.input, width: 160 }} disabled={!canWrite} />
                      <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>
                        {grpModo === "total" ? "Divide automaticamente e ajusta a última parcela." : "Aplica o mesmo valor a todas."}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={fecharEditarGrupo} style={styles.secondaryBtn}>Cancelar</button>
                    <button onClick={salvarEdicaoGrupo} style={styles.primaryBtn} disabled={!canWrite}>Salvar grupo</button>
                  </div>
                </div>
              </Modal>
            ) : null}
          </CollapseSection>
        ) : (
          <CollapseSection id="lista_closed" title="Lista" subtitle="recolhido" open={false} onToggle={() => setUiShowLista(true)}>
            <div />
          </CollapseSection>
        )}

        {menuOpenId && canWrite ? (
          <div
            ref={menuBoxRef}
            role="menu"
            aria-label="Menu de ações do lançamento"
            style={{ ...styles.menuFixed, top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            {(() => {
              const l = (listaBase || []).find((x) => x.id === menuOpenId);
              if (!l) return null;

              const isParc = !!l.parcelado && !!l.parcela_grupo;
              const labelPago = l.pago ? "↩️ Desfazer" : (l.tipo === "despesa" ? "Marcar pago" : "Marcar recebido");

              return (
                <>
                  <button style={menuItemStyle()} role="menuitem" onClick={() => { setMenuOpenId(null); togglePago(l); }}>
                    ✅ {labelPago}
                  </button>

                  <button style={menuItemStyle()} role="menuitem" onClick={() => { setMenuOpenId(null); abrirEditar(l); }}>
                    ✏️ Editar
                  </button>

                  {isParc ? (
                    <>
                      <button style={menuItemStyle()} role="menuitem" onClick={() => { setMenuOpenId(null); abrirEditarGrupo(l); }}>
                        🧩 Editar grupo
                      </button>

                      <button style={menuItemStyle({ danger: true })} role="menuitem" onClick={() => { setMenuOpenId(null); excluirGrupo(l); }}>
                        🧨 Excluir grupo
                      </button>
                    </>
                  ) : null}

                  <button style={menuItemStyle({ danger: true })} role="menuitem" onClick={() => { setMenuOpenId(null); excluirLanc(l); }}>
                    🗑️ Excluir
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}

        {contaMenuOpenId && canWrite ? (
          <div
            ref={contaMenuRef}
            role="menu"
            aria-label="Menu de ações da conta"
            style={{ ...styles.menuFixed, top: contaMenuPos.top, left: contaMenuPos.left, width: contaMenuPos.width }}
          >
            {(() => {
              const c = (contas || []).find((x) => x.id === contaMenuOpenId);
              if (!c) return null;

              return (
                <>
                  <button
                    style={menuItemStyle()}
                    role="menuitem"
                    onClick={() => { setContaMenuOpenId(null); abrirEditarConta(c); }}
                  >
                    ✏️ Editar conta
                  </button>

                  <button
                    style={menuItemStyle({ danger: true })}
                    role="menuitem"
                    onClick={() => { setContaMenuOpenId(null); excluirConta(c); }}
                  >
                    🗑️ Excluir conta
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}

        {fixaMenuOpenId && canWrite ? (
          <div
            ref={fixaMenuRef}
            role="menu"
            aria-label="Menu de ações da fixa"
            style={{ ...styles.menuFixed, top: fixaMenuPos.top, left: fixaMenuPos.left, width: fixaMenuPos.width }}
          >
            {(() => {
              const f = (fixas || []).find((x) => x.id === fixaMenuOpenId);
              if (!f) return null;

              return (
                <>
                  <button
                    style={menuItemStyle()}
                    role="menuitem"
                    onClick={() => { setFixaMenuOpenId(null); abrirEditarFixa(f); }}
                  >
                    ✏️ Editar fixa
                  </button>

                  <button
                    style={menuItemStyle({ danger: true })}
                    role="menuitem"
                    onClick={() => { setFixaMenuOpenId(null); excluirFixa(f); }}
                  >
                    🗑️ Excluir fixa
                  </button>
                </>
              );
            })()}
          </div>
        ) : null}

      </div>
    </div>
  );
}

/* =========================
   ESTILOS + CSS GLOBAL
   ========================= */

const styles = {
  page: {
    minHeight: "100dvh",
    width: "100%",
    maxWidth: "100%",
    background: "var(--bg)",
    color: "var(--text)",
    padding: "clamp(10px, 1.8vw, 18px)",
    overflowX: "clip",
  },
  container: {
    width: "100%",
    maxWidth: "100%",
    margin: 0,
    display: "grid",
    gap: 12,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  card: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "var(--shadow)",
  },
  card2: {
    border: "1px solid var(--border)",
    background: "var(--card2)",
    borderRadius: 16,
    boxShadow: "var(--shadowSoft)",
  },
  cardTitle: { fontWeight: 1000, color: "var(--muted)", fontSize: 13, letterSpacing: -0.1 },
  bigNumber: { fontSize: 26, fontWeight: 1100, letterSpacing: -0.35, marginTop: 6 },
  mutedLine: { marginTop: 6, color: "var(--muted)", fontWeight: 900, fontSize: 13 },

  badgeMuted: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--chipBg)",
    color: "var(--muted)",
    fontWeight: 1000,
    fontSize: 11,
    lineHeight: 1,
  },

  badgeMonthYear: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--chipBg)",
    color: "var(--muted)",
    fontWeight: 1000,
    fontSize: 10.5,
    lineHeight: 1,
    letterSpacing: -0.1,
  },

  formRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    alignItems: "center",
  },
  label: {
    display: "grid",
    gap: 6,
    fontWeight: 1000,
    color: "var(--muted)",
    fontSize: 12,
  },
  input: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    width: "100%",
    minWidth: 0,
    fontWeight: 900,
  },
  select: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    width: "100%",
    minWidth: 0,
    fontWeight: 900,
  },

  selectCompact: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "7px 10px",
    outline: "none",
    width: "fit-content",
    minWidth: 0,
    fontWeight: 900,
    fontSize: 13,
    lineHeight: 1.1,
  },

  primaryBtn: {
    border: "1px solid rgba(59,130,246,.45)",
    background: "rgba(59,130,246,.16)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 1100,
    cursor: "pointer",
    width: "fit-content",
    justifySelf: "start",
  },
  secondaryBtn: {
    border: "1px solid var(--border)",
    background: "var(--controlBg2)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 1000,
    cursor: "pointer",
    width: "fit-content",
    justifySelf: "start",
  },
  iconButton: {
    border: "1px solid var(--border)",
    background: "var(--controlBg2)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "8px 10px",
    fontWeight: 1000,
    cursor: "pointer",
    width: "fit-content",
    justifySelf: "start",
  },

  iconButtonCompact: {
    border: "1px solid var(--border)",
    background: "var(--controlBg2)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "6px 8px",
    fontWeight: 1000,
    cursor: "pointer",
    width: "fit-content",
    justifySelf: "start",
    fontSize: 13,
    lineHeight: 1,
  },

  chip: {
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 1100,
    cursor: "pointer",
    transition: "transform .06s ease",
  },
  row: {
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    overflow: "hidden",
  },
  menuFixed: {
    position: "fixed",
    zIndex: 9999,
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "var(--card)",
    padding: 10,
    boxShadow: "var(--shadow)",
    display: "grid",
    gap: 8,
    maxWidth: "min(92vw, 280px)",
    maxHeight: "min(60vh, 320px)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
  },
  pendente: { color: "var(--warn)", fontWeight: 1100 },
  pago: { color: "var(--ok)", fontWeight: 1100 },
  pillType: (tipo) => ({
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: tipo === "receita" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.10)",
    color: tipo === "receita" ? "rgba(34,197,94,1)" : "rgba(239,68,68,1)",
    fontWeight: 1100,
    fontSize: 12,
  }),
  alertPill: (kind) => {
    const base = {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid var(--border)",
      fontWeight: 1100,
      fontSize: 12,
      background: "var(--chipBg)",
      color: "var(--text)",
    };
    if (kind === "danger") return { ...base, borderColor: "rgba(239,68,68,.55)", background: "rgba(239,68,68,.10)" };
    if (kind === "warn") return { ...base, borderColor: "rgba(245,158,11,.55)", background: "rgba(245,158,11,.10)" };
    if (kind === "info") return { ...base, borderColor: "rgba(56,189,248,.55)", background: "rgba(56,189,248,.10)" };
    return base;
  },
  collapseHeaderBtn: {
    width: "100%",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    borderRadius: 16,
    padding: "12px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    boxShadow: "var(--shadowSoft)",
  },
  collapseChevron: { fontSize: 16, fontWeight: 1100, opacity: 0.9 },
  collapseBody: {
    overflow: "hidden",
    transition: "all .18s ease",
  },
  checkLabel: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontWeight: 1000,
    color: "var(--text)",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    display: "grid",
    placeItems: "center",
    zIndex: 50,
    padding: 14,
  },
  modalCard: {
    width: "min(680px, 96vw)",
    maxHeight: "min(86dvh, 720px)",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "var(--card)",
    boxShadow: "0 25px 80px rgba(0,0,0,.35)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  modalHeaderSticky: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottom: "1px solid var(--border)",
    background: "var(--card)",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  modalBodyScroll: {
    padding: 14,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
  },
};

function globalCss() {
  return `
:root{
  --bg:#0b1220;
  --text:#e5e7eb;
  --muted:#a1a1aa;
  --border:rgba(148,163,184,.18);
  --card:rgba(255,255,255,.04);
  --card2:rgba(255,255,255,.03);
  --controlBg:rgba(255,255,255,.06);
  --controlBg2:rgba(255,255,255,.04);
  --shadow:0 18px 40px rgba(0,0,0,.22);
  --shadowSoft:0 12px 28px rgba(0,0,0,.16);
  --ok:rgb(34,197,94);
  --warn:rgb(245,158,11);
  --danger:rgb(239,68,68);
  --chipBg:rgba(255,255,255,.04);
  --chipOnBg:rgba(59,130,246,.18);
  --chipOnBorder:rgba(59,130,246,.55);
  --chipOnText:#e5e7eb;
}

html, body, #root {
  min-height: 100%;
  width: 100%;
  max-width: 100%;
  background: var(--bg);
}

body{
  margin:0;
  overflow-x: clip;
}

@supports not (overflow: clip){
  body{ overflow-x: hidden; }
}

html.light, body.light, #root.light{
  --bg:#f6f7fb;
  --text:#0f172a;
  --muted:#64748b;
  --border:rgba(15,23,42,.12);
  --card:#ffffff;
  --card2:#fbfcff;
  --controlBg:#ffffff;
  --controlBg2:#f3f4f6;
  --shadow:0 18px 40px rgba(2,6,23,.08);
  --shadowSoft:0 12px 28px rgba(2,6,23,.06);
  --chipBg:#ffffff;
  --chipOnBg:rgba(59,130,246,.12);
  --chipOnBorder:rgba(59,130,246,.35);
  --chipOnText:#0f172a;
}

@media (prefers-color-scheme: light){
  html:not(.dark):not(.force-dark) :root,
  :root:not(.dark):not(.force-dark){
    --bg:#f6f7fb;
    --text:#0f172a;
    --muted:#64748b;
    --border:rgba(15,23,42,.12);
    --card:#ffffff;
    --card2:#fbfcff;
    --controlBg:#ffffff;
    --controlBg2:#f3f4f6;
    --shadow:0 18px 40px rgba(2,6,23,.08);
    --shadowSoft:0 12px 28px rgba(2,6,23,.06);
    --chipBg:#ffffff;
    --chipOnBg:rgba(59,130,246,.12);
    --chipOnBorder:rgba(59,130,246,.35);
    --chipOnText:#0f172a;
  }
}

*{ box-sizing:border-box; }
button:active{ transform: translateY(1px); }
input,select,button{ font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; }

.gfd-grid2{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
}
@media (max-width: 820px){
  .gfd-grid2{ grid-template-columns: 1fr; }
}
`;
}
