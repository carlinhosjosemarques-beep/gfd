// =========================
// RELATORIOS.JSX — PART 1/2
// =========================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

const meses = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
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

function addMonths(ano, mes, delta) {
  const dt = new Date(ano, mes, 1);
  dt.setMonth(dt.getMonth() + delta);
  return { ano: dt.getFullYear(), mes: dt.getMonth() };
}

function startEndMonth(ano, mes) {
  const start = new Date(ano, mes, 1);
  const end = new Date(ano, mes + 1, 1);
  return { start: ymd(start), end: ymd(end) };
}

function startEndYear(ano) {
  const start = new Date(ano, 0, 1);
  const end = new Date(ano + 1, 0, 1);
  return { start: ymd(start), end: ymd(end) };
}

function clampDateStr(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return ymd(d);
  } catch {
    return "";
  }
}

function daysBetween(startYmd, endYmd) {
  const a = new Date(startYmd);
  const b = new Date(endYmd);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function pctChange(atual, anterior) {
  const a = Number(atual || 0);
  const b = Number(anterior || 0);
  if (b === 0 && a === 0) return 0;
  if (b === 0) return 100;
  return ((a - b) / b) * 100;
}

// paleta
const COLORS = [
  "#2563EB","#16A34A","#F97316","#A855F7","#EF4444",
  "#14B8A6","#EAB308","#0EA5E9","#F43F5E","#22C55E",
];

const COLOR_RECEITAS = "#16A34A";
const COLOR_DESPESAS = "#EF4444";
const COLOR_SALDO = "#2563EB";

function buildCsv(rows) {
  const headers = ["data","tipo","categoria","descricao","valor","pago","conta"];
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(","))
  ];
  return lines.join("\n");
}

function badgeDelta(pct) {
  const n = Number(pct || 0);
  const up = n > 0;
  const down = n < 0;

  const bg = up
    ? "rgba(34,197,94,0.14)"
    : down
      ? "rgba(239,68,68,0.14)"
      : "rgba(148,163,184,0.14)";

  const fg = up ? "#16A34A" : down ? "#EF4444" : "var(--muted)";
  const arrow = up ? "▲" : down ? "▼" : "●";
  const txt = `${arrow} ${up ? "+" : ""}${n.toFixed(0)}%`;

  return (
    <span style={{
      background: bg,
      color: fg,
      padding: "3px 9px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 950,
      border: "1px solid var(--border)",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      letterSpacing: -0.1,
    }}>
      {txt}
    </span>
  );
}

function periodLabel(mode, ano, mes, range) {
  if (mode === "mensal") return `${meses[mes]} / ${ano}`;
  if (mode === "3m") return `Últimos 3 meses (até ${meses[mes]} / ${ano})`;
  if (mode === "6m") return `Últimos 6 meses (até ${meses[mes]} / ${ano})`;
  if (mode === "anual") return `Ano ${ano}`;
  if (mode === "custom") return `Período ${range.start} → ${range.end}`;
  return "Período";
}

function groupSmallCategoriesIntoOthers(data, maxItems = 7, othersLabel = "Outros") {
  const arr = [...(data || [])].filter(x => (Number(x.value) || 0) > 0);
  if (arr.length <= maxItems) return arr;

  const top = arr.slice(0, maxItems - 1);
  const rest = arr.slice(maxItems - 1);

  const othersValue = rest.reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (othersValue <= 0) return top;

  return [...top, { name: othersLabel, value: Math.round(othersValue * 100) / 100 }];
}

