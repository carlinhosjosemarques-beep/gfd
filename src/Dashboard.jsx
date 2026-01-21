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

// yyyy-mm-dd (LOCAL)
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ym(ano, mes) {
  return `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

// Parse BR seguro (não “trava” digitação e aceita 1.234,56 / 1234,56 / 1234.56)
function parseValor(str) {
  const s0 = String(str ?? "").trim();
  if (!s0) return 0;

  let s = s0.replace(/\s/g, "");

  const hasComma = s.includes(",");
  if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  }

  s = s.replace(/[^\d.-]/g, "");

  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

function addMonthsKeepDay(yyyyMmDd, add) {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, 1);
  const target = new Date(base.getFullYear(), base.getMonth() + add, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d || 1, lastDay);
  return ymd(new Date(target.getFullYear(), target.getMonth(), day));
}

function uuidLike() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// remove sufixo " (i/n)" no final
function stripParcelaSuffix(desc) {
  const s = String(desc ?? "").trim();
  return s.replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)\s*$/g, "").trim();
}

function lastDayOfMonth(ano, mes) {
  return new Date(ano, mes + 1, 0).getDate();
}

function toDateAtMidnight(yyyyMmDd) {
  const [y, m, d] = String(yyyyMmDd).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0);
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

function formatBRfromYmd(ymdStr) {
  if (!ymdStr) return "";
  const [y, m, d] = String(ymdStr).split("-").map(Number);
  const dt = new Date(y || 1970, (m || 1) - 1, d || 1);
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
        type="button"
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

        {rightSlot ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {rightSlot}
          </div>
        ) : null}
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
export default function Dashboard({ canWrite } = {}) {
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

  // visibilidade (personalizar)
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

  // aberto/fechado (collapse)
  const [uiOpenContas, setUiOpenContas] = useState(() => safeBoolLS("gfd_open_contas", !defaultCollapsedMobile));
  const [uiOpenFixas, setUiOpenFixas] = useState(() => safeBoolLS("gfd_open_fixas", !defaultCollapsedMobile));
  const [uiOpenNovo, setUiOpenNovo] = useState(() => safeBoolLS("gfd_open_novo", !defaultCollapsedMobile));
  const [uiOpenLista, setUiOpenLista] = useState(() => safeBoolLS("gfd_open_lista", true));
  const [uiOpenListaFixas, setUiOpenListaFixas] = useState(() => safeBoolLS("gfd_open_lista_fixas", true));
  const [uiOpenListaParcelas, setUiOpenListaParcelas] = useState(() => safeBoolLS("gfd_open_lista_parcelas", true));
  const [uiOpenListaAvulsos, setUiOpenListaAvulsos] = useState(() => safeBoolLS("gfd_open_lista_avulsos", true));

  useEffect(() => setBoolLS("gfd_open_contas", uiOpenContas), [uiOpenContas]);
  useEffect(() => setBoolLS("gfd_open_fixas", uiOpenFixas), [uiOpenFixas]);
  useEffect(() => setBoolLS("gfd_open_novo", uiOpenNovo), [uiOpenNovo]);
  useEffect(() => setBoolLS("gfd_open_lista", uiOpenLista), [uiOpenLista]);
  useEffect(() => setBoolLS("gfd_open_lista_fixas", uiOpenListaFixas), [uiOpenListaFixas]);
  useEffect(() => setBoolLS("gfd_open_lista_parcelas", uiOpenListaParcelas), [uiOpenListaParcelas]);
  useEffect(() => setBoolLS("gfd_open_lista_avulsos", uiOpenListaAvulsos), [uiOpenListaAvulsos]);

  const buscaRef = useRef(null);
  const novoRef = useRef(null);

  function isTypingTarget(el) {
    const t = el?.tagName?.toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || el?.isContentEditable;
  }

  // menus ⋮ (lancamentos)
  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuBtnRefs = useRef(new Map());
  function setMenuBtnRef(id, node) {
    if (!id) return;
    if (node) menuBtnRefs.current.set(id, node);
    else menuBtnRefs.current.delete(id);
  }
  function toggleMenu(id) {
    if (!canWrite) return;
    setMenuOpenId((prev) => (prev === id ? null : id));
  }

  // menus ⋮ (contas)
  const [contaMenuOpenId, setContaMenuOpenId] = useState(null);
  const contaBtnRefs = useRef(new Map());
  function setContaBtnRef(id, node) {
    const map = contaBtnRefs.current;
    if (!id) return;
    if (!node) map.delete(id);
    else map.set(id, node);
  }
  function toggleContaMenu(id) {
    if (!canWrite) return;
    setContaMenuOpenId((prev) => (prev === id ? null : id));
  }

  // menus ⋮ (fixas)
  const [fixaMenuOpenId, setFixaMenuOpenId] = useState(null);
  const fixaBtnRefs = useRef(new Map());
  function setFixaBtnRef(id, node) {
    const map = fixaBtnRefs.current;
    if (!id) return;
    if (!node) map.delete(id);
    else map.set(id, node);
  }
  function toggleFixaMenu(id) {
    if (!canWrite) return;
    setFixaMenuOpenId((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    function onDown(e) {
      const insideMenu = !!e.target?.closest?.("[data-gfd-portalmenu='1']");
      if (menuOpenId) {
        const btn = menuBtnRefs.current.get(menuOpenId);
        const onBtn = btn && btn.contains(e.target);
        if (!insideMenu && !onBtn) setMenuOpenId(null);
      }
      if (contaMenuOpenId) {
        const btn = contaBtnRefs.current.get(contaMenuOpenId);
        const onBtn = btn && btn.contains(e.target);
        if (!insideMenu && !onBtn) setContaMenuOpenId(null);
      }
      if (fixaMenuOpenId) {
        const btn = fixaBtnRefs.current.get(fixaMenuOpenId);
        const onBtn = btn && btn.contains(e.target);
        if (!insideMenu && !onBtn) setFixaMenuOpenId(null);
      }
    }

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("touchstart", onDown, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("touchstart", onDown, true);
    };
  }, [menuOpenId, contaMenuOpenId, fixaMenuOpenId]);

  // CONTAS
  const [contas, setContas] = useState([]);
  const [loadingContas, setLoadingContas] = useState(false);

  const [contaNome, setContaNome] = useState("");
  const [contaSaldoInicial, setContaSaldoInicial] = useState("");
  const [contaTipo, setContaTipo] = useState("corrente");
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

    const payload = { nome, tipo: (contaTipo || "corrente").trim(), saldo_inicial: saldo, ativo: true };
    const { error } = await supabase.from("contas").insert(payload);

    if (error) {
      console.error("Erro criar conta:", error);
      return;
    }

    setContaNome("");
    setContaSaldoInicial("");
    setContaTipo("corrente");
    await carregarContas();
  }

  const [editContaOpen, setEditContaOpen] = useState(false);
  const [editContaId, setEditContaId] = useState(null);
  const [editContaNome, setEditContaNome] = useState("");
  const [editContaTipo, setEditContaTipo] = useState("corrente");
  const [editContaSaldo, setEditContaSaldo] = useState("");

  function abrirEditarConta(c) {
    if (!canWrite) return guardWrite();
    setEditContaId(c.id);
    setEditContaNome(c.nome ?? "");
    setEditContaTipo(c.tipo ?? "corrente");
    setEditContaSaldo(String(c.saldo_inicial ?? 0));
    setEditContaOpen(true);
  }

  function fecharEditarConta() {
    setEditContaOpen(false);
    setEditContaId(null);
  }

  async function salvarEdicaoConta() {
    if (!guardWrite()) return;
    if (!editContaId) return;

    const nome = (editContaNome || "").trim();
    const tipo = (editContaTipo || "corrente").trim();
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

  // LANCAMENTOS (state vem antes porque excluirConta checa lançamentos)
  const [lancamentos, setLancamentos] = useState([]);

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

  // FIXAS
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

  async function garantirFixasNoMes(fixasList = null) {
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

  // NOVO LANCAMENTO
  const [data, setData] = useState(ymd(hoje));
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("despesa");
  const [categoria, setCategoria] = useState("Alimentação");
  const [parcelado, setParcelado] = useState(false);
  const [qtdParcelas, setQtdParcelas] = useState(2);
  const [modoParcela, setModoParcela] = useState("dividir");

  // KPIs
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
    const contaEscolhida = contaId || null;

    if (!parcelado) {
      const { error } = await supabase.from("lancamentos").insert({
        conta_id: contaEscolhida,
        data,
        mes_ano: String(data).slice(0, 7),
        valor: vInformado,
        descricao: desc,
        tipo,
        categoria,
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

    let valorParcela =
      modoParcela === "dividir"
        ? Math.round((vInformado / n) * 100) / 100
        : Math.round(vInformado * 100) / 100;

    const rows = [];
    let soma = 0;

    for (let i = 1; i <= n; i++) {
      let valorI = valorParcela;

      if (modoParcela === "dividir") {
        if (i === n) {
          const totalAteAntes = Math.round(soma * 100) / 100;
          valorI = Math.round((vInformado - totalAteAntes) * 100) / 100;
        }
        soma += valorI;
      }

      const dataI = addMonthsKeepDay(data, i - 1);

      rows.push({
        conta_id: contaEscolhida,
        data: dataI,
        mes_ano: String(dataI).slice(0, 7),
        valor: valorI,
        descricao: `${desc}${desc ? " " : ""}(${i}/${n})`,
        tipo,
        categoria,
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

  // EDITAR LANC
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
    setEditCategoria(l.categoria ?? "Alimentação");
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

    const { error } = await supabase
      .from("lancamentos")
      .update({
        data: editData,
        mes_ano: String(editData).slice(0, 7),
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

  // EDITAR GRUPO
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
    setGrpCategoria(l.categoria || "Alimentação");
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
          vi = Math.round((vInformado - totalAteAntes) * 100) / 100;
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
  }, [editOpen, editGroupOpen, editContaOpen, editFixaOpen, canWrite]);

  // saldo por conta
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

  // busca + chips + sort
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

    const base = `GFD_${filtroYM}_${filtroContaId}_${chip}_${sortMode}`;
    const fn = `${base}.csv`.replace(/[^\w.-]+/g, "_");

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
            <button onClick={onClose} style={styles.iconButton} aria-label="Fechar modal" type="button">✖️</button>
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
                                <span
                                  style={{
                                    padding: "2px 10px",
                                    borderRadius: 999,
                                    background: "var(--controlBg2)",
                                    border: `1px solid ${badge.ring}88`,
                                    color: badge.fg,
                                    fontWeight: 1000,
                                    fontSize: 12,
                                  }}
                                >
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
                            touchAction: "manipulation",
                          }}
                          disabled={!canWrite}
                          type="button"
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

  // aliases (mantive)
  const contaSaldo = contaSaldoInicial;
  const setContaSaldo = setContaSaldoInicial;
  const salvarConta = criarConta;
  const salvarFixa = criarFixa;

  const setContaMenuBtnRef = setContaBtnRef;
  const setFixaMenuBtnRef = setFixaBtnRef;

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
                <span
                  style={{
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
                  }}
                >
                  🔒 Modo leitura (assinatura inativa)
                </span>
              ) : null}
            </div>

            {!canWrite ? (
              <div
                style={{
                  border: "1px solid rgba(239,68,68,.35)",
                  background: "rgba(239,68,68,.08)",
                  padding: 12,
                  borderRadius: 16,
                  fontWeight: 1000,
                  color: "var(--text)",
                }}
              >
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
              Dica: <b>/</b> foca na busca • <b>N</b> abre “Novo lançamento” • <b>Esc</b> fecha menus/modais • <b>Ctrl/Cmd + Enter</b> salva.
            </div>
          </div>

          <button
            onClick={() => setUiPersonalizarOpen((v) => !v)}
            style={styles.secondaryBtn}
            aria-expanded={uiPersonalizarOpen}
            aria-label="Abrir personalização do dashboard"
            title="Personalizar"
            type="button"
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
            <button onClick={mesAnterior} style={styles.iconButtonCompact} aria-label="Mês anterior" title="Mês anterior" type="button">⬅️</button>

            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={styles.selectCompact} aria-label="Selecionar mês">
              {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>

            <select value={ano} onChange={(e) => setAno(Number(e.target.value))} style={styles.selectCompact} aria-label="Selecionar ano">
              {anosOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>

            <button onClick={proximoMes} style={styles.iconButtonCompact} aria-label="Próximo mês" title="Próximo mês" type="button">➡️</button>

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

        <div style={styles.gridTop}>
          <div style={styles.card}>
            <div style={styles.kpiLabel}>Saldo real (pagos)</div>
            <div style={styles.kpiValue}>{money(saldoReal)}</div>
            <div style={styles.kpiHint}>
              Receitas recebidas {money(receitasRecebidas)} • Despesas pagas {money(despesasPagas)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.kpiLabel}>Pendentes (mês)</div>
            <div style={styles.kpiValue}>{money(despesasAPagar + receitasAReceber)}</div>
            <div style={styles.kpiHint}>
              A pagar {money(despesasAPagar)} • A receber {money(receitasAReceber)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.kpiLabel}>Saldo total (contas)</div>
            <div style={styles.kpiValue}>{money(saldoTotalContas)}</div>
            <div style={styles.kpiHint}>Considera saldo inicial + lançamentos pagos</div>
          </div>
        </div>

        {uiShowContas ? (
          <CollapseSection
            id="contas"
            title="Contas"
            subtitle={`${contas.length}${loadingContas ? " • carregando..." : ""}`}
            open={uiOpenContas}
            onToggle={() => setUiOpenContas((v) => !v)}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ ...styles.card, padding: 12 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={contaNome}
                    onChange={(e) => setContaNome(e.target.value)}
                    placeholder="Nome da conta (ex: Nubank)"
                    style={styles.input}
                    disabled={!canWrite}
                  />

                  <select
                    value={contaTipo}
                    onChange={(e) => setContaTipo(e.target.value)}
                    style={styles.select}
                    disabled={!canWrite}
                  >
                    <option value="corrente">Conta corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="cartao">Cartão</option>
                    <option value="invest">Investimentos</option>
                    <option value="outros">Outros</option>
                  </select>

                  <input
                    value={contaSaldo}
                    onChange={(e) => setContaSaldo(e.target.value)}
                    placeholder="Saldo inicial (opcional)"
                    style={styles.input}
                    disabled={!canWrite}
                    inputMode="decimal"
                  />

                  <button onClick={salvarConta} style={styles.primaryBtn} disabled={!canWrite} type="button">
                    ➕ Adicionar
                  </button>

                  {!canWrite ? <span style={styles.lockInline}>🔒 Modo leitura</span> : null}
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {saldosPorConta.map((c) => (
                  <div key={c.id} style={styles.row}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <b style={{ fontSize: 14 }}>{c.nome}</b>
                        <span style={styles.badgeLight}>{String(c.tipo || "").toUpperCase()}</span>
                        <span style={{ color: "var(--muted)", fontWeight: 900 }}>
                          saldo: <b style={{ color: "var(--text)" }}>{money(c.saldo)}</b>
                        </span>
                      </div>
                      <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                        receitas: {money(c.receitas)} • despesas: {money(c.despesas)}
                      </div>
                    </div>

                    <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <button
                        ref={(node) => setContaMenuBtnRef(c.id, node)}
                        onClick={() => toggleContaMenu(c.id)}
                        style={{ ...styles.iconButton, touchAction: "manipulation" }}
                        aria-haspopup="menu"
                        aria-expanded={contaMenuOpenId === c.id}
                        disabled={!canWrite}
                        title={!canWrite ? "Modo leitura" : "Opções"}
                        type="button"
                      >
                        ⋮
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapseSection>
        ) : null}
        {uiShowFixas && fixasOk ? (
          <CollapseSection
            id="fixas"
            title="Fixas"
            subtitle={`${fixas.length}${loadingFixas ? " • carregando..." : ""}`}
            open={uiOpenFixas}
            onToggle={() => setUiOpenFixas((v) => !v)}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ ...styles.card, padding: 12 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={fixaDescricao}
                    onChange={(e) => setFixaDescricao(e.target.value)}
                    placeholder="Descrição (ex: Aluguel)"
                    style={styles.input}
                    disabled={!canWrite}
                  />

                  <input
                    value={fixaValor}
                    onChange={(e) => setFixaValor(e.target.value)}
                    placeholder="Valor"
                    style={styles.input}
                    disabled={!canWrite}
                    inputMode="decimal"
                  />

                  <select
                    value={fixaTipo}
                    onChange={(e) => setFixaTipo(e.target.value)}
                    style={styles.select}
                    disabled={!canWrite}
                  >
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>

                  <select
                    value={fixaCategoria}
                    onChange={(e) => setFixaCategoria(e.target.value)}
                    style={styles.select}
                    disabled={!canWrite}
                  >
                    {(categoriasFixaNovo || []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <input
                    value={fixaDia}
                    onChange={(e) => setFixaDia(e.target.value)}
                    placeholder="Dia venc."
                    style={{ ...styles.input, width: 120 }}
                    disabled={!canWrite}
                    inputMode="numeric"
                  />

                  <select
                    value={fixaContaId}
                    onChange={(e) => setFixaContaId(e.target.value)}
                    style={styles.select}
                    disabled={!canWrite}
                    title="Conta (opcional)"
                  >
                    <option value="">Conta (opcional)</option>
                    {contas.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>

                  <button onClick={salvarFixa} style={styles.primaryBtn} disabled={!canWrite} type="button">
                    ➕ Criar fixa
                  </button>

                  {!canWrite ? <span style={styles.lockInline}>🔒 Modo leitura</span> : null}
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {fixas.map((f) => (
                  <div key={f.id} style={styles.row}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ fontSize: 14 }}>{f.descricao}</b>
                        <span style={styles.pillType(f.tipo)}>{String(f.tipo || "").toUpperCase()}</span>
                        <span style={{ color: "var(--muted)", fontWeight: 900 }}>
                          {money(f.valor)} • dia {f.dia_vencimento}
                        </span>
                        <span style={{ color: "var(--muted)", fontWeight: 900 }}>• {f.categoria}</span>
                      </div>

                      <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                        Conta:{" "}
                        <b style={{ color: "var(--text)" }}>
                          {f.conta_id ? (contasById.get(f.conta_id)?.nome || "Conta") : "—"}
                        </b>
                      </div>
                    </div>

                    <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <button
                        ref={(node) => setFixaMenuBtnRef(f.id, node)}
                        onClick={() => toggleFixaMenu(f.id)}
                        style={{ ...styles.iconButton, touchAction: "manipulation" }}
                        aria-haspopup="menu"
                        aria-expanded={fixaMenuOpenId === f.id}
                        disabled={!canWrite}
                        title={!canWrite ? "Modo leitura" : "Opções"}
                        type="button"
                      >
                        ⋮
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapseSection>
        ) : null}

        {uiShowNovo ? (
          <CollapseSection
            id="novo"
            title="Novo lançamento"
            subtitle="criar rápido"
            open={uiOpenNovo}
            onToggle={() => setUiOpenNovo((v) => !v)}
          >
            <div ref={novoRef} style={{ ...styles.card, padding: 12 }}>
              <div style={styles.formRow}>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  style={{ ...styles.input, minWidth: 190 }}
                  disabled={!canWrite}
                />

                <select
                  value={tipo}
                  onChange={(e) => {
                    const t = e.target.value;
                    setTipo(t);
                    const cats = t === "despesa" ? categoriasDespesa : categoriasReceita;
                    if (!cats.includes(categoria)) setCategoria(cats[0] || "Outros");
                  }}
                  style={styles.select}
                  disabled={!canWrite}
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>

                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={styles.select} disabled={!canWrite}>
                  {(categoriasNovo || []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descrição"
                  style={{ ...styles.input, minWidth: 260 }}
                  disabled={!canWrite}
                />

                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Valor"
                  style={{ ...styles.input, minWidth: 160 }}
                  disabled={!canWrite}
                  inputMode="decimal"
                />

                <select
                  value={contaId || ""}
                  onChange={(e) => setContaId(e.target.value)}
                  style={styles.select}
                  disabled={!canWrite}
                  title="Conta (opcional)"
                >
                  <option value="">Conta (opcional)</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>

                <label style={styles.checkLabel} title="Criar como parcelado">
                  <input
                    type="checkbox"
                    checked={parcelado}
                    onChange={(e) => setParcelado(e.target.checked)}
                    disabled={!canWrite}
                  />
                  Parcelado
                </label>

                {parcelado ? (
                  <>
                    <input
                      value={qtdParcelas}
                      onChange={(e) => setQtdParcelas(Number(e.target.value || 2))}
                      style={{ ...styles.input, width: 120 }}
                      disabled={!canWrite}
                      inputMode="numeric"
                      placeholder="Qtd"
                      title="Quantidade de parcelas"
                    />

                    <select value={modoParcela} onChange={(e) => setModoParcela(e.target.value)} style={styles.select} disabled={!canWrite}>
                      <option value="dividir">Dividir total</option>
                      <option value="parcela">Valor por parcela</option>
                    </select>
                  </>
                ) : null}

                <button onClick={salvar} style={styles.primaryBtn} disabled={!canWrite} type="button">
                  ✅ Salvar (Ctrl/Cmd + Enter)
                </button>

                {!canWrite ? <span style={styles.lockInline}>🔒 Modo leitura</span> : null}
              </div>
            </div>
          </CollapseSection>
        ) : null}

        {uiShowLista ? (
          <CollapseSection
            id="lista"
            title="Lista"
            subtitle={`${listaChips.length}`}
            open={uiOpenLista}
            onToggle={() => setUiOpenLista((v) => !v)}
          >
            <div style={{ ...styles.card, padding: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  ref={buscaRef}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar (descrição, categoria, tipo, conta)"
                  style={{ ...styles.input, minWidth: 320, flex: "1 1 320px" }}
                />

                <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={styles.select} aria-label="Ordenar">
                  <option value="data">Ordenar: Data</option>
                  <option value="vencimento">Ordenar: Vencimento</option>
                  <option value="valor">Ordenar: Valor</option>
                </select>

                <button onClick={exportarCsv} style={styles.secondaryBtn} disabled={!canWrite} title={!canWrite ? "Modo leitura" : "Exportar CSV"} type="button">
                  ⬇️ Exportar CSV
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {chips.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setChip(c.key)}
                    style={{
                      ...styles.chip,
                      ...(chip === c.key ? styles.chipActive : null),
                    }}
                    type="button"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {uiShowListaFixas ? renderListaSecao("Fixas", fixasDoMes, uiOpenListaFixas, () => setUiOpenListaFixas((v) => !v), "geradas automaticamente") : null}
            {uiShowListaParcelas ? renderListaSecao("Parcelas", parcelasDoMes, uiOpenListaParcelas, () => setUiOpenListaParcelas((v) => !v), "compras parceladas") : null}
            {uiShowListaAvulsos ? renderListaSecao("Avulsos", avulsosDoMes, uiOpenListaAvulsos, () => setUiOpenListaAvulsos((v) => !v), "lançamentos únicos") : null}
          </CollapseSection>
        ) : null}

        {menuOpenId ? (
          <PortalMenu anchorEl={menuBtnRefs.current.get(menuOpenId)} onClose={() => setMenuOpenId(null)}>
            {(() => {
              const l = (lancamentos || []).find((x) => x.id === menuOpenId);
              if (!l) return null;

              const isParc = !!l.parcelado && !!l.parcela_grupo;

              return (
                <div style={styles.menuBox} role="menu">
                  <button style={menuItemStyle()} onClick={() => { setMenuOpenId(null); abrirEditar(l); }} type="button">
                    ✏️ Editar
                  </button>

                  {isParc ? (
                    <button style={menuItemStyle()} onClick={() => { setMenuOpenId(null); abrirEditarGrupo(l); }} type="button">
                      🧩 Editar grupo
                    </button>
                  ) : null}

                  <button style={menuItemStyle()} onClick={() => { setMenuOpenId(null); togglePago(l); }} type="button">
                    {l.pago ? "↩️ Marcar como pendente" : "✅ Marcar como pago"}
                  </button>

                  {isParc ? (
                    <button style={menuItemStyle({ danger: true })} onClick={() => { setMenuOpenId(null); excluirGrupo(l); }} type="button">
                      🗑️ Excluir grupo
                    </button>
                  ) : null}

                  <button style={menuItemStyle({ danger: true })} onClick={() => { setMenuOpenId(null); excluirLanc(l); }} type="button">
                    🗑️ Excluir
                  </button>
                </div>
              );
            })()}
          </PortalMenu>
        ) : null}

        {contaMenuOpenId ? (
          <PortalMenu anchorEl={contaBtnRefs.current.get(contaMenuOpenId)} onClose={() => setContaMenuOpenId(null)}>
            {(() => {
              const c = (contas || []).find((x) => x.id === contaMenuOpenId);
              if (!c) return null;

              return (
                <div style={styles.menuBox} role="menu">
                  <button style={menuItemStyle()} onClick={() => { setContaMenuOpenId(null); abrirEditarConta(c); }} type="button">
                    ✏️ Editar
                  </button>

                  <button style={menuItemStyle({ danger: true })} onClick={() => { setContaMenuOpenId(null); excluirConta(c); }} type="button">
                    🗑️ Excluir
                  </button>
                </div>
              );
            })()}
          </PortalMenu>
        ) : null}

        {fixaMenuOpenId ? (
          <PortalMenu anchorEl={fixaBtnRefs.current.get(fixaMenuOpenId)} onClose={() => setFixaMenuOpenId(null)}>
            {(() => {
              const f = (fixas || []).find((x) => x.id === fixaMenuOpenId);
              if (!f) return null;

              return (
                <div style={styles.menuBox} role="menu">
                  <button style={menuItemStyle()} onClick={() => { setFixaMenuOpenId(null); abrirEditarFixa(f); }} type="button">
                    ✏️ Editar
                  </button>

                  <button style={menuItemStyle({ danger: true })} onClick={() => { setFixaMenuOpenId(null); excluirFixa(f); }} type="button">
                    🗑️ Excluir
                  </button>
                </div>
              );
            })()}
          </PortalMenu>
        ) : null}

        {editOpen ? (
          <Modal title="Editar lançamento" onClose={fecharEditar}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={styles.modalGrid}>
                <label style={styles.label}>
                  <span style={styles.labelTxt}>Data</span>
                  <input type="date" value={editData || ""} onChange={(e) => setEditData(e.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Valor</span>
                  <input value={editValor} onChange={(e) => setEditValor(e.target.value)} style={styles.input} inputMode="decimal" />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Tipo</span>
                  <select
                    value={editTipo}
                    onChange={(e) => {
                      const t = e.target.value;
                      setEditTipo(t);
                      const cats = t === "despesa" ? categoriasDespesa : categoriasReceita;
                      if (!cats.includes(editCategoria)) setEditCategoria(cats[0] || "Outros");
                    }}
                    style={styles.select}
                  >
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Categoria</span>
                  <select value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} style={styles.select}>
                    {(categoriasEdit || []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
                  <span style={styles.labelTxt}>Descrição</span>
                  <input value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Conta</span>
                  <select value={editLancContaId || ""} onChange={(e) => setEditLancContaId(e.target.value || null)} style={styles.select}>
                    <option value="">Sem conta</option>
                    {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>

                {editIsParcelado ? (
                  <div style={{ ...styles.badgeLight, gridColumn: "1 / -1" }}>
                    Parcelado: {editParcelaNum}/{editParcelaTotal} (editar aqui altera apenas esta parcela)
                  </div>
                ) : null}
              </div>

              <div style={styles.modalFooterSticky}>
                <button onClick={fecharEditar} style={styles.secondaryBtn} type="button">Cancelar</button>
                <button onClick={salvarEdicao} style={styles.primaryBtn} disabled={!canWrite} type="button">✅ Salvar</button>
              </div>

              {!canWrite ? <div style={styles.lockNote}>🔒 Modo leitura: edição bloqueada</div> : null}
            </div>
          </Modal>
        ) : null}

        {editGroupOpen ? (
          <Modal title="Editar grupo (parcelas)" onClose={fecharEditarGrupo}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={styles.modalGrid}>
                <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
                  <span style={styles.labelTxt}>Descrição base</span>
                  <input value={grpDescricaoBase} onChange={(e) => setGrpDescricaoBase(e.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Tipo</span>
                  <select
                    value={grpTipo}
                    onChange={(e) => {
                      const t = e.target.value;
                      setGrpTipo(t);
                      const cats = t === "despesa" ? categoriasDespesa : categoriasReceita;
                      if (!cats.includes(grpCategoria)) setGrpCategoria(cats[0] || "Outros");
                    }}
                    style={styles.select}
                  >
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Categoria</span>
                  <select value={grpCategoria} onChange={(e) => setGrpCategoria(e.target.value)} style={styles.select}>
                    {(categoriasGrupo || []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Conta</span>
                  <select value={grpContaId || ""} onChange={(e) => setGrpContaId(e.target.value || null)} style={styles.select}>
                    <option value="">Sem conta</option>
                    {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Modo</span>
                  <select value={grpModo} onChange={(e) => setGrpModo(e.target.value)} style={styles.select}>
                    <option value="parcela">Valor por parcela</option>
                    <option value="dividir">Dividir total</option>
                  </select>
                </label>

                <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
                  <span style={styles.labelTxt}>{grpModo === "dividir" ? "Valor total" : "Valor por parcela"}</span>
                  <input value={grpValor} onChange={(e) => setGrpValor(e.target.value)} style={styles.input} inputMode="decimal" />
                </label>
              </div>

              <div style={styles.modalFooterSticky}>
                <button onClick={fecharEditarGrupo} style={styles.secondaryBtn} type="button">Cancelar</button>
                <button onClick={salvarEdicaoGrupo} style={styles.primaryBtn} disabled={!canWrite} type="button">✅ Salvar grupo</button>
              </div>

              {!canWrite ? <div style={styles.lockNote}>🔒 Modo leitura: edição bloqueada</div> : null}
            </div>
          </Modal>
        ) : null}

        {editContaOpen ? (
          <Modal title="Editar conta" onClose={fecharEditarConta}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={styles.modalGrid}>
                <label style={styles.label}>
                  <span style={styles.labelTxt}>Nome</span>
                  <input value={editContaNome} onChange={(e) => setEditContaNome(e.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Tipo</span>
                  <select value={editContaTipo} onChange={(e) => setEditContaTipo(e.target.value)} style={styles.select}>
                    <option value="corrente">Conta corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="cartao">Cartão</option>
                    <option value="invest">Investimentos</option>
                    <option value="outros">Outros</option>
                  </select>
                </label>

                <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
                  <span style={styles.labelTxt}>Saldo inicial</span>
                  <input value={editContaSaldo} onChange={(e) => setEditContaSaldo(e.target.value)} style={styles.input} inputMode="decimal" />
                </label>
              </div>

              <div style={styles.modalFooterSticky}>
                <button onClick={fecharEditarConta} style={styles.secondaryBtn} type="button">Cancelar</button>
                <button onClick={salvarEdicaoConta} style={styles.primaryBtn} disabled={!canWrite} type="button">✅ Salvar</button>
              </div>

              {!canWrite ? <div style={styles.lockNote}>🔒 Modo leitura: edição bloqueada</div> : null}
            </div>
          </Modal>
        ) : null}

        {editFixaOpen ? (
          <Modal title="Editar fixa" onClose={fecharEditarFixa}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={styles.modalGrid}>
                <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
                  <span style={styles.labelTxt}>Descrição</span>
                  <input value={editFixaDescricao} onChange={(e) => setEditFixaDescricao(e.target.value)} style={styles.input} />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Valor</span>
                  <input value={editFixaValor} onChange={(e) => setEditFixaValor(e.target.value)} style={styles.input} inputMode="decimal" />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Tipo</span>
                  <select value={editFixaTipo} onChange={(e) => setEditFixaTipo(e.target.value)} style={styles.select}>
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Categoria</span>
                  <select value={editFixaCategoria} onChange={(e) => setEditFixaCategoria(e.target.value)} style={styles.select}>
                    {(categoriasFixaEdit || []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Dia venc.</span>
                  <input value={editFixaDia} onChange={(e) => setEditFixaDia(e.target.value)} style={styles.input} inputMode="numeric" />
                </label>

                <label style={styles.label}>
                  <span style={styles.labelTxt}>Conta</span>
                  <select value={editFixaContaId || ""} onChange={(e) => setEditFixaContaId(e.target.value || null)} style={styles.select}>
                    <option value="">Sem conta</option>
                    {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
              </div>

              <div style={styles.modalFooterSticky}>
                <button onClick={fecharEditarFixa} style={styles.secondaryBtn} type="button">Cancelar</button>
                <button onClick={salvarEdicaoFixa} style={styles.primaryBtn} disabled={!canWrite} type="button">✅ Salvar</button>
              </div>

              {!canWrite ? <div style={styles.lockNote}>🔒 Modo leitura: edição bloqueada</div> : null}
            </div>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------
   PortalMenu (menus ⋮ mobile-safe)
---------------------------- */
function PortalMenu({ anchorEl, children, onClose }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    function calc() {
      if (!anchorEl) return setPos(null);

      const r = anchorEl.getBoundingClientRect();
      const vw = window.innerWidth || 360;
      const vh = window.innerHeight || 640;

      const desiredW = 260;
      const x = Math.min(vw - desiredW - 10, Math.max(10, r.right - desiredW));
      const y = Math.min(vh - 10, Math.max(10, r.bottom + 8));

      setPos({ x, y, w: desiredW });
    }

    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("scroll", calc, true);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("scroll", calc, true);
    };
  }, [anchorEl]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!pos) return null;

  return (
    <div
      style={{ ...styles.menuOverlay, touchAction: "manipulation" }}
      data-gfd-portalmenu="1"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{ ...styles.menuFloating, left: pos.x, top: pos.y, width: pos.w }}
        data-gfd-portalmenu="1"
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------------------
   Styles + CSS Global
---------------------------- */
const styles = {
  page: { padding: 12, color: "var(--text)" },
  container: { maxWidth: 1180, margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  collapseHeaderBtn: {
    width: "100%",
    textAlign: "left",
    border: "1px solid var(--border)",
    background: "var(--card2)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 14,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "var(--shadowSoft)",
    touchAction: "manipulation",
  },
  collapseBody: {
    overflow: "hidden",
    transition: "all .18s ease",
  },
  collapseChevron: { color: "var(--muted)", fontWeight: 1100 },
  badgeMuted: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    borderRadius: 999,
    padding: "3px 10px",
    fontWeight: 1000,
    color: "var(--muted)",
    fontSize: 12,
  },

  gridTop: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  card: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "var(--shadowSoft)",
  },
  row: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "var(--shadowSoft)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  formRow: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" },

  kpiLabel: { color: "var(--muted)", fontWeight: 1000, fontSize: 12 },
  kpiValue: { marginTop: 6, fontWeight: 1100, fontSize: 26, letterSpacing: -0.4 },
  kpiHint: { marginTop: 6, color: "var(--muted)", fontWeight: 900, fontSize: 12 },

  label: { display: "grid", gap: 6 },
  labelTxt: { fontSize: 12, fontWeight: 950, color: "var(--muted)" },

  input: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 900,
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 900,
  },
  selectCompact: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 10px",
    outline: "none",
    fontWeight: 900,
  },
  iconButtonCompact: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 10px",
    cursor: "pointer",
    fontWeight: 1000,
  },
  primaryBtn: {
    border: "1px solid var(--tabActiveBorder)",
    background: "var(--tabActiveBg)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 1000,
    touchAction: "manipulation",
  },
  secondaryBtn: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 1000,
    touchAction: "manipulation",
  },
  iconButton: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 1100,
    lineHeight: 1,
    touchAction: "manipulation",
  },

  badgeMonthYear: {
    border: "1px solid var(--border)",
    background: "var(--card2)",
    borderRadius: 999,
    padding: "4px 10px",
    fontWeight: 1000,
    color: "var(--text)",
    fontSize: 12,
  },
  badgeLight: {
    border: "1px solid var(--border)",
    background: "var(--card2)",
    borderRadius: 999,
    padding: "4px 10px",
    fontWeight: 1000,
    fontSize: 12,
    color: "var(--text)",
  },

  lockInline: { color: "var(--muted)", fontWeight: 900, fontSize: 12 },
  lockNote: {
    border: "1px solid rgba(239,68,68,.35)",
    background: "rgba(239,68,68,.08)",
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 1000,
    color: "var(--text)",
  },

  checkLabel: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    color: "var(--muted)",
    fontWeight: 1000,
    userSelect: "none",
  },

  chip: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    padding: "8px 12px",
    borderRadius: 999,
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 12,
    touchAction: "manipulation",
  },
  chipActive: {
    borderColor: "var(--tabActiveBorder)",
    background: "var(--tabActiveBg)",
  },

  pendente: { color: "rgba(245,158,11,1)", fontWeight: 1000, fontSize: 12 },
  pago: { color: "rgba(34,197,94,1)", fontWeight: 1000, fontSize: 12 },

  pillType: (tipo) => ({
    padding: "2px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: tipo === "receita" ? "rgba(34,197,94,.10)" : "rgba(239,68,68,.08)",
    color: "var(--text)",
    fontWeight: 1100,
    fontSize: 12,
  }),

  alertPill: (kind) => {
    const map = {
      danger: { bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.35)" },
      warn: { bg: "rgba(245,158,11,.10)", bd: "rgba(245,158,11,.35)" },
      info: { bg: "rgba(59,130,246,.10)", bd: "rgba(59,130,246,.35)" },
      muted: { bg: "rgba(255,255,255,.06)", bd: "rgba(255,255,255,.12)" },
    };
    const c = map[kind] || map.muted;

    return {
      border: `1px solid ${c.bd}`,
      background: c.bg,
      color: "var(--text)",
      borderRadius: 999,
      padding: "6px 10px",
      fontWeight: 1000,
      fontSize: 12,
    };
  },

  menuOverlay: {
    position: "fixed",
    inset: 0,
    background: "transparent",
    zIndex: 60,
  },
  menuFloating: {
    position: "fixed",
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "var(--card)",
    boxShadow: "0 18px 50px rgba(0,0,0,.30)",
    padding: 10,
    maxHeight: "min(60vh, 460px)",
    overflow: "auto",
    WebkitOverflowScrolling: "touch",
  },
  menuBox: { display: "grid", gap: 8 },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding:
      "max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left))",
    zIndex: 70,
  },
  modalCard: {
    width: "min(920px, 100%)",
    maxHeight: "min(90dvh, 720px)",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    boxShadow: "0 18px 40px rgba(0,0,0,.28)",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    overflow: "hidden",
  },
  modalHeaderSticky: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "12px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--card)",
  },
  modalBodyScroll: {
    padding: 12,
    overflow: "auto",
    WebkitOverflowScrolling: "touch",
    minHeight: 0,
  },
  modalGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
  },
  modalFooterSticky: {
    position: "sticky",
    bottom: 0,
    zIndex: 2,
    padding: 12,
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap",
    borderTop: "1px solid var(--border)",
    background: "var(--card)",
  },
};

function globalCss() {
  return `
/* Fallbacks pra evitar card branco se alguma variável não existir */
:root{
  --shadowSoft: 0 10px 24px rgba(0,0,0,.06);
  --danger: rgba(239,68,68,1);
  --controlBg2: rgba(255,255,255,.06);
}

@media (max-width: 720px){
  .gfd-hide-mobile { display: none !important; }
}

@media (max-width: 640px){
  [style*="grid-template-columns: repeat(2"]{
    grid-template-columns: 1fr !important;
  }
}
`;
}
