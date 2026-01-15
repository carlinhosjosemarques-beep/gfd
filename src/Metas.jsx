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

function parseYmdLocal(ymdStr) {
  if (!ymdStr) return null;
  const s = String(ymdStr).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d);
}

function toYmdFromAnyInput(s) {
  if (!s) return "";
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
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

function weekKey(dOrYmd) {
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
  } catch {}

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

const ICONES_SUGERIDOS = [
  "🎯", "💰", "🏦", "📈", "🧾", "💳", "🏠", "🚗",
  "✈️", "🎓", "🩺", "🛒", "🍽️", "🎮", "📚", "🔧",
  "👶", "🐶", "🏋️", "🎁", "🧠", "💡", "🔥", "🌱",
];
const ICONES_PADRAO_QTD = 10;

export default function Metas({ canWrite = false }) {
  const canMutate = !!canWrite;
  const hojeYmd = useMemo(() => ymd(new Date()), []);

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

  const [uiShowNova, setUiShowNova] = useState(true);
  const [uiShowAtivas, setUiShowAtivas] = useState(true);
  const [uiShowArquivadas, setUiShowArquivadas] = useState(false);

  const [uiIconsNovaOpen, setUiIconsNovaOpen] = useState(false);
  const [uiIconsEditOpen, setUiIconsEditOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [metas, setMetas] = useState([]);
  const [movs, setMovs] = useState([]);
  const [checkins, setCheckins] = useState([]);

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

  const [mTitulo, setMTitulo] = useState("");
  const [mTipo, setMTipo] = useState("guardar");
  const [mAlvo, setMAlvo] = useState("");
  const [mInicial, setMInicial] = useState("");

  const [mInicio, setMInicio] = useState(() => hojeYmd);
  const [mFim, setMFim] = useState("");

  const [mIcone, setMIcone] = useState("🎯");
  const [mCor, setMCor] = useState("#2563EB");
  const [mIconeCustom, setMIconeCustom] = useState("");

  const [mCategoriaLimite, setMCategoriaLimite] = useState("Outros");

  const [mDesafioAtivo, setMDesafioAtivo] = useState(false);
  const [mDesafioFreq, setMDesafioFreq] = useState("semanal");

  const [mLembreteAtivo, setMLembreteAtivo] = useState(false);
  const [mLembreteHora, setMLembreteHora] = useState("08:30");

  async function criarMeta() {
    if (!user) return;
    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para criar/editar metas.");
      return;
    }

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

    setUiIconsNovaOpen(false);
    await carregarTudo();
    setUiShowAtivas(true);
    alert("✅ Meta criada!");
  }

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
          const mesesCalc = Math.max(1, Math.ceil(diasRest / 30));
          const semanasCalc = Math.max(1, Math.ceil(diasRest / 7));
          porMes = faltaCalc / mesesCalc;
          porSemana = faltaCalc / semanasCalc;
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

    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para registrar progresso.");
      return;
    }

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
        data: clampDateStr(addData) || hojeYmd,
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

  async function fazerCheckin(meta) {
    if (!user || !meta) return;

    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para usar check-in.");
      return;
    }

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
    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para editar metas.");
      return;
    }

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

    setUiIconsEditOpen(false);
    setEditOpen(true);
  }

  async function salvarEditar() {
    if (!user || !editMeta) return;

    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para salvar alterações.");
      return;
    }

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
    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para arquivar.");
      return;
    }

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
    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para reativar.");
      return;
    }

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
    if (!canMutate) {
      alert("🔒 Somente leitura. Faça assinatura para excluir.");
      return;
    }

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

            {!canMutate ? (
              <div style={{ ...styles.readOnlyBar }}>
                🔒 Modo somente leitura (assinatura necessária para criar/editar/progresso/check-in)
              </div>
            ) : null}
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
                disabled={!canMutate}
              />

              <select
                value={mTipo}
                onChange={(e) => setMTipo(e.target.value)}
                style={styles.select}
                disabled={!canMutate}
              >
                {tiposCriacao.map(t => (
                  <option key={t.v} value={t.v}>{t.label}</option>
                ))}
              </select>

              <input
                value={mAlvo}
                onChange={(e) => setMAlvo(e.target.value)}
                placeholder="Valor alvo (ex: 5000 ou 5000,00)"
                style={styles.input}
                disabled={!canMutate}
              />

              {mTipo !== "limite_auto" ? (
                <input
                  value={mInicial}
                  onChange={(e) => setMInicial(e.target.value)}
                  placeholder="Valor inicial (opcional)"
                  style={styles.input}
                  disabled={!canMutate}
                />
              ) : (
                <select
                  value={mCategoriaLimite}
                  onChange={(e) => setMCategoriaLimite(e.target.value)}
                  style={styles.select}
                  title="Categoria para limite automático"
                  disabled={!canMutate}
                >
                  {(categoriasLanc.length ? categoriasLanc : ["Outros"]).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              <div style={styles.dateGroup}>
                <div style={styles.dateCol}>
                  <div style={styles.miniLabel}>Início</div>
                  <input
                    type="date"
                    value={mInicio}
                    onChange={(e) => setMInicio(e.target.value)}
                    style={{ ...styles.input, minWidth: 190 }}
                    title="Data de início"
                    disabled={!canMutate}
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
                    disabled={!canMutate}
                  />
                </div>
              </div>

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
                    disabled={!canMutate}
                  />
                </div>

                {uiIconsNovaOpen ? (
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
                        disabled={!canMutate}
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
                        onClick={() => setMIcone(ic)}
                        style={{
                          ...styles.iconPick,
                          borderColor: (mIcone === ic ? "var(--tabActiveBorder)" : "var(--border)"),
                          background: (mIcone === ic ? "var(--tabActiveBg)" : "var(--controlBg)"),
                        }}
                        title={`Usar ${ic}`}
                        disabled={!canMutate}
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
                disabled={!canMutate}
              />

              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={mDesafioAtivo}
                  onChange={(e) => setMDesafioAtivo(e.target.checked)}
                  disabled={!canMutate}
                />
                Modo desafio
              </label>

              {mDesafioAtivo ? (
                <select
                  value={mDesafioFreq}
                  onChange={(e) => setMDesafioFreq(e.target.value)}
                  style={styles.select}
                  disabled={!canMutate}
                >
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                </select>
              ) : null}

              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={mLembreteAtivo}
                  onChange={(e) => setMLembreteAtivo(e.target.checked)}
                  disabled={!canMutate}
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
                  disabled={!canMutate}
                />
              ) : null}

              <button onClick={criarMeta} style={styles.primaryBtn} disabled={!canMutate}>
                ➕ Criar meta
              </button>

              <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>
                Dica: se for “limite por categoria”, o app calcula sozinho pelo gasto do mês.
              </span>
            </div>
          </div>
        </CollapseSection>

        <CollapseSection
          id="ativas"
          title={`Metas ativas (${metasAtivas.length})`}
          subtitle={metasAtivas.length ? "acompanhe o progresso" : "crie sua primeira meta"}
          open={uiShowAtivas}
          onToggle={() => setUiShowAtivas(v => !v)}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {metasAtivas.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontWeight: 1000 }}>Nenhuma meta ativa</div>
                <div style={{ color: "var(--muted)", fontWeight: 900 }}>
                  Crie uma meta acima e acompanhe o progresso.
                </div>
              </div>
            ) : null}

            {metasAtivas.map((m) => (
              <MetaCard
                key={m.id}
                meta={m}
                canMutate={canMutate}
                onAdd={() => abrirAdd(m)}
                onEdit={() => abrirEditar(m)}
                onArchive={() => arquivarMeta(m)}
                onDelete={() => excluirMeta(m)}
                onCheckin={() => fazerCheckin(m)}
              />
            ))}
          </div>
        </CollapseSection>

        <CollapseSection
          id="arquivadas"
          title={`Arquivadas (${metasArquivadas.length})`}
          subtitle="histórico e concluídas"
          open={uiShowArquivadas}
          onToggle={() => setUiShowArquivadas(v => !v)}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {metasArquivadas.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontWeight: 1000 }}>Nada por aqui</div>
                <div style={{ color: "var(--muted)", fontWeight: 900 }}>
                  Arquive metas para consultar depois.
                </div>
              </div>
            ) : null}

            {metasArquivadas.map((m) => (
              <MetaCard
                key={m.id}
                meta={m}
                canMutate={canMutate}
                archived
                onReactivate={() => reativarMeta(m)}
                onDelete={() => excluirMeta(m)}
              />
            ))}
          </div>
        </CollapseSection>

        {addOpen ? (
          <Modal onClose={() => setAddOpen(false)} title="Adicionar progresso">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ color: "var(--muted)", fontWeight: 900 }}>
                Meta: <b style={{ color: "var(--text)" }}>{addMeta?.icone || "🎯"} {addMeta?.titulo}</b>
              </div>

              <div style={styles.formRow2}>
                <input
                  value={addValor}
                  onChange={(e) => setAddValor(e.target.value)}
                  placeholder="Valor (ex: 300 ou 300,00)"
                  style={styles.input}
                  disabled={!canMutate}
                />

                <input
                  type="date"
                  value={addData}
                  onChange={(e) => setAddData(e.target.value)}
                  style={{ ...styles.input, minWidth: 190 }}
                  disabled={!canMutate}
                />
              </div>

              <input
                value={addNota}
                onChange={(e) => setAddNota(e.target.value)}
                placeholder="Nota (opcional)"
                style={styles.input}
                disabled={!canMutate}
              />

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => setAddOpen(false)} style={styles.secondaryBtn}>
                  Cancelar
                </button>
                <button onClick={salvarAdd} style={styles.primaryBtn} disabled={!canMutate}>
                  ✅ Salvar
                </button>
              </div>

              {!canMutate ? (
                <div style={styles.lockNote}>
                  🔒 Assinatura necessária para registrar progresso.
                </div>
              ) : null}
            </div>
          </Modal>
        ) : null}

        {editOpen ? (
          <Modal onClose={() => setEditOpen(false)} title="Editar meta">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={styles.formRow}>
                <input
                  value={eTitulo}
                  onChange={(e) => setETitulo(e.target.value)}
                  placeholder="Nome da meta"
                  style={{ ...styles.input, minWidth: 240 }}
                  disabled={!canMutate}
                />

                <select
                  value={eTipo}
                  onChange={(e) => setETipo(e.target.value)}
                  style={styles.select}
                  disabled={!canMutate}
                >
                  <option value="guardar">Guardar dinheiro</option>
                  <option value="pagar">Pagar dívida</option>
                  <option value="limitar">Limitar gasto (manual)</option>
                </select>

                <input
                  value={eAlvo}
                  onChange={(e) => setEAlvo(e.target.value)}
                  placeholder="Valor alvo"
                  style={styles.input}
                  disabled={!canMutate}
                />

                <div style={styles.dateGroup}>
                  <div style={styles.dateCol}>
                    <div style={styles.miniLabel}>Início</div>
                    <input
                      type="date"
                      value={eInicio}
                      onChange={(e) => setEInicio(e.target.value)}
                      style={{ ...styles.input, minWidth: 190 }}
                      disabled={!canMutate}
                    />
                  </div>

                  <div style={styles.dateCol}>
                    <div style={styles.miniLabel}>Fim (opcional)</div>
                    <input
                      type="date"
                      value={eFim || ""}
                      onChange={(e) => setEFim(e.target.value)}
                      style={{ ...styles.input, minWidth: 190 }}
                      disabled={!canMutate}
                    />
                  </div>
                </div>

                <label style={styles.checkLabel} title="Limite automático por categoria (mensal)">
                  <input
                    type="checkbox"
                    checked={eModoLimiteAuto}
                    onChange={(e) => setEModoLimiteAuto(e.target.checked)}
                    disabled={!canMutate}
                  />
                  Limite por categoria (auto)
                </label>

                {eModoLimiteAuto ? (
                  <select
                    value={eCategoriaLimite}
                    onChange={(e) => setECategoriaLimite(e.target.value)}
                    style={styles.select}
                    disabled={!canMutate}
                  >
                    {(categoriasLanc.length ? categoriasLanc : ["Outros"]).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : null}

                <div style={styles.iconBlock}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={styles.miniLabel}>Ícone</div>

                    <button
                      type="button"
                      onClick={() => setUiIconsEditOpen(v => !v)}
                      style={styles.smallBtn}
                      disabled={!canMutate}
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
                      disabled={!canMutate}
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
                          disabled={!canMutate}
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
                          disabled={!canMutate}
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
                  value={eCor}
                  onChange={(e) => setECor(e.target.value)}
                  style={{ ...styles.input, minWidth: 160 }}
                  placeholder="#2563EB"
                  title="Cor (hex)"
                  disabled={!canMutate}
                />

                <label style={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={eDesafioAtivo}
                    onChange={(e) => setEDesafioAtivo(e.target.checked)}
                    disabled={!canMutate}
                  />
                  Modo desafio
                </label>

                {eDesafioAtivo ? (
                  <select
                    value={eDesafioFreq}
                    onChange={(e) => setEDesafioFreq(e.target.value)}
                    style={styles.select}
                    disabled={!canMutate}
                  >
                    <option value="diario">Diário</option>
                    <option value="semanal">Semanal</option>
                  </select>
                ) : null}

                <label style={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={eLembreteAtivo}
                    onChange={(e) => setELembreteAtivo(e.target.checked)}
                    disabled={!canMutate}
                  />
                  Lembrete
                </label>

                {eLembreteAtivo ? (
                  <input
                    type="time"
                    value={eLembreteHora}
                    onChange={(e) => setELembreteHora(e.target.value)}
                    style={{ ...styles.input, minWidth: 140 }}
                    disabled={!canMutate}
                  />
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => setEditOpen(false)} style={styles.secondaryBtn}>
                  Cancelar
                </button>
                <button onClick={salvarEditar} style={styles.primaryBtn} disabled={!canMutate}>
                  ✅ Salvar alterações
                </button>
              </div>

              {!canMutate ? (
                <div style={styles.lockNote}>
                  🔒 Assinatura necessária para editar metas.
                </div>
              ) : null}
            </div>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}

function CollapseSection({ id, title, subtitle, open, onToggle, children }) {
  return (
    <div style={styles.section} id={id}>
      <button onClick={onToggle} style={styles.sectionHead}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 1000 }}>{title}</span>
          <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: 12 }}>{subtitle}</span>
        </div>
        <span style={{ color: "var(--muted)", fontWeight: 900 }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? <div style={{ marginTop: 10 }}>{children}</div> : null}
    </div>
  );
}

function MetaCard({
  meta,
  canMutate,
  archived = false,
  onAdd,
  onEdit,
  onArchive,
  onReactivate,
  onDelete,
  onCheckin,
}) {
  const pct = meta.modoLimiteAuto ? clampPct(meta.pct) : clampPct(meta.pct);
  const done = meta.modoLimiteAuto
    ? (meta.valor_alvo > 0 ? (meta.atual <= meta.valor_alvo) : true)
    : meta.done;

  const badge =
    done
      ? { txt: "Concluída", bg: "rgba(34,197,94,.15)", bd: "rgba(34,197,94,.30)", fg: "var(--text)" }
      : meta.isLate
        ? { txt: "Atrasada", bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.28)", fg: "var(--text)" }
        : meta.modoLimiteAuto
          ? { txt: `Limite: ${meta.limite_categoria || "Categoria"}`, bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.28)", fg: "var(--text)" }
          : { txt: `${pct.toFixed(0)}%`, bg: "rgba(59,130,246,.10)", bd: "rgba(59,130,246,.25)", fg: "var(--text)" };

  return (
    <div style={styles.metaCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{
            ...styles.metaIcon,
            borderColor: meta.cor || "var(--border)",
            background: "var(--controlBg)"
          }}>
            <span style={{ fontSize: 18 }}>{meta.icone || "🎯"}</span>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1000, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 520 }}>
                {meta.titulo}
              </div>

              <span style={{
                ...styles.badge,
                background: badge.bg,
                borderColor: badge.bd,
                color: badge.fg
              }}>
                {badge.txt}
              </span>

              {meta.desafio_ativo ? (
                <span style={{
                  ...styles.badge,
                  background: "rgba(245,158,11,.12)",
                  borderColor: "rgba(245,158,11,.25)",
                  color: "var(--text)"
                }}>
                  🔥 streak: {meta.streak || 0}
                </span>
              ) : null}
            </div>

            <div style={{ marginTop: 6, color: "var(--muted)", fontWeight: 900, fontSize: 13 }}>
              {meta.modoLimiteAuto ? (
                <>
                  Gasto do mês: <b style={{ color: "var(--text)" }}>{money(meta.atual)}</b>{" "}
                  de <b style={{ color: "var(--text)" }}>{money(meta.valor_alvo)}</b>{" "}
                  • {pct.toFixed(0)}%
                </>
              ) : (
                <>
                  <b style={{ color: "var(--text)" }}>{money(meta.atual)}</b>{" "}
                  de <b style={{ color: "var(--text)" }}>{money(meta.valor_alvo)}</b>{" "}
                  • {pct.toFixed(0)}% • falta{" "}
                  <b style={{ color: "var(--text)" }}>{money(meta.falta)}</b>
                </>
              )}
            </div>

            <div style={{ ...styles.progressWrap, marginTop: 10 }}>
              <div style={{
                ...styles.progressBar,
                width: `${Math.min(100, Math.max(0, pct))}%`,
                background: meta.cor || "var(--accent)"
              }} />
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={styles.micro}>
                Início: <b style={{ color: "var(--text)" }}>{formatShortDate(meta.data_inicio)}</b>
              </span>

              {meta.data_fim ? (
                <span style={styles.micro}>
                  Fim: <b style={{ color: "var(--text)" }}>{formatShortDate(meta.data_fim)}</b>
                </span>
              ) : (
                <span style={styles.micro}>Fim: <b style={{ color: "var(--text)" }}>—</b></span>
              )}

              {meta.data_fim && meta.diasRest !== null ? (
                <span style={styles.micro}>
                  Restam:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {meta.diasRest >= 0 ? `${meta.diasRest} dias` : `${Math.abs(meta.diasRest)} dias (passou)`}
                  </b>
                </span>
              ) : null}

              {!meta.modoLimiteAuto && meta.data_fim && meta.porMes ? (
                <span style={styles.micro}>
                  Ritmo: <b style={{ color: "var(--text)" }}>{money(meta.porMes)}</b>/mês
                </span>
              ) : null}

              {meta.modoLimiteAuto ? (
                meta.valor_alvo > 0 ? (
                  <span style={styles.micro}>
                    Margem:{" "}
                    <b style={{ color: "var(--text)" }}>
                      {meta.atual <= meta.valor_alvo ? money(meta.valor_alvo - meta.atual) : `excedeu ${money(meta.atual - meta.valor_alvo)}`}
                    </b>
                  </span>
                ) : null
              ) : null}
            </div>

            <div style={{ marginTop: 10, color: "var(--text)", fontWeight: 900, opacity: 0.9 }}>
              {meta.motivational}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!archived ? (
            <>
              <button
                style={styles.secondaryBtn}
                onClick={onAdd}
                disabled={!canMutate || meta.modoLimiteAuto}
                title={meta.modoLimiteAuto ? "Meta automática: progresso é calculado sozinho" : "Adicionar progresso"}
              >
                ➕ Progresso
              </button>

              {meta.desafio_ativo ? (
                <button
                  style={styles.secondaryBtn}
                  onClick={onCheckin}
                  disabled={!canMutate}
                  title="Registrar check-in do desafio"
                >
                  🔥 Check-in
                </button>
              ) : null}

              <button style={styles.secondaryBtn} onClick={onEdit} disabled={!canMutate}>
                ✏️ Editar
              </button>

              <button style={styles.secondaryBtn} onClick={onArchive} disabled={!canMutate}>
                🗂️ Arquivar
              </button>

              <button style={styles.dangerBtn} onClick={onDelete} disabled={!canMutate}>
                🗑️ Excluir
              </button>
            </>
          ) : (
            <>
              <button style={styles.secondaryBtn} onClick={onReactivate} disabled={!canMutate}>
                ♻️ Reativar
              </button>
              <button style={styles.dangerBtn} onClick={onDelete} disabled={!canMutate}>
                🗑️ Excluir
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <div style={{ fontWeight: 1000 }}>{title}</div>
          <button onClick={onClose} style={styles.smallBtn}>✖</button>
        </div>
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: 12,
    color: "var(--text)",
  },
  frame: {
    maxWidth: 1180,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  readOnlyBar: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(245,158,11,.30)",
    background: "rgba(245,158,11,.10)",
    color: "var(--text)",
    fontWeight: 1000,
    fontSize: 13,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
    marginBottom: 10,
  },
  card: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 10px 24px rgba(0,0,0,.06)",
  },
  cardPad: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 16,
    boxShadow: "0 10px 24px rgba(0,0,0,.06)",
  },
  cardLabel: {
    color: "var(--muted)",
    fontWeight: 1000,
    fontSize: 12,
  },
  cardValue: {
    marginTop: 6,
    fontWeight: 1100,
    fontSize: 26,
    letterSpacing: -0.4,
  },
  cardHint: {
    marginTop: 6,
    color: "var(--muted)",
    fontWeight: 900,
    fontSize: 12,
  },
  section: {
    marginTop: 12,
  },
  sectionHead: {
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
    boxShadow: "0 10px 24px rgba(0,0,0,.06)",
  },
  empty: {
    border: "1px dashed var(--border)",
    background: "var(--card)",
    borderRadius: 16,
    padding: 14,
  },
  formRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  formRow2: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
  },
  input: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    fontWeight: 900,
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
  primaryBtn: {
    border: "1px solid var(--tabActiveBorder)",
    background: "var(--tabActiveBg)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 1000,
  },
  secondaryBtn: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 1000,
  },
  dangerBtn: {
    border: "1px solid rgba(239,68,68,.35)",
    background: "rgba(239,68,68,.10)",
    color: "var(--text)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 1000,
  },
  smallBtn: {
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    color: "var(--text)",
    padding: "7px 10px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 1000,
    fontSize: 12,
  },
  checkLabel: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    color: "var(--muted)",
    fontWeight: 1000,
    userSelect: "none",
  },
  micro: {
    color: "var(--muted)",
    fontWeight: 900,
    fontSize: 12,
  },
  lockNote: {
    border: "1px solid rgba(245,158,11,.30)",
    background: "rgba(245,158,11,.10)",
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 1000,
    color: "var(--text)",
  },
  metaCard: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 18,
    padding: 12,
    boxShadow: "0 10px 24px rgba(0,0,0,.06)",
  },
  metaIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    border: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  badge: {
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "5px 10px",
    fontWeight: 1000,
    fontSize: 12,
  },
  progressWrap: {
    height: 10,
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--controlBg)",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 999,
  },
  iconBlock: {
    minWidth: 260,
    border: "1px solid var(--border)",
    background: "var(--card2)",
    borderRadius: 14,
    padding: 10,
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
    width: 38,
    height: 38,
    borderRadius: 14,
    cursor: "pointer",
    fontWeight: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dateGroup: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-end",
    border: "1px solid var(--border)",
    background: "var(--card2)",
    borderRadius: 14,
    padding: 10,
  },
  dateCol: {
    display: "grid",
    gap: 6,
  },
  miniLabel: {
    fontSize: 12,
    color: "var(--muted)",
    fontWeight: 1000,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    zIndex: 50,
  },
  modal: {
    width: "min(860px, 100%)",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    padding: 12,
    boxShadow: "0 18px 40px rgba(0,0,0,.25)",
  },
  modalHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
};