function CollapseSection({ title, subtitle, open, onToggle, children, rightSlot }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        ...styles.cardPad,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}>
        <button
          onClick={onToggle}
          style={styles.sectionHeaderBtn}
          aria-expanded={open}
          title={open ? "Recolher" : "Expandir"}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 950 }}>{title}</span>
          {subtitle ? <span style={styles.sectionSubtitle}>• {subtitle}</span> : null}
        </button>

        {rightSlot ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {rightSlot}
          </div>
        ) : null}
      </div>

      {open ? (
        <div style={{ marginTop: 12 }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * ✅ Relatórios integrado ao tema global do App.jsx
 * - Usa vars: --bg, --card, --text, --muted, --border, --shadowSoft, --controlBg, --controlBg2, --warn
 */
export default function Relatorios() {
  const hoje = new Date();

  /* ================= AUTH ================= */
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      setAuthReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ================= PERÍODO (MODO) ================= */
  const [periodMode, setPeriodMode] = useState("mensal"); // mensal | 3m | 6m | anual | custom
  const [anoRef, setAnoRef] = useState(hoje.getFullYear());
  const [mesRef, setMesRef] = useState(hoje.getMonth());

  // custom (fim exclusivo)
  const [dataInicio, setDataInicio] = useState(() => ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [dataFim, setDataFim] = useState(() => ymd(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)));

  const rangeAtual = useMemo(() => {
    if (periodMode === "mensal") return startEndMonth(anoRef, mesRef);

    if (periodMode === "3m") {
      const startRef = addMonths(anoRef, mesRef, -2);
      const start = new Date(startRef.ano, startRef.mes, 1);
      const end = new Date(anoRef, mesRef + 1, 1);
      return { start: ymd(start), end: ymd(end) };
    }

    if (periodMode === "6m") {
      const startRef = addMonths(anoRef, mesRef, -5);
      const start = new Date(startRef.ano, startRef.mes, 1);
      const end = new Date(anoRef, mesRef + 1, 1);
      return { start: ymd(start), end: ymd(end) };
    }

    if (periodMode === "anual") {
      return startEndYear(anoRef);
    }

    const s = clampDateStr(dataInicio);
    const e = clampDateStr(dataFim);
    return { start: s || ymd(new Date(anoRef, mesRef, 1)), end: e || ymd(new Date(anoRef, mesRef + 1, 1)) };
  }, [periodMode, anoRef, mesRef, dataInicio, dataFim]);

  const rangePrev = useMemo(() => {
    if (periodMode === "mensal") {
      const prev = addMonths(anoRef, mesRef, -1);
      return startEndMonth(prev.ano, prev.mes);
    }

    if (periodMode === "anual") {
      return startEndYear(anoRef - 1);
    }

    const dur = daysBetween(rangeAtual.start, rangeAtual.end);
    const endPrevDate = new Date(rangeAtual.start);
    const startPrevDate = new Date(rangeAtual.start);
    startPrevDate.setDate(startPrevDate.getDate() - dur);

    return { start: ymd(startPrevDate), end: ymd(endPrevDate) };
  }, [periodMode, anoRef, mesRef, rangeAtual.start, rangeAtual.end]);

  const tituloPeriodo = useMemo(
    () => periodLabel(periodMode, anoRef, mesRef, rangeAtual),
    [periodMode, anoRef, mesRef, rangeAtual]
  );

  const subPeriodo = useMemo(() => {
    const p = periodLabel(periodMode, (() => {
      if (periodMode === "mensal") {
        const prev = addMonths(anoRef, mesRef, -1);
        return prev.ano;
      }
      if (periodMode === "anual") return anoRef - 1;
      return anoRef;
    })(), (() => {
      if (periodMode === "mensal") {
        const prev = addMonths(anoRef, mesRef, -1);
        return prev.mes;
      }
      return mesRef;
    })(), rangePrev);

    return p;
  }, [periodMode, anoRef, mesRef, rangePrev]);

  /* ================= FILTROS ================= */
  const [tipoFiltro, setTipoFiltro] = useState("todos"); // todos | receita | despesa
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas"); // todas | nome
  const [contaFiltro, setContaFiltro] = useState("todas"); // todas | sem | uuid
  const [incluirPendentes, setIncluirPendentes] = useState(true);

  // ✅ Toggle separado: comparar com período anterior
  const [compararAnterior, setCompararAnterior] = useState(true);

  /* ================= UI (recolher seções) ================= */
  const [uiShowLancamentos, setUiShowLancamentos] = useState(true);

  /* ================= DADOS ================= */
  const [loading, setLoading] = useState(false);
  const [lancamentos, setLancamentos] = useState([]);
  const [contas, setContas] = useState([]);

  async function carregarContas() {
    if (!user) return;
    const { data, error } = await supabase
      .from("contas")
      .select("id,nome,tipo,ativo,criado_em")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("criado_em", { ascending: true });

    if (error) {
      console.error("Erro carregar contas:", error);
      setContas([]);
      return;
    }
    setContas(data || []);
  }

  async function carregarLancamentosDoRange(range) {
    if (!user) return [];

    let q = supabase
      .from("lancamentos")
      .select("*")
      .eq("user_id", user.id)
      .gte("data", range.start)
      .lt("data", range.end);

    if (contaFiltro !== "todas" && contaFiltro !== "sem") q = q.eq("conta_id", contaFiltro);
    if (tipoFiltro !== "todos") q = q.eq("tipo", tipoFiltro);
    if (categoriaFiltro !== "todas") q = q.eq("categoria", categoriaFiltro);
    if (!incluirPendentes) q = q.eq("pago", true);

    const { data, error } = await q.order("data", { ascending: true });

    if (error) {
      console.error("Erro carregar lançamentos:", error);
      return [];
    }

    const list = (data || []);
    if (contaFiltro === "sem") return list.filter(l => !l.conta_id);
    return list;
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await carregarContas();
      const atual = await carregarLancamentosDoRange(rangeAtual);
      setLancamentos(atual);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, rangeAtual.start, rangeAtual.end, tipoFiltro, categoriaFiltro, contaFiltro, incluirPendentes]);

  /* ================= LISTAS AUX ================= */
  const categoriasDisponiveis = useMemo(() => {
    const set = new Set();
    (lancamentos || []).forEach(l => set.add(l.categoria || "Outros"));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [lancamentos]);

  const contaNome = (id) => {
    if (!id) return "(Sem conta)";
    return contas.find(c => c.id === id)?.nome || "Conta";
  };

  /* ================= TOTAIS ================= */
  const totais = useMemo(() => {
    let receitas = 0, despesas = 0;
    let receitasPend = 0, despesasPend = 0;

    for (const l of lancamentos || []) {
      const v = Number(l.valor) || 0;
      if (l.tipo === "receita") {
        if (l.pago) receitas += v;
        else receitasPend += v;
      } else if (l.tipo === "despesa") {
        if (l.pago) despesas += v;
        else despesasPend += v;
      }
    }

    const receitasTotal = receitas + (incluirPendentes ? receitasPend : 0);
    const despesasTotal = despesas + (incluirPendentes ? despesasPend : 0);

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
      receitasPend,
      despesasPend,
      receitasTotal,
      despesasTotal,
      saldoTotal: receitasTotal - despesasTotal,
    };
  }, [lancamentos, incluirPendentes]);

  /* ================= COMPARATIVO PERÍODO ANTERIOR ================= */
  const [prevResumo, setPrevResumo] = useState({ receitas: 0, despesas: 0, saldo: 0 });

  useEffect(() => {
    if (!user) return;

    // ✅ Se desligar comparação, zera e não carrega
    if (!compararAnterior) {
      setPrevResumo({ receitas: 0, despesas: 0, saldo: 0 });
      return;
    }

    (async () => {
      const prev = await carregarLancamentosDoRange(rangePrev);

      let r = 0, d = 0;
      for (const l of prev || []) {
        const v = Number(l.valor) || 0;
        if (l.tipo === "receita") r += (l.pago ? v : 0);
        if (l.tipo === "despesa") d += (l.pago ? v : 0);
      }
      setPrevResumo({ receitas: r, despesas: d, saldo: r - d });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, compararAnterior, rangePrev.start, rangePrev.end, tipoFiltro, categoriaFiltro, contaFiltro, incluirPendentes]);

  const cmpReceitas = useMemo(() => pctChange(totais.receitas, prevResumo.receitas), [totais.receitas, prevResumo.receitas]);
  const cmpDespesas = useMemo(() => pctChange(totais.despesas, prevResumo.despesas), [totais.despesas, prevResumo.despesas]);
  const cmpSaldo = useMemo(() => pctChange(totais.saldo, prevResumo.saldo), [totais.saldo, prevResumo.saldo]);

  /* ================= GRÁFICOS ================= */
  const despesasPorCategoria = useMemo(() => {
    const map = new Map();
    for (const l of lancamentos || []) {
      if (l.tipo !== "despesa") continue;
      if (!incluirPendentes && !l.pago) continue;
      const cat = l.categoria || "Outros";
      const v = Number(l.valor) || 0;
      map.set(cat, (map.get(cat) || 0) + v);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [lancamentos, incluirPendentes]);

  const receitasPorCategoria = useMemo(() => {
    const map = new Map();
    for (const l of lancamentos || []) {
      if (l.tipo !== "receita") continue;
      if (!incluirPendentes && !l.pago) continue;
      const cat = l.categoria || "Outros";
      const v = Number(l.valor) || 0;
      map.set(cat, (map.get(cat) || 0) + v);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  }, [lancamentos, incluirPendentes]);

  // ✅ Top categorias com “Outros” (limpa quando tem muitas categorias)
  const topCategorias = useMemo(() => {
    // top 6 + “Outros” (total 7)
    return groupSmallCategoriesIntoOthers(despesasPorCategoria, 7, "Outros");
  }, [despesasPorCategoria]);

  const totalDespesasCategorias = useMemo(
    () => despesasPorCategoria.reduce((s, x) => s + (Number(x.value) || 0), 0),
    [despesasPorCategoria]
  );

  const totalReceitasCategorias = useMemo(
    () => receitasPorCategoria.reduce((s, x) => s + (Number(x.value) || 0), 0),
    [receitasPorCategoria]
  );

  const diasPeriodo = useMemo(
    () => daysBetween(rangeAtual.start, rangeAtual.end),
    [rangeAtual.start, rangeAtual.end]
  );

  // ✅ Empilhar por mês quando período for 3/6/anual ou custom grande
  const granularity = useMemo(() => {
    if (periodMode === "3m" || periodMode === "6m" || periodMode === "anual") return "month";
    if (periodMode === "custom") return diasPeriodo > 62 ? "month" : "day";
    return "day";
  }, [periodMode, diasPeriodo]);

  const porDia = useMemo(() => {
    if (granularity !== "day") return [];

    const map = new Map();
    for (const l of lancamentos || []) {
      if (!incluirPendentes && !l.pago) continue;
      const dia = l.data;
      if (!map.has(dia)) map.set(dia, { key: dia, receitas: 0, despesas: 0 });
      const obj = map.get(dia);
      const v = Number(l.valor) || 0;
      if (l.tipo === "receita") obj.receitas += v;
      if (l.tipo === "despesa") obj.despesas += v;
    }

    return Array.from(map.values())
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map(x => ({
        ...x,
        label: new Date(x.key).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        receitas: Math.round(x.receitas * 100) / 100,
        despesas: Math.round(x.despesas * 100) / 100,
      }));
  }, [lancamentos, incluirPendentes, granularity]);

  const porMes = useMemo(() => {
    if (granularity !== "month") return [];

    const map = new Map(); // YYYY-MM -> {receitas, despesas}
    for (const l of lancamentos || []) {
      if (!incluirPendentes && !l.pago) continue;
      const d = new Date(l.data);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, { key, receitas: 0, despesas: 0 });
      const obj = map.get(key);
      const v = Number(l.valor) || 0;
      if (l.tipo === "receita") obj.receitas += v;
      if (l.tipo === "despesa") obj.despesas += v;
    }

    return Array.from(map.values())
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map(x => {
        const [yy, mm] = x.key.split("-").map(Number);
        return {
          ...x,
          label: `${meses[(mm - 1)]?.slice(0, 3)} ${yy}`,
          receitas: Math.round(x.receitas * 100) / 100,
          despesas: Math.round(x.despesas * 100) / 100,
        };
      });
  }, [lancamentos, incluirPendentes, granularity]);

  const serieMov = useMemo(() => (granularity === "day" ? porDia : porMes), [granularity, porDia, porMes]);

  const saldoAcumulado = useMemo(() => {
    let acc = 0;
    return (serieMov || []).map(x => {
      acc += (Number(x.receitas) || 0) - (Number(x.despesas) || 0);
      return { label: x.label, saldo: Math.round(acc * 100) / 100 };
    });
  }, [serieMov]);

  // Melhor/pior dia (apenas quando for dia)
  const bestWorstDay = useMemo(() => {
    if (granularity !== "day") return { best: null, worst: null };

    let best = null;
    let worst = null;

    for (const x of porDia || []) {
      const saldoDia = (Number(x.receitas) || 0) - (Number(x.despesas) || 0);
      const item = { ...x, saldoDia: Math.round(saldoDia * 100) / 100 };
      if (!best || item.saldoDia > best.saldoDia) best = item;
      if (!worst || item.saldoDia < worst.saldoDia) worst = item;
    }
    return { best, worst };
  }, [porDia, granularity]);

  /* ================= INSIGHTS ================= */
  const insight = useMemo(() => {
    const rec = totais.receitasTotal;
    const desp = totais.despesasTotal;
    const saldo = rec - desp;

    const topCat = (despesasPorCategoria?.[0]?.name) || null;
    const topCatVal = (despesasPorCategoria?.[0]?.value) || 0;

    const taxa = rec > 0 ? (saldo / rec) : 0;

    let msg = "";
    if ((lancamentos || []).length === 0) {
      msg = "Sem dados no período atual. Ajuste período ou filtros.";
    } else if (saldo < 0) {
      msg = `Seu saldo no período está negativo. A maior pressão veio de ${topCat ? `"${topCat}"` : "despesas"} (${money(topCatVal)}).`;
    } else if (saldo === 0) {
      msg = `Você fechou o período no zero a zero.`;
    } else {
      msg = `Saldo positivo no período. Você reteve ${(taxa * 100).toFixed(0)}% das receitas.`;
      if (topCat) msg += ` Principal gasto: "${topCat}" (${money(topCatVal)}).`;
    }

    return {
      msg,
      taxa,
      topCat,
      topCatVal,
    };
  }, [lancamentos, totais.receitasTotal, totais.despesasTotal, despesasPorCategoria]);

  /* ================= EXPORTAR CSV ================= */
  function exportarCsv() {
    const rows = (lancamentos || []).map(l => ({
      data: l.data,
      tipo: l.tipo,
      categoria: l.categoria,
      descricao: l.descricao,
      valor: money(l.valor).replace(/\s/g, " "),
      pago: l.pago ? "Sim" : "Não",
      conta: contaNome(l.conta_id),
    }));

    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const nomeArquivo = `gfd_relatorio_${periodMode}_${rangeAtual.start}_a_${rangeAtual.end}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ================= TOOLTIPS CUSTOM ================= */
  function TooltipCategoria({ active, payload, label, totalGeral, prefix }) {
    if (!active || !payload || payload.length === 0) return null;
    const item = payload[0];
    const nome = label || item?.payload?.name || "Categoria";
    const valor = item?.value ?? 0;

    return (
      <div style={styles.tooltip}>
        <div style={{ fontWeight: 950, marginBottom: 6 }}>{nome}</div>
        <div style={styles.ttRow}>
          <span style={{ opacity: 0.8 }}>{prefix}</span>
          <b>{money(valor)}</b>
        </div>
        <div style={styles.hr} />
        <div style={styles.ttRow}>
          <span style={{ opacity: 0.8 }}>Total (filtro)</span>
          <b>{money(totalGeral)}</b>
        </div>
      </div>
    );
  }

  function TooltipMov({ active, payload, label, totalReceitas, totalDespesas }) {
    if (!active || !payload || payload.length === 0) return null;
    const rec = payload.find(p => p.dataKey === "receitas")?.value ?? 0;
    const desp = payload.find(p => p.dataKey === "despesas")?.value ?? 0;

    return (
      <div style={styles.tooltip}>
        <div style={{ fontWeight: 950, marginBottom: 6 }}>{label}</div>

        <div style={styles.ttRow}>
          <span style={{ color: COLOR_RECEITAS, fontWeight: 900 }}>Receitas</span>
          <b>{money(rec)}</b>
        </div>

        <div style={styles.ttRow}>
          <span style={{ color: COLOR_DESPESAS, fontWeight: 900 }}>Despesas</span>
          <b>{money(desp)}</b>
        </div>

        <div style={styles.hr} />

        <div style={styles.ttRow}>
          <span style={{ opacity: 0.8 }}>Total receitas</span>
          <b>{money(totalReceitas)}</b>
        </div>

        <div style={styles.ttRow}>
          <span style={{ opacity: 0.8 }}>Total despesas</span>
          <b>{money(totalDespesas)}</b>
        </div>
      </div>
    );
  }

  /* ================= UI ================= */
  if (!authReady) return <p style={{ padding: 18, color: "var(--muted)", fontWeight: 900 }}>Carregando…</p>;
  if (!user) return <p style={{ padding: 18, color: "var(--muted)", fontWeight: 900 }}>Faça login novamente.</p>;

  const presets = [
    { key: "todos", label: "Tudo", apply: () => setTipoFiltro("todos") },
    { key: "receita", label: "Só receitas", apply: () => setTipoFiltro("receita") },
    { key: "despesa", label: "Só despesas", apply: () => setTipoFiltro("despesa") },
    { key: "pagos", label: "Só pagos", apply: () => setIncluirPendentes(false) },
    { key: "pend", label: "Incluir pendentes", apply: () => setIncluirPendentes(true) },
  ];

  function limparFiltros() {
    setTipoFiltro("todos");
    setCategoriaFiltro("todas");
    setContaFiltro("todas");
    setIncluirPendentes(true);
  }

  const saldoDoi = totais.saldoTotal < 0;

  return (
    <div style={styles.page}>
      <div style={styles.frame}>
        <div style={styles.header}>
          <div style={{ minWidth: 260 }}>
            <h2 style={{ margin: 0, letterSpacing: -0.3 }}>Relatórios — GFD</h2>
            <p style={{ marginTop: 6, color: "var(--muted)" }}>
              <b>{tituloPeriodo}</b>{" "}
              {compararAnterior ? (
                <span style={{ marginLeft: 8, opacity: 0.75 }}>
                  (vs {subPeriodo})
                </span>
              ) : null}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={exportarCsv} style={styles.btn}>
              ⬇ Exportar CSV
            </button>
          </div>
        </div>

        {/* ====== FILTROS / PERÍODO ====== */}
        <div style={styles.filters}>
          {labelSelect("Período", (
            <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value)} style={styles.select}>
              <option value="mensal">Mensal</option>
              <option value="3m">Últimos 3 meses</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="anual">Anual</option>
              <option value="custom">Personalizado</option>
            </select>
          ))}

          {periodMode !== "custom" ? (
            <>
              {labelSelect(periodMode === "anual" ? "Ano" : "Mês final", (
                <select value={mesRef} onChange={(e) => setMesRef(Number(e.target.value))} style={styles.select} disabled={periodMode === "anual"}>
                  {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              ))}

              {labelSelect("Ano", (
                <select value={anoRef} onChange={(e) => setAnoRef(Number(e.target.value))} style={styles.select}>
                  {[2023, 2024, 2025, 2026, 2027, 2028].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              ))}
            </>
          ) : (
            <>
              {labelSelect("Início (YYYY-MM-DD)", (
                <input
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  placeholder="2026-01-01"
                  style={styles.input}
                />
              ))}

              {labelSelect("Fim exclusivo (YYYY-MM-DD)", (
                <input
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  placeholder="2026-02-01"
                  style={styles.input}
                />
              ))}
            </>
          )}

          {labelSelect("Conta", (
            <select value={contaFiltro} onChange={(e) => setContaFiltro(e.target.value)} style={styles.select}>
              <option value="todas">Todas</option>
              <option value="sem">Sem conta</option>
              {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          ))}

          {labelSelect("Tipo", (
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} style={styles.select}>
              <option value="todos">Todos</option>
              <option value="receita">Receitas</option>
              <option value="despesa">Despesas</option>
            </select>
          ))}

          {labelSelect("Categoria", (
            <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} style={styles.select}>
              <option value="todas">Todas</option>
              {categoriasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ))}

          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={incluirPendentes}
              onChange={(e) => setIncluirPendentes(e.target.checked)}
            />
            Incluir pendentes
          </label>

          {/* ✅ Toggle comparar */}
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={compararAnterior}
              onChange={(e) => setCompararAnterior(e.target.checked)}
            />
            Comparar com período anterior
          </label>

          <button onClick={limparFiltros} style={styles.secondaryBtn} title="Limpar filtros">
            🧹 Limpar
          </button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {presets.map(p => (
              <button
                key={p.key}
                onClick={p.apply}
                style={styles.presetBtn}
                title="Preset rápido"
              >
                {p.label}
              </button>
            ))}
          </div>

          <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>
            Período: <b>{rangeAtual.start}</b> → <b>{rangeAtual.end}</b>
            {granularity === "month" ? " • (agregado por mês)" : ""}
          </span>
        </div>

        {loading && (
          <p style={{ marginTop: 10, color: "var(--muted)", fontWeight: 900 }}>Carregando dados…</p>
        )}

        {/* ====== CARDS ====== */}
        <div style={styles.cards}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Receitas (pagas)</div>
            <div style={styles.cardValue}>{money(totais.receitas)}</div>
            {compararAnterior ? (
              <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {badgeDelta(cmpReceitas)}
                <span style={styles.cardMini}>vs período anterior</span>
              </div>
            ) : null}
            {incluirPendentes && totais.receitasPend > 0 && (
              <div style={styles.cardHint}>Pendentes: {money(totais.receitasPend)}</div>
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.cardLabel}>Despesas (pagas)</div>
            <div style={styles.cardValue}>{money(totais.despesas)}</div>
            {compararAnterior ? (
              <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {badgeDelta(cmpDespesas)}
                <span style={styles.cardMini}>vs período anterior</span>
              </div>
            ) : null}
            {incluirPendentes && totais.despesasPend > 0 && (
              <div style={styles.cardHint}>Pendentes: {money(totais.despesasPend)}</div>
            )}
          </div>

          <div style={{ ...styles.card, borderColor: saldoDoi ? "rgba(239,68,68,.35)" : "var(--border)", background: saldoDoi ? "rgba(239,68,68,.06)" : "var(--card)" }}>
            <div style={styles.cardLabel}>Saldo (considerando filtros)</div>
            <div style={{ ...styles.cardValue, color: saldoDoi ? "#EF4444" : "var(--text)" }}>
              {money(totais.saldoTotal)}
            </div>
            {compararAnterior ? (
              <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {badgeDelta(cmpSaldo)}
                <span style={styles.cardMini}>vs período anterior</span>
              </div>
            ) : null}
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, color: saldoDoi ? "#EF4444" : "var(--muted)" }}>
              {saldoDoi ? "⚠️ Atenção: você gastou mais do que recebeu no período." : "✅ Bom: saldo positivo no período."}
            </div>
          </div>
        </div>

        {/* ====== INSIGHT ====== */}
        <div style={{ ...styles.cardPad, marginTop: 12 }}>
          <div style={styles.sectionTitle}>Insight automático</div>
          <div style={{ color: "var(--muted)", fontWeight: 900, lineHeight: 1.5 }}>
            {insight.msg}
          </div>
        </div>

        {/* ====== GRADE GRÁFICOS ====== */}
        <div style={styles.grid}>
          <div style={styles.cardPad}>
            <div style={styles.sectionTitle}>
              Gastos por categoria{" "}
              <span style={styles.sectionMuted}>• Total: {money(totalDespesasCategorias)}</span>
            </div>

            {despesasPorCategoria.length === 0 ? (
              <EmptyState onClear={limparFiltros} />
            ) : (
              <div style={{ height: 320 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={despesasPorCategoria}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                    >
                      {despesasPorCategoria.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <TooltipCategoria
                          active={active}
                          payload={payload}
                          label={label}
                          totalGeral={totalDespesasCategorias}
                          prefix="Gasto (categoria)"
                        />
                      )}
                    />
                    <Legend wrapperStyle={{ color: "var(--text)", fontWeight: 800 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div style={styles.cardPad}>
            <div style={styles.sectionTitle}>
              Recebido por categoria{" "}
              <span style={styles.sectionMuted}>• Total: {money(totalReceitasCategorias)}</span>
            </div>

            {receitasPorCategoria.length === 0 ? (
              <EmptyState onClear={limparFiltros} />
            ) : (
              <div style={{ height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={receitasPorCategoria}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      height={60}
                      stroke="rgba(148,163,184,0.75)"
                    />
                    <YAxis tickFormatter={(v) => money(v)} stroke="rgba(148,163,184,0.75)" />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <TooltipCategoria
                          active={active}
                          payload={payload}
                          label={label}
                          totalGeral={totalReceitasCategorias}
                          prefix="Recebido (categoria)"
                        />
                      )}
                    />
                    <Bar dataKey="value" name="Receitas" fill={COLOR_RECEITAS} radius={[10,10,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div style={styles.cardPad}>
            <div style={styles.sectionTitle}>
              Top categorias (despesas){" "}
              <span style={styles.sectionMuted}>• Total: {money(totalDespesasCategorias)}</span>
            </div>

            {topCategorias.length === 0 ? (
              <EmptyState onClear={limparFiltros} />
            ) : (
              <div style={{ height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={topCategorias} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis type="number" tickFormatter={(v) => money(v)} stroke="rgba(148,163,184,0.75)" />
                    <YAxis type="category" dataKey="name" width={120} stroke="rgba(148,163,184,0.75)" />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <TooltipCategoria
                          active={active}
                          payload={payload}
                          label={label}
                          totalGeral={totalDespesasCategorias}
                          prefix="Gasto (categoria)"
                        />
                      )}
                    />
                    <Bar dataKey="value" name="Despesas" radius={[0,10,10,0]}>
                      {topCategorias.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div style={{ marginTop: 10, color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                  Dica: categorias menores são agrupadas em <b>“Outros”</b> para manter o gráfico limpo.
                </div>
              </div>
            )}
          </div>

          <div style={{ ...styles.cardPad, gridColumn: "1 / -1" }}>
            <div style={styles.sectionTitle}>
              Receitas x Despesas {granularity === "month" ? "por mês" : "por dia"}{" "}
              <span style={styles.sectionMuted}>
                • Total receitas: {money(totais.receitasTotal)} • Total despesas: {money(totais.despesasTotal)}
              </span>
            </div>

            {serieMov.length === 0 ? (
              <EmptyState onClear={limparFiltros} />
            ) : (
              <div style={{ height: 340 }}>
                <ResponsiveContainer>
                  <BarChart data={serieMov}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis dataKey="label" stroke="rgba(148,163,184,0.75)" />
                    <YAxis tickFormatter={(v) => money(v)} stroke="rgba(148,163,184,0.75)" />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <TooltipMov
                          active={active}
                          payload={payload}
                          label={label}
                          totalReceitas={totais.receitasTotal}
                          totalDespesas={totais.despesasTotal}
                        />
                      )}
                    />
                    <Legend wrapperStyle={{ color: "var(--text)", fontWeight: 800 }} />
                    <Bar dataKey="receitas" name="Receitas" fill={COLOR_RECEITAS} radius={[10,10,0,0]} />
                    <Bar dataKey="despesas" name="Despesas" fill={COLOR_DESPESAS} radius={[10,10,0,0]} />

                    {/* Marcações Melhor/Pior dia (somente quando for por dia) */}
                    {granularity === "day" && bestWorstDay?.best ? (
                      <ReferenceLine
                        x={bestWorstDay.best.label}
                        stroke="rgba(34,197,94,0.6)"
                        strokeDasharray="4 4"
                      />
                    ) : null}

                    {granularity === "day" && bestWorstDay?.worst ? (
                      <ReferenceLine
                        x={bestWorstDay.worst.label}
                        stroke="rgba(239,68,68,0.6)"
                        strokeDasharray="4 4"
                      />
                    ) : null}
                  </BarChart>
                </ResponsiveContainer>

                {granularity === "day" && (bestWorstDay.best || bestWorstDay.worst) ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {bestWorstDay.best ? (
                      <div style={styles.miniInfoOk}>
                        ✅ Melhor dia: <b>{bestWorstDay.best.label}</b> • saldo do dia: <b>{money(bestWorstDay.best.saldoDia)}</b>
                      </div>
                    ) : null}
                    {bestWorstDay.worst ? (
                      <div style={styles.miniInfoBad}>
                        ⚠️ Pior dia: <b>{bestWorstDay.worst.label}</b> • saldo do dia: <b>{money(bestWorstDay.worst.saldoDia)}</b>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ ...styles.cardPad, gridColumn: "1 / -1" }}>
            <div style={styles.sectionTitle}>
              Saldo acumulado{" "}
              <span style={styles.sectionMuted}>
                • Saldo final: {money((saldoAcumulado?.[saldoAcumulado.length - 1]?.saldo) || 0)}
              </span>
            </div>

            {saldoAcumulado.length === 0 ? (
              <EmptyState onClear={limparFiltros} />
            ) : (
              <div style={{ height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={saldoAcumulado}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                    <XAxis dataKey="label" stroke="rgba(148,163,184,0.75)" />
                    <YAxis tickFormatter={(v) => money(v)} stroke="rgba(148,163,184,0.75)" />
                    <Tooltip contentStyle={styles.tooltip} formatter={(v) => money(v)} />

                    <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />

                    <Line
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo"
                      stroke={COLOR_SALDO}
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* ====== LANÇAMENTOS (RECOLHÍVEL) ====== */}
        <CollapseSection
          title="Lançamentos (agrupados por dia)"
          subtitle={`${(lancamentos || []).length} item(ns) no período`}
          open={uiShowLancamentos}
          onToggle={() => setUiShowLancamentos(v => !v)}
          rightSlot={
            <>
              <button onClick={() => setUiShowLancamentos(true)} style={styles.secondaryBtn} title="Expandir lista">
                ↩ Expandir
              </button>
              <button onClick={() => setUiShowLancamentos(false)} style={styles.secondaryBtn} title="Recolher lista">
                ▾ Recolher
              </button>
            </>
          }
        >
          {(lancamentos || []).length === 0 ? (
            <EmptyState onClear={limparFiltros} />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {groupByDay(lancamentos).slice(0, 10).map(group => (
                <div key={group.dia} style={{ ...styles.dayGroup }}>
                  <div style={styles.dayHeader}>
                    <div style={{ fontWeight: 950 }}>
                      {new Date(group.dia).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: "var(--muted)", fontWeight: 900 }}>
                      <span>Receitas: <b style={{ color: COLOR_RECEITAS }}>{money(group.receitas)}</b></span>
                      <span>Despesas: <b style={{ color: COLOR_DESPESAS }}>{money(group.despesas)}</b></span>
                      <span>Saldo: <b style={{ color: (group.receitas - group.despesas) < 0 ? COLOR_DESPESAS : "var(--text)" }}>{money(group.receitas - group.despesas)}</b></span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {group.items.slice(0, 12).map(l => (
                      <div
                        key={l.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          borderBottom: "1px solid var(--border)",
                          paddingBottom: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ minWidth: 260 }}>
                          <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{
                              ...styles.pill,
                              background: l.tipo === "receita" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                              color: l.tipo === "receita" ? COLOR_RECEITAS : COLOR_DESPESAS,
                            }}>
                              {l.tipo === "receita" ? "⬆ Receita" : "⬇ Despesa"}
                            </span>

                            {!l.pago && (
                              <span style={{ color: "var(--warn)", fontWeight: 950 }}>
                                (pendente)
                              </span>
                            )}
                          </div>

                          <div style={{ color: "var(--muted)", marginTop: 4, fontWeight: 850 }}>
                            {l.descricao || "(sem descrição)"} • {l.categoria || "Outros"} • {contaNome(l.conta_id)}
                          </div>
                        </div>

                        <div style={{ fontWeight: 950, fontSize: 16 }}>
                          {money(l.valor)}
                        </div>
                      </div>
                    ))}

                    {group.items.length > 12 ? (
                      <div style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                        + {group.items.length - 12} item(ns) nesse dia (filtrados)
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              <div style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                Mostrando até 10 dias (mais recentes no topo). CSV exporta tudo do período.
              </div>
            </div>
          )}
        </CollapseSection>

      </div>
    </div>
  );
}

/* ===== Helpers UI ===== */
function EmptyState({ onClear }) {
  return (
    <div style={{
      border: "1px dashed var(--border)",
      borderRadius: 16,
      padding: 14,
      background: "rgba(148,163,184,0.06)",
    }}>
      <div style={{ fontWeight: 950 }}>Sem resultados para o período/filtro atual.</div>
      <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
        Dica: tente incluir pendentes, mudar o período ou limpar filtros.
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={onClear} style={styles.secondaryBtn}>🧹 Limpar filtros</button>
      </div>
    </div>
  );
}

function groupByDay(list) {
  const map = new Map();
  for (const l of [...(list || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)))) {
    const dia = l.data;
    if (!map.has(dia)) map.set(dia, { dia, items: [], receitas: 0, despesas: 0 });
    const g = map.get(dia);
    g.items.push(l);
    const v = Number(l.valor) || 0;
    if (l.tipo === "receita") g.receitas += v;
    if (l.tipo === "despesa") g.despesas += v;
  }
  return Array.from(map.values());
}

/* ===== Styles ===== */
const styles = {
  page: {
    width: "100%",
    overflow: "visible",
  },

  frame: {
    width: "100%",
    boxSizing: "border-box",
    margin: "0 10px",
    padding: 16,
    overflow: "visible",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 10,
  },

  filters: {
    marginTop: 10,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 16,
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },

  select: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 10px",
    outline: "none",
    minWidth: 160,
  },

  input: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 10px",
    outline: "none",
    minWidth: 180,
  },

  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginLeft: 6,
    color: "var(--text)",
    fontWeight: 900,
    fontSize: 13,
  },

  btn: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--controlBg2)",
    color: "var(--text)",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
  },

  secondaryBtn: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--controlBg)",
    color: "var(--text)",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 950,
  },

  presetBtn: {
    border: "1px solid var(--border)",
    borderRadius: 999,
    background: "rgba(148,163,184,0.10)",
    color: "var(--text)",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 950,
    fontSize: 12,
  },

  cards: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12
  },

  card: {
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 14,
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },

  cardPad: {
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 14,
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    overflow: "hidden",
  },

  cardLabel: {
    color: "var(--muted)",
    fontWeight: 900,
    fontSize: 13,
  },

  cardValue: {
    fontSize: 22,
    fontWeight: 950,
    letterSpacing: -0.2,
    marginTop: 6,
  },

  cardHint: {
    marginTop: 10,
    fontSize: 13,
    color: "var(--muted)",
    fontWeight: 800,
  },

  cardMini: {
    color: "var(--muted)",
    fontWeight: 900,
    fontSize: 12,
  },

  grid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 12
  },

  sectionTitle: {
    fontWeight: 950,
    marginBottom: 8,
    letterSpacing: -0.2,
  },

  sectionMuted: {
    opacity: 0.7,
    fontWeight: 800,
    marginLeft: 6,
  },

  tooltip: {
    background: "var(--card)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 10,
    boxShadow: "var(--shadowSoft)",
    minWidth: 220,
  },

  ttRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
  },

  hr: {
    height: 1,
    background: "rgba(148,163,184,0.22)",
    margin: "8px 0",
  },

  miniInfoOk: {
    border: "1px solid rgba(34,197,94,0.25)",
    background: "rgba(34,197,94,0.08)",
    borderRadius: 14,
    padding: "8px 10px",
    fontWeight: 900,
    fontSize: 12,
  },

  miniInfoBad: {
    border: "1px solid rgba(239,68,68,0.25)",
    background: "rgba(239,68,68,0.08)",
    borderRadius: 14,
    padding: "8px 10px",
    fontWeight: 900,
    fontSize: 12,
  },

  dayGroup: {
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 12,
    background: "rgba(148,163,184,0.05)",
  },

  dayHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "baseline",
  },

  pill: {
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 950,
  },

  sectionHeaderBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    color: "var(--text)",
    textAlign: "left",
  },

  sectionSubtitle: {
    color: "var(--muted)",
    fontWeight: 900,
    fontSize: 12,
    marginLeft: 2,
  },
};

function labelSelect(label, control) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, opacity: 0.75, color: "var(--muted)", fontWeight: 900 }}>
        {label}
      </span>
      {control}
    </label>
  );
}
