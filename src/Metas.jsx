import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

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

/* =========================================================
   ✅ CORREÇÃO DEFINITIVA DE TIMEZONE (sem “um dia a menos”)
   - Evita new Date("YYYY-MM-DD") (isso é UTC e pode voltar 1 dia no Brasil)
   - Sempre parse como data LOCAL: new Date(y, m-1, d)
========================================================= */
function parseYmdLocal(ymdStr) {
  if (!ymdStr) return null;
  const s = String(ymdStr).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d); // LOCAL
}

function toYmdFromAnyInput(s) {
  if (!s) return "";
  const str = String(s).trim();

  // já vem certinho
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // tenta extrair de ISO/strings que contenham YYYY-MM-DD
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // fallback: tenta Date() e normaliza para ymd local
  try {
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return "";
    return ymd(d);
  } catch {
    return "";
  }
}

function clampDateStr(s) {
  return toYmdFromAnyInput(s);
}

function clampNumber(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(startYmd, endYmd) {
  if (!startYmd || !endYmd) return null;

  const a = parseYmdLocal(clampDateStr(startYmd));
  const b = parseYmdLocal(clampDateStr(endYmd));
  if (!a || !b) return null;

  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);

  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function clampPct(p) {
  const n = Number(p || 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function formatShortDate(isoOrYmd) {
  try {
    const y = clampDateStr(isoOrYmd);
    const d = parseYmdLocal(y);
    if (!d) return String(isoOrYmd || "");
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return String(isoOrYmd || "");
  }
}

function startEndMonthYmd(ano, mes) {
  const start = new Date(ano, mes, 1);
  const end = new Date(ano, mes + 1, 1);
  return { start: ymd(start), end: ymd(end) };
}

function pickMotivation({ pct, isLate, done, streak }) {
  const p = clampPct(pct);

  if (done) {
    const doneMsgs = [
      "Meta concluída! Você acabou de subir de nível. 🏆",
      "Parabéns! Isso é consistência virando resultado. ✅",
      "Você provou pra você mesmo que consegue. Agora vamos pra próxima. 🚀",
    ];
    return doneMsgs[Math.floor(Math.random() * doneMsgs.length)];
  }

  if (streak >= 7) {
    return `🔥 Sequência forte: ${streak} ${streak === 1 ? "dia" : "dias"}! Consistência é poder.`;
  }

  if (isLate) {
    const lateMsgs = [
      "Sem drama: ajuste o plano e volta pro jogo. Um passo por vez. 🧩",
      "Atrasou? Normal. O importante é retomar hoje. 🔁",
      "Constância vence motivação — volta no simples. ✅",
    ];
    return lateMsgs[Math.floor(Math.random() * lateMsgs.length)];
  }

  if (p >= 75) return "Falta pouco. Mantém o ritmo — você tá muito perto. 🔥";
  if (p >= 50) return "Metade do caminho! Pequenos passos repetidos mudam tudo. 💪";
  if (p >= 25) return "Boa! Você já criou tração. Agora é só continuar. ⚡";
  return "Começar é a parte mais importante. Hoje conta. 🌱";
}

/* ===== Desafio (streak) ===== */
function weekKey(dOrYmd) {
  // ✅ aceita Date, "YYYY-MM-DD" ou ISO; sempre calcula em LOCAL
  if (dOrYmd instanceof Date) {
    const dt0 = new Date(dOrYmd.getFullYear(), dOrYmd.getMonth(), dOrYmd.getDate());
    dt0.setHours(0, 0, 0, 0);

    const dt = new Date(dt0);
    dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
    const week1 = new Date(dt.getFullYear(), 0, 4);
    const weekNo =
      1 +
      Math.round(
        ((dt - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
      );
    return `${dt.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  const y = clampDateStr(dOrYmd);
  const base = parseYmdLocal(y) || new Date();
  const dt0 = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  dt0.setHours(0, 0, 0, 0);

  const dt = new Date(dt0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const week1 = new Date(dt.getFullYear(), 0, 4);
  const weekNo =
    1 +
    Math.round(
      ((dt - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${dt.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function calcStreak(keysSet, freq) {
  if (!keysSet || keysSet.size === 0) return 0;

  if (freq === "semanal") {
    let cur = weekKey(new Date());
    let s = 0;

    for (let i = 0; i < 250; i++) {
      if (!keysSet.has(cur)) break;
      s++;
      const [yy, ww] = cur.split("-W");
      const y = Number(yy), w = Number(ww);

      const dt = new Date(y, 0, 1 + (w - 1) * 7);
      dt.setDate(dt.getDate() - 7);
      cur = weekKey(dt);
    }
    return s;
  }

  let dt = new Date();
  dt.setHours(0, 0, 0, 0);
  let s = 0;

  for (let i = 0; i < 400; i++) {
    const k = ymd(dt);
    if (!keysSet.has(k)) break;
    s++;
    dt.setDate(dt.getDate() - 1);
  }
  return s;
}

/* ===== Notificações (local PWA) ===== */
async function notifyLocal(title, body) {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      reg.showNotification(title, {
        body,
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
      });
      return;
    }
  } catch {
    // fallback abaixo
  }

  if ("Notification" in window && Notification.permission === "granted") {
    // eslint-disable-next-line no-new
    new Notification(title, { body });
  }
}

async function pedirPermissaoNotif() {
  if (!("Notification" in window)) {
    alert("Seu navegador não suporta notificações.");
    return;
  }
  const p = await Notification.requestPermission();
  if (p !== "granted") alert("Permissão negada.");
  else alert("✅ Notificações ativadas!");
}

/* ===== Ícones sugeridos (desktop friendly) ===== */
const ICONES_SUGERIDOS = [
  "🎯", "💰", "🏦", "📈", "🧾", "💳", "🏠", "🚗",
  "✈️", "🎓", "🩺", "🛒", "🍽️", "🎮", "📚", "🔧",
  "👶", "🐶", "🏋️", "🎁", "🧠", "💡", "🔥", "🌱",
];

// Mostra poucos por padrão (fica leve)
const ICONES_PADRAO_QTD = 10;

export default function Metas() {
  const hojeYmd = useMemo(() => ymd(new Date()), []);

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

  /* ================= UI (recolher seções) ================= */
  const [uiShowNova, setUiShowNova] = useState(true);
  const [uiShowAtivas, setUiShowAtivas] = useState(true);
  const [uiShowArquivadas, setUiShowArquivadas] = useState(false);

  // ✅ novo: recolher ícones
  const [uiIconsNovaOpen, setUiIconsNovaOpen] = useState(false);
  const [uiIconsEditOpen, setUiIconsEditOpen] = useState(false);

  /* ================= DADOS ================= */
  const [loading, setLoading] = useState(false);
  const [metas, setMetas] = useState([]);
  const [movs, setMovs] = useState([]);
  const [checkins, setCheckins] = useState([]);

  // Limite automático por categoria (gastos do mês)
  const [gastosCategorias, setGastosCategorias] = useState(new Map());
  const [categoriasLanc, setCategoriasLanc] = useState([]);

  async function carregarGastosCategoriasMes() {
    if (!user) return new Map();

    const now = new Date();
    const { start, end } = startEndMonthYmd(now.getFullYear(), now.getMonth());

    const { data, error } = await supabase
      .from("lancamentos")
      .select("categoria,valor,tipo,pago,data")
      .eq("user_id", user.id)
      .gte("data", start)
      .lt("data", end)
      .eq("tipo", "despesa");

    if (error) {
      console.error("Erro carregar gastos categorias:", error);
      return new Map();
    }

    const map = new Map();
    const cats = new Set();

    for (const l of data || []) {
      const cat = l.categoria || "Outros";
      cats.add(cat);

      // se quiser considerar só pagos:
      // if (!l.pago) continue;

      const v = Number(l.valor) || 0;
      map.set(cat, (map.get(cat) || 0) + v);
    }

    setCategoriasLanc(Array.from(cats).sort((a, b) => a.localeCompare(b)));
    return map;
  }

  async function carregarTudo() {
    if (!user) return;
    setLoading(true);

    const { data: metasData, error: metasErr } = await supabase
      .from("metas")
      .select("*")
      .eq("user_id", user.id)
      .order("criado_em", { ascending: false });

    if (metasErr) {
      console.error("Erro carregar metas:", metasErr);
      setMetas([]);
      setMovs([]);
      setCheckins([]);
      setLoading(false);
      return;
    }

    const ids = (metasData || []).map(m => m.id);

    let movsData = [];
    if (ids.length > 0) {
      const { data: mm, error: mmErr } = await supabase
        .from("metas_mov")
        .select("*")
        .eq("user_id", user.id)
        .in("meta_id", ids)
        .order("data", { ascending: true });

      movsData = mmErr ? [] : (mm || []);
      if (mmErr) console.error("Erro carregar movs:", mmErr);
    }

    let checkData = [];
    if (ids.length > 0) {
      const { data: cc, error: ccErr } = await supabase
        .from("metas_checkins")
        .select("*")
        .eq("user_id", user.id)
        .in("meta_id", ids)
        .order("data", { ascending: true });

      checkData = ccErr ? [] : (cc || []);
      if (ccErr) console.error("Erro carregar checkins:", ccErr);
    }

    const mapGastos = await carregarGastosCategoriasMes();

    setMetas(metasData || []);
    setMovs(movsData || []);
    setCheckins(checkData || []);
    setGastosCategorias(mapGastos);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ================= NOVA META (form) ================= */
  const [mTitulo, setMTitulo] = useState("");
  const [mTipo, setMTipo] = useState("guardar"); // guardar | pagar | limitar | limite_auto
  const [mAlvo, setMAlvo] = useState("");
  const [mInicial, setMInicial] = useState("");

  // data início e fim
  const [mInicio, setMInicio] = useState(() => hojeYmd);
  const [mFim, setMFim] = useState("");

  // ícone / cor
  const [mIcone, setMIcone] = useState("🎯");
  const [mCor, setMCor] = useState("#2563EB");
  const [mIconeCustom, setMIconeCustom] = useState(""); // opcional

  // limite automático por categoria
  const [mCategoriaLimite, setMCategoriaLimite] = useState("Outros");

  // desafio
  const [mDesafioAtivo, setMDesafioAtivo] = useState(false);
  const [mDesafioFreq, setMDesafioFreq] = useState("semanal"); // diario | semanal

  // lembretes
  const [mLembreteAtivo, setMLembreteAtivo] = useState(false);
  const [mLembreteHora, setMLembreteHora] = useState("08:30");

  async function criarMeta() {
    if (!user) return;

    const titulo = String(mTitulo || "").trim();
    const alvo = clampNumber(mAlvo);
    const inicial = clampNumber(mInicial);

    const inicio = clampDateStr(mInicio) || hojeYmd;
    const fim = clampDateStr(mFim);

    const iconeFinal = (String(mIconeCustom || "").trim() || mIcone || "🎯").slice(0, 4);

    if (!titulo) {
      alert("Informe um nome para a meta.");
      return;
    }
    if (!(alvo > 0)) {
      alert("Informe um valor alvo maior que zero.");
      return;
    }
    if (fim && daysBetween(inicio, fim) < 0) {
      alert("A data fim não pode ser menor que a data início.");
      return;
    }

    const modoLimiteAuto = mTipo === "limite_auto";

    const payload = {
      user_id: user.id,
      titulo,
      tipo: modoLimiteAuto ? "limitar" : mTipo,
      valor_alvo: alvo,
      valor_inicial: !modoLimiteAuto && inicial > 0 ? inicial : 0,

      data_inicio: inicio,
      data_fim: fim ? fim : null,

      icone: iconeFinal,
      cor: mCor || "#2563EB",
      ativo: true,

      modo_limite_auto: modoLimiteAuto,
      limite_categoria: modoLimiteAuto ? (mCategoriaLimite || "Outros") : null,
      limite_periodo: "mensal",

      desafio_ativo: !!mDesafioAtivo,
      desafio_freq: mDesafioFreq || "semanal",

      lembrete_ativo: !!mLembreteAtivo,
      lembrete_hora: mLembreteAtivo ? (mLembreteHora || "08:30") : null,
    };

    const { data, error } = await supabase
      .from("metas")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Erro criar meta:", error);
      alert("Erro ao criar meta. Veja o console.");
      return;
    }

    if (!modoLimiteAuto && inicial > 0) {
      const { error: e2 } = await supabase
        .from("metas_mov")
        .insert({
          user_id: user.id,
          meta_id: data.id,
          data: inicio,
          valor: inicial,
          nota: "Valor inicial",
        });
      if (e2) console.error("Erro mov inicial:", e2);
    }

    setMTitulo("");
    setMAlvo("");
    setMInicial("");
    setMInicio(hojeYmd);
    setMFim("");
    setMIcone("🎯");
    setMCor("#2563EB");
    setMIconeCustom("");
    setMCategoriaLimite("Outros");
    setMDesafioAtivo(false);
    setMDesafioFreq("semanal");
    setMLembreteAtivo(false);
    setMLembreteHora("08:30");

    setUiIconsNovaOpen(false); // ✅ recolhe ícones
    await carregarTudo();
    setUiShowAtivas(true);
    alert("✅ Meta criada!");
  }

  /* ================= MOVIMENTAÇÕES / CHECKINS / AGREGADOS ================= */
  const movsByMeta = useMemo(() => {
    const map = new Map();
    for (const mv of movs || []) {
      if (!map.has(mv.meta_id)) map.set(mv.meta_id, []);
      map.get(mv.meta_id).push(mv);
    }
    return map;
  }, [movs]);

  const checkinsByMeta = useMemo(() => {
    const map = new Map();
    for (const c of checkins || []) {
      if (!map.has(c.meta_id)) map.set(c.meta_id, []);
      map.get(c.meta_id).push(c);
    }
    return map;
  }, [checkins]);

  const metasView = useMemo(() => {
    const list = (metas || []).map(m => {
      const mvs = movsByMeta.get(m.id) || [];
      const cks = checkinsByMeta.get(m.id) || [];

      const modoLimiteAuto = !!m.modo_limite_auto && !!m.limite_categoria;

      const alvo = Number(m.valor_alvo) || 0;

      let atual = 0;
      let pct = 0;
      let done = false;
      let falta = 0;

      if (modoLimiteAuto) {
        const gasto = Number(gastosCategorias.get(m.limite_categoria || "Outros") || 0);
        atual = gasto;
        pct = alvo > 0 ? (gasto / alvo) * 100 : 0;
        done = alvo > 0 ? (gasto <= alvo) : true;
        falta = Math.max(0, alvo - gasto);
      } else {
        const soma = mvs.reduce((s, x) => s + (Number(x.valor) || 0), 0);
        atual = (Number(m.valor_inicial) || 0) + soma;
        pct = alvo > 0 ? (atual / alvo) * 100 : 0;
        done = alvo > 0 && atual >= alvo;
        falta = Math.max(0, alvo - atual);
      }

      const inicio = m.data_inicio || hojeYmd;
      const diasRest = m.data_fim ? daysBetween(hojeYmd, m.data_fim) : null;
      const isLate = (diasRest !== null && diasRest < 0 && !done && !modoLimiteAuto);

      let porMes = null;
      let porSemana = null;

      if (m.data_fim && diasRest !== null && diasRest >= 0) {
        const faltaCalc = modoLimiteAuto ? Math.max(0, atual - alvo) : falta;
        if (faltaCalc > 0) {
          const meses = Math.max(1, Math.ceil(diasRest / 30));
          const semanas = Math.max(1, Math.ceil(diasRest / 7));
          porMes = faltaCalc / meses;
          porSemana = faltaCalc / semanas;
        }
      }

      let streak = 0;
      if (m.desafio_ativo) {
        const freq = m.desafio_freq || "semanal";
        const set = new Set();

        for (const ck of cks) {
          if (!ck?.data) continue;
          if (freq === "semanal") set.add(weekKey(ck.data));
          else set.add(String(ck.data));
        }
        streak = calcStreak(set, freq);
      }

      const motivational = pickMotivation({
        pct,
        isLate,
        done: (modoLimiteAuto ? (alvo > 0 ? atual <= alvo : true) : done),
        streak
      });

      return {
        ...m,
        atual,
        falta,
        pct: modoLimiteAuto ? pct : clampPct(pct),
        done,
        diasRest,
        isLate,
        porMes,
        porSemana,
        motivational,
        lastMov: mvs.length ? mvs[mvs.length - 1] : null,
        movCount: mvs.length,
        streak,
        modoLimiteAuto,
        inicio,
      };
    });

    return list.sort((a, b) => {
      const aa = a.ativo ? 0 : 1;
      const bb = b.ativo ? 0 : 1;
      if (aa !== bb) return aa - bb;

      if (a.modoLimiteAuto || b.modoLimiteAuto) {
        const ap = Number(a.pct || 0);
        const bp = Number(b.pct || 0);
        if (bp !== ap) return bp - ap;
      } else {
        if (b.pct !== a.pct) return b.pct - a.pct;
      }

      return String(b.criado_em || "").localeCompare(String(a.criado_em || ""));
    });
  }, [metas, movsByMeta, checkinsByMeta, hojeYmd, gastosCategorias]);

  const metasAtivas = useMemo(() => metasView.filter(m => m.ativo), [metasView]);
  const metasArquivadas = useMemo(() => metasView.filter(m => !m.ativo), [metasView]);

  const resumoTopo = useMemo(() => {
    const ativas = metasAtivas.length;

    const media =
      ativas > 0
        ? metasAtivas.reduce((s, m) => {
          const p = m.modoLimiteAuto ? clampPct(m.pct) : (m.pct || 0);
          return s + p;
        }, 0) / ativas
        : 0;

    const destaque =
      metasAtivas.slice().sort((a, b) => {
        const ap = a.modoLimiteAuto ? clampPct(a.pct) : (a.pct || 0);
        const bp = b.modoLimiteAuto ? clampPct(b.pct) : (b.pct || 0);
        return bp - ap;
      })[0] || null;

    return { ativas, media, destaque };
  }, [metasAtivas]);

  /* ================= NOTIFICAÇÕES (timer local) ================= */
  const lastNotifiedRef = useRef(new Set());

  useEffect(() => {
    if (!user) return;

    const id = setInterval(() => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const hm = `${hh}:${mm}`;

      for (const m of metasView || []) {
        if (!m.lembrete_ativo || !m.lembrete_hora) continue;
        if (m.lembrete_hora !== hm) continue;

        const key = `${m.id}-${hm}-${ymd(now)}`;
        if (lastNotifiedRef.current.has(key)) continue;
        lastNotifiedRef.current.add(key);

        notifyLocal("🎯 Suas metas", `Lembrete: ${m.icone || "🎯"} ${m.titulo}`);
      }
    }, 60 * 1000);

    return () => clearInterval(id);
  }, [user, metasView]);

  /* ================= MODAL: ADICIONAR PROGRESSO ================= */
  const [addOpen, setAddOpen] = useState(false);
  const [addMeta, setAddMeta] = useState(null);
  const [addValor, setAddValor] = useState("");
  const [addData, setAddData] = useState(hojeYmd);
  const [addNota, setAddNota] = useState("");

  function abrirAdd(meta) {
    setAddMeta(meta);
    setAddValor("");
    setAddData(hojeYmd);
    setAddNota("");
    setAddOpen(true);
  }

  async function salvarAdd() {
    if (!user || !addMeta) return;

    if (addMeta.modoLimiteAuto) {
      alert("Essa meta é de limite automático por categoria. O progresso é calculado sozinho pelo gasto do mês.");
      return;
    }

    const v = clampNumber(addValor);
    if (!(v > 0)) {
      alert("Informe um valor maior que zero.");
      return;
    }

    const { error } = await supabase
      .from("metas_mov")
      .insert({
        user_id: user.id,
        meta_id: addMeta.id,
        data: clampDateStr(addData) || hojeYmd, // ✅ garante YYYY-MM-DD sem timezone bug
        valor: v,
        nota: addNota ? String(addNota).slice(0, 200) : null,
      });

    if (error) {
      console.error("Erro add progresso:", error);
      alert("Erro ao salvar. Veja o console.");
      return;
    }

    setAddOpen(false);
    await carregarTudo();
    alert("✅ Progresso registrado!");
  }

  /* ================= DESAFIO: CHECK-IN ================= */
  async function fazerCheckin(meta) {
    if (!user || !meta) return;
    if (!meta.desafio_ativo) {
      alert("Ative o modo desafio nesta meta para usar check-in.");
      return;
    }

    const data = ymd(new Date());

    const { error } = await supabase
      .from("metas_checkins")
      .insert({
        user_id: user.id,
        meta_id: meta.id,
        data,
      });

    if (error) {
      console.error("Erro check-in:", error);
      alert("Você já fez check-in hoje. ✅");
      return;
    }

    await carregarTudo();
    alert("✅ Check-in registrado! 🔥");
  }

  /* ================= MODAL: EDITAR META ================= */
  const [editOpen, setEditOpen] = useState(false);
  const [editMeta, setEditMeta] = useState(null);

  const [eTitulo, setETitulo] = useState("");
  const [eTipo, setETipo] = useState("guardar");
  const [eAlvo, setEAlvo] = useState("");
  const [eInicio, setEInicio] = useState(hojeYmd);
  const [eFim, setEFim] = useState("");
  const [eIcone, setEIcone] = useState("🎯");
  const [eCor, setECor] = useState("#2563EB");
  const [eIconeCustom, setEIconeCustom] = useState("");

  const [eModoLimiteAuto, setEModoLimiteAuto] = useState(false);
  const [eCategoriaLimite, setECategoriaLimite] = useState("Outros");

  const [eDesafioAtivo, setEDesafioAtivo] = useState(false);
  const [eDesafioFreq, setEDesafioFreq] = useState("semanal");

  const [eLembreteAtivo, setELembreteAtivo] = useState(false);
  const [eLembreteHora, setELembreteHora] = useState("08:30");

  function abrirEditar(meta) {
    setEditMeta(meta);

    setETitulo(meta.titulo || "");
    setETipo(meta.tipo || "guardar");
    setEAlvo(String(meta.valor_alvo ?? ""));
    setEInicio(meta.data_inicio || hojeYmd);
    setEFim(meta.data_fim || "");
    setEIcone(meta.icone || "🎯");
    setECor(meta.cor || "#2563EB");
    setEIconeCustom("");

    setEModoLimiteAuto(!!meta.modo_limite_auto);
    setECategoriaLimite(meta.limite_categoria || "Outros");

    setEDesafioAtivo(!!meta.desafio_ativo);
    setEDesafioFreq(meta.desafio_freq || "semanal");

    setELembreteAtivo(!!meta.lembrete_ativo);
    setELembreteHora(meta.lembrete_hora || "08:30");

    setUiIconsEditOpen(false); // ✅ recolhe ícones ao abrir
    setEditOpen(true);
  }

  async function salvarEditar() {
    if (!user || !editMeta) return;

    const titulo = String(eTitulo || "").trim();
    const alvo = clampNumber(eAlvo);

    const inicio = clampDateStr(eInicio) || hojeYmd;
    const fim = clampDateStr(eFim);

    const iconeFinal = (String(eIconeCustom || "").trim() || eIcone || "🎯").slice(0, 4);

    if (!titulo) {
      alert("Informe um nome para a meta.");
      return;
    }
    if (!(alvo > 0)) {
      alert("Informe um valor alvo maior que zero.");
      return;
    }
    if (fim && daysBetween(inicio, fim) < 0) {
      alert("A data fim não pode ser menor que a data início.");
      return;
    }

    const payload = {
      titulo,
      tipo: eTipo,
      valor_alvo: alvo,
      data_inicio: inicio,
      data_fim: fim ? fim : null,
      icone: iconeFinal,
      cor: eCor || "#2563EB",

      modo_limite_auto: !!eModoLimiteAuto,
      limite_categoria: eModoLimiteAuto ? (eCategoriaLimite || "Outros") : null,
      limite_periodo: "mensal",

      desafio_ativo: !!eDesafioAtivo,
      desafio_freq: eDesafioFreq || "semanal",

      lembrete_ativo: !!eLembreteAtivo,
      lembrete_hora: eLembreteAtivo ? (eLembreteHora || "08:30") : null,
    };

    const { error } = await supabase
      .from("metas")
      .update(payload)
      .eq("id", editMeta.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Erro editar meta:", error);
      alert("Erro ao editar. Veja o console.");
      return;
    }

    setEditOpen(false);
    await carregarTudo();
    alert("✅ Meta atualizada!");
  }

  async function arquivarMeta(meta) {
    if (!user) return;
    const ok = confirm("Arquivar esta meta? (Você pode ver depois em Arquivadas)");
    if (!ok) return;

    const { error } = await supabase
      .from("metas")
      .update({ ativo: false })
      .eq("id", meta.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Erro arquivar:", error);
      alert("Erro ao arquivar.");
      return;
    }

    await carregarTudo();
  }

  async function reativarMeta(meta) {
    if (!user) return;

    const { error } = await supabase
      .from("metas")
      .update({ ativo: true })
      .eq("id", meta.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Erro reativar:", error);
      alert("Erro ao reativar.");
      return;
    }

    await carregarTudo();
  }

  async function excluirMeta(meta) {
    if (!user || !meta) return;

    const ok = confirm(
      `Excluir a meta "${meta.titulo}"?\n\nIsso apaga também progressos e check-ins. Essa ação não pode ser desfeita.`
    );
    if (!ok) return;

    const { error: e1 } = await supabase
      .from("metas_mov")
      .delete()
      .eq("user_id", user.id)
      .eq("meta_id", meta.id);
    if (e1) console.error("Erro deletar movs:", e1);

    const { error: e2 } = await supabase
      .from("metas_checkins")
      .delete()
      .eq("user_id", user.id)
      .eq("meta_id", meta.id);
    if (e2) console.error("Erro deletar checkins:", e2);

    const { error: e3 } = await supabase
      .from("metas")
      .delete()
      .eq("user_id", user.id)
      .eq("id", meta.id);

    if (e3) {
      console.error("Erro excluir meta:", e3);
      alert("Erro ao excluir. Veja o console.");
      return;
    }

    await carregarTudo();
    alert("🗑️ Meta excluída!");
  }

  /* ================= UI ================= */
  if (!authReady) return <p style={{ padding: 18, color: "var(--muted)", fontWeight: 900 }}>Carregando…</p>;
  if (!user) return <p style={{ padding: 18, color: "var(--muted)", fontWeight: 900 }}>Faça login novamente.</p>;

  const tiposCriacao = [
    { v: "guardar", label: "Guardar dinheiro" },
    { v: "pagar", label: "Pagar dívida" },
    { v: "limitar", label: "Limitar gasto (manual)" },
    { v: "limite_auto", label: "Limite por categoria (automático)" },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.frame}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0, letterSpacing: -0.3 }}>Metas — GFD</h2>
            <p style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
              Planeje, acompanhe e comemore o progresso.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={pedirPermissaoNotif} style={styles.secondaryBtn} title="Ativar notificações (local)">
              🔔 Ativar notificações
            </button>

            <button onClick={carregarTudo} style={styles.secondaryBtn} title="Atualizar dados">
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* ====== TOP CARDS ====== */}
        <div style={styles.cards}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Metas ativas</div>
            <div style={styles.cardValue}>{metasAtivas.length}</div>
            <div style={styles.cardHint}>Organize seu foco do mês.</div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardLabel}>Progresso médio</div>
            <div style={styles.cardValue}>{clampPct(resumoTopo.media).toFixed(0)}%</div>
            <div style={styles.cardHint}>O importante é consistência.</div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardLabel}>Meta destaque</div>
            <div style={{ ...styles.cardValue, fontSize: 18 }}>
              {resumoTopo.destaque ? (
                <>
                  <span style={{ marginRight: 8 }}>{resumoTopo.destaque.icone || "🎯"}</span>
                  {resumoTopo.destaque.titulo}
                </>
              ) : (
                "—"
              )}
            </div>
            <div style={styles.cardHint}>
              {resumoTopo.destaque ? (
                resumoTopo.destaque.modoLimiteAuto ? (
                  <>
                    {money(resumoTopo.destaque.atual)} / {money(resumoTopo.destaque.valor_alvo)} •{" "}
                    <b>{clampPct(resumoTopo.destaque.pct).toFixed(0)}%</b>
                    {" "}• {resumoTopo.destaque.limite_categoria || "Categoria"}
                  </>
                ) : (
                  <>
                    {money(resumoTopo.destaque.atual)} / {money(resumoTopo.destaque.valor_alvo)} •{" "}
                    <b>{resumoTopo.destaque.pct.toFixed(0)}%</b>
                  </>
                )
              ) : (
                "Crie sua primeira meta e acompanhe o progresso."
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <p style={{ marginTop: 10, color: "var(--muted)", fontWeight: 900 }}>Carregando dados…</p>
        ) : null}

        {/* ====== NOVA META ====== */}
        <CollapseSection
          id="nova_meta"
          title="Nova meta"
          subtitle="criar em 20 segundos"
          open={uiShowNova}
          onToggle={() => setUiShowNova(v => !v)}
        >
          <div style={{ ...styles.cardPad, padding: 12 }}>
            <div style={styles.formRow}>
              <input
                value={mTitulo}
                onChange={(e) => setMTitulo(e.target.value)}
                placeholder="Nome da meta (ex: Reserva de emergência)"
                style={{ ...styles.input, minWidth: 240 }}
              />

              <select value={mTipo} onChange={(e) => setMTipo(e.target.value)} style={styles.select}>
                {tiposCriacao.map(t => (
                  <option key={t.v} value={t.v}>{t.label}</option>
                ))}
              </select>

              <input
                value={mAlvo}
                onChange={(e) => setMAlvo(e.target.value)}
                placeholder="Valor alvo (ex: 5000 ou 5000,00)"
                style={styles.input}
              />

              {mTipo !== "limite_auto" ? (
                <input
                  value={mInicial}
                  onChange={(e) => setMInicial(e.target.value)}
                  placeholder="Valor inicial (opcional)"
                  style={styles.input}
                />
              ) : (
                <select
                  value={mCategoriaLimite}
                  onChange={(e) => setMCategoriaLimite(e.target.value)}
                  style={styles.select}
                  title="Categoria para limite automático"
                >
                  {(categoriasLanc.length ? categoriasLanc : ["Outros"]).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              {/* ✅ Datas (agrupadas) */}
              <div style={styles.dateGroup}>
                <div style={styles.dateCol}>
                  <div style={styles.miniLabel}>Início</div>
                  <input
                    type="date"
                    value={mInicio}
                    onChange={(e) => setMInicio(e.target.value)}
                    style={{ ...styles.input, minWidth: 190 }}
                    title="Data de início"
                  />
                </div>

                <div style={styles.dateCol}>
                  <div style={styles.miniLabel}>Fim (opcional)</div>
                  <input
                    type="date"
                    value={mFim}
                    onChange={(e) => setMFim(e.target.value)}
                    style={{ ...styles.input, minWidth: 190 }}
                    title="Data fim (opcional)"
                  />
                </div>
              </div>

              {/* ✅ Ícones recolhíveis */}
              <div style={styles.iconBlock}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={styles.miniLabel}>Ícone</div>

                  <button
                    type="button"
                    onClick={() => setUiIconsNovaOpen(v => !v)}
                    style={styles.smallBtn}
                    title="Mostrar/ocultar ícones"
                  >
                    {uiIconsNovaOpen ? "Ocultar" : "Escolher ícone"} {uiIconsNovaOpen ? "▾" : "▸"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                  <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                    Selecionado: <b style={{ color: "var(--text)" }}>{(mIconeCustom || mIcone || "🎯").slice(0, 4)}</b>
                  </span>

                  <input
                    value={mIconeCustom}
                    onChange={(e) => setMIconeCustom(e.target.value)}
                    placeholder="Personalizado (opcional)"
                    style={{ ...styles.input, minWidth: 220 }}
                    title="Ícone personalizado (opcional)"
                  />
                </div>

                {uiIconsNovaOpen ? (
                  <>
                    <div style={{ ...styles.iconRow, marginTop: 10 }}>
                      {ICONES_SUGERIDOS.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          onClick={() => setMIcone(ic)}
                          style={{
                            ...styles.iconPick,
                            borderColor: (mIcone === ic ? "var(--tabActiveBorder)" : "var(--border)"),
                            background: (mIcone === ic ? "var(--tabActiveBg)" : "var(--controlBg)"),
                          }}
                          title={`Usar ${ic}`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ ...styles.iconRow, marginTop: 10 }}>
                    {ICONES_SUGERIDOS.slice(0, ICONES_PADRAO_QTD).map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setMIcone(ic)}
                        style={{
                          ...styles.iconPick,
                          borderColor: (mIcone === ic ? "var(--tabActiveBorder)" : "var(--border)"),
                          background: (mIcone === ic ? "var(--tabActiveBg)" : "var(--controlBg)"),
                        }}
                        title={`Usar ${ic}`}
                      >
                        {ic}
                      </button>
                    ))}
                    <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                      +{Math.max(0, ICONES_SUGERIDOS.length - ICONES_PADRAO_QTD)}
                    </span>
                  </div>
                )}
              </div>

              <input
                value={mCor}
                onChange={(e) => setMCor(e.target.value)}
                style={{ ...styles.input, minWidth: 160 }}
                placeholder="#2563EB"
                title="Cor (hex)"
              />

              {/* ✅ Desafio */}
              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={mDesafioAtivo}
                  onChange={(e) => setMDesafioAtivo(e.target.checked)}
                />
                Modo desafio
              </label>

              {mDesafioAtivo ? (
                <select value={mDesafioFreq} onChange={(e) => setMDesafioFreq(e.target.value)} style={styles.select}>
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                </select>
              ) : null}

              {/* ✅ Lembretes */}
              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={mLembreteAtivo}
                  onChange={(e) => setMLembreteAtivo(e.target.checked)}
                />
                Lembrete
              </label>

              {mLembreteAtivo ? (
                <input
                  type="time"
                  value={mLembreteHora}
                  onChange={(e) => setMLembreteHora(e.target.value)}
                  style={{ ...styles.input, minWidth: 140 }}
                  title="Hora do lembrete"
                />
              ) : null}

              <button onClick={criarMeta} style={styles.primaryBtn}>
                ➕ Criar meta
              </button>

              <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                Dica: comece simples. Se for “limite por categoria”, o app calcula sozinho pelo gasto do mês.
              </span>
            </div>
          </div>
        </CollapseSection>
        {/* ====== METAS ATIVAS ====== */}
        <CollapseSection
          id="metas_ativas"
          title="Metas ativas"
          subtitle={`${metasAtivas.length} ativa(s)`}
          open={uiShowAtivas}
          onToggle={() => setUiShowAtivas(v => !v)}
        >
          {metasAtivas.length === 0 ? (
            <EmptyState
              title="Nenhuma meta ativa ainda."
              subtitle="Crie uma meta acima e comece a acompanhar seu progresso."
            />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {metasAtivas.map((m) => (
                <MetaCard
                  key={m.id}
                  meta={m}
                  onAdd={() => abrirAdd(m)}
                  onEdit={() => abrirEditar(m)}
                  onArchive={() => arquivarMeta(m)}
                  onDelete={() => excluirMeta(m)}
                  onCheckin={() => fazerCheckin(m)}
                />
              ))}
            </div>
          )}
        </CollapseSection>

        {/* ====== METAS ARQUIVADAS ====== */}
        <CollapseSection
          id="metas_arq"
          title="Arquivadas"
          subtitle={`${metasArquivadas.length} arquivada(s)`}
          open={uiShowArquivadas}
          onToggle={() => setUiShowArquivadas(v => !v)}
        >
          {metasArquivadas.length === 0 ? (
            <EmptyState
              title="Nada arquivado."
              subtitle="Quando você concluir ou pausar uma meta, ela aparece aqui."
            />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {metasArquivadas.map((m) => (
                <MetaCard
                  key={m.id}
                  meta={m}
                  onAdd={null}
                  onEdit={() => abrirEditar(m)}
                  onArchive={null}
                  onReactivate={() => reativarMeta(m)}
                  onDelete={() => excluirMeta(m)}
                  onCheckin={() => fazerCheckin(m)}
                  archived
                />
              ))}
            </div>
          )}
        </CollapseSection>

        <div style={{ height: 6 }} />

        {/* ====== MODAIS ====== */}
        {addOpen ? (
          <Modal title={`Adicionar progresso — ${addMeta?.titulo || ""}`} onClose={() => setAddOpen(false)}>
            <div style={{ display: "grid", gap: 10 }}>
              {addMeta?.modoLimiteAuto ? (
                <div style={styles.empty}>
                  <div style={{ fontWeight: 1000 }}>Essa meta é “limite por categoria (automático)”.</div>
                  <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
                    O progresso é calculado sozinho pelo gasto do mês na categoria.
                  </div>
                </div>
              ) : (
                <>
                  <label style={styles.label}>
                    Valor (R$)
                    <input value={addValor} onChange={(e) => setAddValor(e.target.value)} style={styles.input} />
                  </label>

                  <label style={styles.label}>
                    Data
                    <input type="date" value={addData} onChange={(e) => setAddData(e.target.value)} style={styles.input} />
                  </label>

                  <label style={styles.label}>
                    Observação (opcional)
                    <input value={addNota} onChange={(e) => setAddNota(e.target.value)} style={styles.input} />
                  </label>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setAddOpen(false)} style={styles.secondaryBtn}>Cancelar</button>
                    <button onClick={salvarAdd} style={styles.primaryBtn}>Salvar</button>
                  </div>
                </>
              )}

              {addMeta ? (
                <div style={{ ...styles.card2, padding: 12 }}>
                  <div style={{ fontWeight: 950 }}>✨ {addMeta.motivational}</div>
                  <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
                    Atual: <b>{money(addMeta.atual)}</b> • Alvo: <b>{money(addMeta.valor_alvo)}</b>
                  </div>
                </div>
              ) : null}
            </div>
          </Modal>
        ) : null}

        {editOpen ? (
          <Modal title={`Editar meta`} onClose={() => setEditOpen(false)}>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={styles.label}>
                Nome
                <input value={eTitulo} onChange={(e) => setETitulo(e.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                Tipo
                <select value={eTipo} onChange={(e) => setETipo(e.target.value)} style={styles.select}>
                  <option value="guardar">Guardar dinheiro</option>
                  <option value="pagar">Pagar dívida</option>
                  <option value="limitar">Limitar gasto</option>
                </select>
              </label>

              <label style={styles.label}>
                Valor alvo (R$)
                <input value={eAlvo} onChange={(e) => setEAlvo(e.target.value)} style={styles.input} />
              </label>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ ...styles.label, minWidth: 220 }}>
                  Data início
                  <input type="date" value={eInicio} onChange={(e) => setEInicio(e.target.value)} style={styles.input} />
                </label>

                <label style={{ ...styles.label, minWidth: 220 }}>
                  Data fim (opcional)
                  <input type="date" value={eFim} onChange={(e) => setEFim(e.target.value)} style={styles.input} />
                </label>
              </div>

              {/* ✅ Ícones recolhíveis no editar */}
              <div style={{ ...styles.card2, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontWeight: 1000 }}>Ícone</div>

                  <button
                    type="button"
                    onClick={() => setUiIconsEditOpen(v => !v)}
                    style={styles.smallBtn}
                    title="Mostrar/ocultar ícones"
                  >
                    {uiIconsEditOpen ? "Ocultar" : "Escolher ícone"} {uiIconsEditOpen ? "▾" : "▸"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                  <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                    Selecionado: <b style={{ color: "var(--text)" }}>{(eIconeCustom || eIcone || "🎯").slice(0, 4)}</b>
                  </span>

                  <input
                    value={eIconeCustom}
                    onChange={(e) => setEIconeCustom(e.target.value)}
                    placeholder="Personalizado (opcional)"
                    style={{ ...styles.input, minWidth: 220 }}
                  />
                </div>

                {uiIconsEditOpen ? (
                  <div style={{ ...styles.iconRow, marginTop: 10 }}>
                    {ICONES_SUGERIDOS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setEIcone(ic)}
                        style={{
                          ...styles.iconPick,
                          borderColor: (eIcone === ic ? "var(--tabActiveBorder)" : "var(--border)"),
                          background: (eIcone === ic ? "var(--tabActiveBg)" : "var(--controlBg)"),
                        }}
                        title={`Usar ${ic}`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ ...styles.iconRow, marginTop: 10 }}>
                    {ICONES_SUGERIDOS.slice(0, ICONES_PADRAO_QTD).map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setEIcone(ic)}
                        style={{
                          ...styles.iconPick,
                          borderColor: (eIcone === ic ? "var(--tabActiveBorder)" : "var(--border)"),
                          background: (eIcone === ic ? "var(--tabActiveBg)" : "var(--controlBg)"),
                        }}
                        title={`Usar ${ic}`}
                      >
                        {ic}
                      </button>
                    ))}
                    <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                      +{Math.max(0, ICONES_SUGERIDOS.length - ICONES_PADRAO_QTD)}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ ...styles.label, minWidth: 180 }}>
                  Cor
                  <input value={eCor} onChange={(e) => setECor(e.target.value)} style={styles.input} placeholder="#2563EB" />
                </label>
              </div>

              {/* ✅ Limite por categoria (auto) */}
              <div style={{ ...styles.card2, padding: 12 }}>
                <div style={{ fontWeight: 1000 }}>Limite por categoria (automático)</div>

                <label style={{ ...styles.checkLabel, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={eModoLimiteAuto}
                    onChange={(e) => setEModoLimiteAuto(e.target.checked)}
                  />
                  Ativar
                </label>

                {eModoLimiteAuto ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 900 }}>
                      Categoria:
                    </span>
                    <select value={eCategoriaLimite} onChange={(e) => setECategoriaLimite(e.target.value)} style={styles.select}>
                      {(categoriasLanc.length ? categoriasLanc : ["Outros"]).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                      O gasto do mês nessa categoria vira o “atual”.
                    </span>
                  </div>
                ) : null}
              </div>

              {/* ✅ Desafio */}
              <div style={{ ...styles.card2, padding: 12 }}>
                <div style={{ fontWeight: 1000 }}>Modo desafio</div>

                <label style={{ ...styles.checkLabel, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={eDesafioAtivo}
                    onChange={(e) => setEDesafioAtivo(e.target.checked)}
                  />
                  Ativar desafio
                </label>

                {eDesafioAtivo ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 900 }}>Frequência:</span>
                    <select value={eDesafioFreq} onChange={(e) => setEDesafioFreq(e.target.value)} style={styles.select}>
                      <option value="diario">Diário</option>
                      <option value="semanal">Semanal</option>
                    </select>
                    <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                      Use check-in para manter a sequência.
                    </span>
                  </div>
                ) : null}
              </div>

              {/* ✅ Lembretes */}
              <div style={{ ...styles.card2, padding: 12 }}>
                <div style={{ fontWeight: 1000 }}>Notificações / Lembretes</div>

                <label style={{ ...styles.checkLabel, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={eLembreteAtivo}
                    onChange={(e) => setELembreteAtivo(e.target.checked)}
                  />
                  Ativar lembrete
                </label>

                {eLembreteAtivo ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ color: "var(--muted)", fontWeight: 900 }}>Hora:</span>
                    <input
                      type="time"
                      value={eLembreteHora}
                      onChange={(e) => setELembreteHora(e.target.value)}
                      style={{ ...styles.input, minWidth: 140 }}
                    />
                    <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                      Requer permissão (botão “Ativar notificações” no topo).
                    </span>
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => setEditOpen(false)} style={styles.secondaryBtn}>Cancelar</button>
                <button onClick={salvarEditar} style={styles.primaryBtn}>Salvar</button>
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}

/* ================= COMPONENTS ================= */

function MetaCard({ meta, onAdd, onEdit, onArchive, onReactivate, onDelete, onCheckin, archived = false }) {
  const barColor = meta.cor || "var(--accent)";
  const modoLimiteAuto = !!meta.modoLimiteAuto;

  const done = modoLimiteAuto
    ? (Number(meta.atual || 0) <= Number(meta.valor_alvo || 0))
    : !!meta.done;

  const prazoTxt =
    meta.data_fim
      ? (meta.diasRest === null
        ? `Prazo: ${formatShortDate(meta.data_fim)}`
        : meta.diasRest < 0
          ? `Prazo: ${formatShortDate(meta.data_fim)} • atrasado`
          : `Prazo: ${formatShortDate(meta.data_fim)} • faltam ${meta.diasRest} dia(s)`)
      : "Sem prazo";

  const status =
    modoLimiteAuto
      ? (Number(meta.atual || 0) > Number(meta.valor_alvo || 0)
        ? { label: "Estourou", tone: "bad" }
        : clampPct(meta.pct) >= 75
          ? { label: "Atenção", tone: "hot" }
          : { label: "No controle", tone: "ok" })
      : done
        ? { label: "Concluída", tone: "ok" }
        : meta.isLate
          ? { label: "Atrasando", tone: "bad" }
          : meta.pct >= 75
            ? { label: "Quase lá", tone: "hot" }
            : { label: "No ritmo", tone: "neutral" };

  const statusStyle =
    status.tone === "ok"
      ? { background: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.28)", color: "var(--accent2)" }
      : status.tone === "bad"
        ? { background: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.28)", color: "#EF4444" }
        : status.tone === "hot"
          ? { background: "rgba(249,115,22,0.10)", borderColor: "rgba(249,115,22,0.28)", color: "var(--warn)" }
          : { background: "rgba(148,163,184,0.10)", borderColor: "rgba(148,163,184,0.22)", color: "var(--muted)" };

  const linhaPrincipal = modoLimiteAuto
    ? (
      <div style={{ fontWeight: 950 }}>
        {money(meta.atual)} <span style={{ color: "var(--muted)", fontWeight: 900 }}>/ {money(meta.valor_alvo)}</span>
        <span style={{ marginLeft: 10, color: "var(--muted)", fontWeight: 900 }}>
          • {meta.limite_categoria || "Categoria"}
        </span>
      </div>
    )
    : (
      <div style={{ fontWeight: 950 }}>
        {money(meta.atual)} <span style={{ color: "var(--muted)", fontWeight: 900 }}>/ {money(meta.valor_alvo)}</span>
      </div>
    );

  const faltaLinha = modoLimiteAuto
    ? (
      Number(meta.atual || 0) > Number(meta.valor_alvo || 0) ? (
        <div style={{ color: "#EF4444", fontWeight: 950 }}>
          ⚠️ Excedeu em <b>{money(Number(meta.atual || 0) - Number(meta.valor_alvo || 0))}</b>
        </div>
      ) : (
        <div style={{ color: "var(--accent2)", fontWeight: 950 }}>
          ✅ Dentro do limite • sobra <b>{money(meta.falta)}</b>
        </div>
      )
    )
    : (!done ? (
      <div style={{ color: "var(--muted)", fontWeight: 900 }}>
        Falta <b>{money(meta.falta)}</b>
      </div>
    ) : (
      <div style={{ color: "var(--accent2)", fontWeight: 950 }}>
        ✅ Alvo atingido
      </div>
    ));

  const pctDisplay = modoLimiteAuto ? clampPct(meta.pct) : meta.pct;

  return (
    <div style={styles.cardPad}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <div style={{ fontWeight: 1000, fontSize: 16 }}>
              <span style={{ marginRight: 8 }}>{meta.icone || "🎯"}</span>
              {meta.titulo}
            </div>

            <span style={{ ...styles.badge, ...statusStyle }}>
              {status.label}
            </span>

            <span style={{ color: "var(--muted)", fontWeight: 900 }}>
              {modoLimiteAuto ? "Limite (auto)" : (meta.tipo === "guardar" ? "Guardar" : meta.tipo === "pagar" ? "Dívida" : "Limite")} •{" "}
              Início: {formatShortDate(meta.data_inicio || meta.inicio)} • {prazoTxt}
            </span>
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {linhaPrincipal}
            {faltaLinha}
          </div>

          <div style={styles.progressWrap} aria-label="Progresso da meta">
            <div
              style={{
                ...styles.progressBar,
                width: `${clampPct(pctDisplay)}%`,
                background: barColor,
              }}
            />
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ color: "var(--muted)", fontWeight: 900 }}>
              Progresso: <b style={{ color: "var(--text)" }}>{clampPct(pctDisplay).toFixed(0)}%</b>
            </div>

            {meta.desafio_ativo ? (
              <div style={{ color: "var(--muted)", fontWeight: 900 }}>
                🔥 Streak: <b style={{ color: "var(--text)" }}>{meta.streak || 0}</b> {meta.desafio_freq === "diario" ? "dia(s)" : "semana(s)"}
              </div>
            ) : null}

            {meta.porMes !== null && meta.porSemana !== null && !done ? (
              modoLimiteAuto ? (
                <div style={{ color: "var(--muted)", fontWeight: 900 }}>
                  Para voltar ao limite no prazo: reduzir <b>{money(meta.porMes)}</b>/mês ou <b>{money(meta.porSemana)}</b>/semana
                </div>
              ) : (
                <div style={{ color: "var(--muted)", fontWeight: 900 }}>
                  Para chegar no prazo: <b>{money(meta.porMes)}</b>/mês ou <b>{money(meta.porSemana)}</b>/semana
                </div>
              )
            ) : null}
          </div>

          <div style={{ marginTop: 10, ...styles.motivBox }}>
            <div style={{ fontWeight: 950 }}>✨ {meta.motivational}</div>

            {modoLimiteAuto ? (
              <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
                Calculado automaticamente pelos gastos do mês em <b>{meta.limite_categoria || "Categoria"}</b>.
              </div>
            ) : meta.lastMov ? (
              <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
                Último progresso: <b>{money(meta.lastMov.valor)}</b> em <b>{formatShortDate(meta.lastMov.data)}</b>
                {meta.lastMov.nota ? <span> • {meta.lastMov.nota}</span> : null}
              </div>
            ) : (
              <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
                Nenhum progresso registrado ainda — comece com um valor pequeno hoje.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!archived && meta.desafio_ativo && onCheckin ? (
            <button onClick={onCheckin} style={styles.secondaryBtn} title="Registrar check-in do desafio">
              ✅ Check-in
            </button>
          ) : null}

          {!archived && onAdd ? (
            <button onClick={onAdd} style={styles.primaryBtn} disabled={modoLimiteAuto} title={modoLimiteAuto ? "Meta automática: não precisa progresso manual" : "Adicionar progresso"}>
              ➕ Progresso
            </button>
          ) : null}

          {onEdit ? (
            <button onClick={onEdit} style={styles.secondaryBtn}>✏️ Editar</button>
          ) : null}

          {!archived && onArchive ? (
            <button onClick={onArchive} style={styles.secondaryBtn}>📦 Arquivar</button>
          ) : null}

          {archived && onReactivate ? (
            <button onClick={onReactivate} style={styles.primaryBtn}>↩️ Reativar</button>
          ) : null}

          {onDelete ? (
            <button onClick={onDelete} style={styles.dangerBtn} title="Excluir meta">
              🗑️ Excluir
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <div style={styles.empty}>
      <div style={{ fontWeight: 1000 }}>{title}</div>
      <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900 }}>
        {subtitle}
      </div>
    </div>
  );
}

function CollapseSection({ id, title, subtitle, open, onToggle, children }) {
  return (
    <section style={{ marginTop: 12 }} aria-labelledby={`${id}_title`}>
      <button
        onClick={onToggle}
        style={styles.collapseBtn}
        aria-expanded={open}
        aria-controls={`${id}_content`}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div id={`${id}_title`} style={{ fontWeight: 1000, letterSpacing: -0.2 }}>{title}</div>
          <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>{subtitle}</span>
        </div>
        <div style={{ color: "var(--muted)", fontWeight: 1000 }}>
          {open ? "▾" : "▸"}
        </div>
      </button>

      {open ? (
        <div id={`${id}_content`} style={{ marginTop: 10 }}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Modal({ title, onClose, children }) {
  // ✅ ESC fecha
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ✅ clique fora fecha
  function onOverlayMouseDown(e) {
    if (e.target === e.currentTarget) onClose?.();
  }

  return (
    <div style={styles.modalOverlay} role="dialog" aria-modal="true" onMouseDown={onOverlayMouseDown}>
      <div style={styles.modalBox}>
        <div style={styles.modalHeader}>
          <div style={{ fontWeight: 1000 }}>{title}</div>
          <button onClick={onClose} style={styles.iconBtn} aria-label="Fechar modal">✕</button>
        </div>
        <div style={{ marginTop: 10 }}>{children}</div>

        {/* ✅ botão extra no fim (sempre aparece ao rolar) */}
        <div style={styles.modalFooter}>
          <button onClick={onClose} style={styles.secondaryBtn}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { width: "100%", overflow: "visible" },

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

  cards: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
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

  card2: {
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 14,
    background: "var(--card2)",
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

  cardLabel: { color: "var(--muted)", fontWeight: 900, fontSize: 13 },

  cardValue: {
    fontSize: 22,
    fontWeight: 1000,
    letterSpacing: -0.2,
    marginTop: 6,
  },

  cardHint: { marginTop: 10, fontSize: 13, color: "var(--muted)", fontWeight: 900 },

  formRow: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },

  label: { display: "grid", gap: 6, fontWeight: 900, color: "var(--text)" },

  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text)",
    fontWeight: 900,
    fontSize: 13,
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

  select: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 10px",
    outline: "none",
    minWidth: 170,
  },

  primaryBtn: {
    border: "1px solid rgba(37,99,235,0.35)",
    borderRadius: 12,
    background: "rgba(37,99,235,0.18)",
    color: "var(--text)",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 1000,
    outline: "none",
  },

  secondaryBtn: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--controlBg2)",
    color: "var(--text)",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 1000,
    outline: "none",
  },

  dangerBtn: {
    border: "1px solid rgba(239,68,68,0.35)",
    borderRadius: 12,
    background: "rgba(239,68,68,0.14)",
    color: "var(--text)",
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 1000,
    outline: "none",
  },

  iconBtn: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--controlBg2)",
    color: "var(--text)",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 1000,
    outline: "none",
  },

  smallBtn: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "rgba(148,163,184,0.08)",
    color: "var(--text)",
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 1000,
    outline: "none",
    fontSize: 12,
  },

  collapseBtn: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    cursor: "pointer",
    textAlign: "left",
  },

  progressWrap: {
    marginTop: 10,
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "rgba(148,163,184,0.16)",
    border: "1px solid var(--border)",
    overflow: "hidden",
  },

  progressBar: { height: "100%", borderRadius: 999, width: "0%", transition: "width 220ms ease" },

  badge: { border: "1px solid var(--border)", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 1000 },

  motivBox: { border: "1px solid var(--border)", borderRadius: 16, padding: 12, background: "rgba(148,163,184,0.06)" },

  empty: { border: "1px dashed var(--border)", borderRadius: 16, padding: 14, background: "rgba(148,163,184,0.06)" },

  // ✅ Modal corrigido: scroll interno + header sempre visível
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: 16,
    zIndex: 9999,
    overflowY: "auto",
  },

  modalBox: {
    width: "min(760px, 100%)",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "var(--card)",
    boxShadow: "var(--shadowSoft)",
    padding: 14,
    overflowY: "auto",
    maxHeight: "calc(100vh - 32px)",
  },

  modalHeader: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "var(--card)",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    paddingBottom: 10,
    borderBottom: "1px solid var(--border)",
  },

  modalFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    display: "flex",
    justifyContent: "flex-end",
  },

  // ✅ novos estilos para resolver “data duplicada” visual
  dateGroup: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-end",
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "rgba(148,163,184,0.06)",
  },
  dateCol: {
    display: "grid",
    gap: 6,
  },
  miniLabel: {
    fontSize: 12,
    fontWeight: 950,
    color: "var(--muted)",
    letterSpacing: -0.1,
  },

  // ✅ seletor de ícones
  iconBlock: {
    width: "min(560px, 100%)",
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 14,
    background: "rgba(148,163,184,0.06)",
  },
  iconRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  iconPick: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 1000,
    outline: "none",
    minWidth: 42,
  },
};
