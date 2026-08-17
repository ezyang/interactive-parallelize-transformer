/* ============================================================
   core.js — the reactive engine.
   One shared state; scrubbable numbers (.t-var), derived numbers
   (.t-out), conditionals (.t-if/.t-show), presets, widget registry,
   dimension hover cross-highlighting, URL hash persistence.
   ============================================================ */
(function () {
  "use strict";

  // ---------- defaults (see SPEC.md) ----------
  const DEFAULTS = {
    C: 4.59e14, Wici: 1.8e11, Wdcn: 6.25e9, HBM: 96e9,
    D: 8192, F: 28672, L: 80,
    B: 2e6,
    DP: 512, TP: 8, MDP: 2, MTP: 1,
    PP: 4, Mmicro: 8,
    MFU: 0.4, podSize: 8960, gpu: 0,
    E: 1, k: 1, EP: 8,
    meas: 0, effC: 0.72, effIci: 0.95, effDcn: 0.90,
    pD: 5120, pF: 13824, pL: 40, pNH: 40, pNK: 40, pH: 128, pV: 32000, pB: 16e6,
  };
  const KEYS = Object.keys(DEFAULTS);
  const state = Object.assign({}, DEFAULTS);

  // hard clamps so nothing explodes
  const LIMITS = {
    C: [1e12, 1e17], Wici: [1e9, 1e13], Wdcn: [1e8, 1e12], HBM: [1e9, 1e13],
    D: [128, 262144], F: [128, 1048576], L: [1, 1000],
    B: [1, 1e10],
    DP: [1, 1048576], TP: [1, 8192], MDP: [1, 3], MTP: [1, 3],
    PP: [1, 64], Mmicro: [1, 128],
    MFU: [0.05, 1], podSize: [1, 65536], gpu: [0, 1],
    E: [1, 2048], k: [1, 64], EP: [1, 1024],
    meas: [0, 1], effC: [0.2, 1], effIci: [0.2, 1], effDcn: [0.2, 1],
    pD: [128, 65536], pF: [128, 262144], pL: [1, 500], pNH: [1, 512], pNK: [1, 512],
    pH: [16, 1024], pV: [1000, 1e6], pB: [1, 1e10],
  };

  function clamp(k, v) {
    const lim = LIMITS[k];
    if (!lim || !isFinite(v)) return v;
    return Math.min(lim[1], Math.max(lim[0], v));
  }

  // ---------- effective hardware (spec vs measured) ----------
  // When meas = 1, every consumer of C / Wici / Wdcn — expressions, widgets,
  // derived values — sees the sustained values (spec × the eff* factors).
  // The raw spec numbers stay in state (the top-bar scrubs edit those) and
  // remain reachable in expressions as Cspec / WiciSpec / WdcnSpec.
  function effOf(key) {
    const f = { C: "effC", Wici: "effIci", Wdcn: "effDcn" }[key];
    return state.meas ? state[key] * state[f] : state[key];
  }
  function effState() {
    const es = Object.assign({}, state);
    es.C = effOf("C"); es.Wici = effOf("Wici"); es.Wdcn = effOf("Wdcn");
    es.Cspec = state.C; es.WiciSpec = state.Wici; es.WdcnSpec = state.Wdcn;
    return es;
  }

  // ---------- derived + expression evaluation ----------
  const MATH_KEYS = ["sqrt", "min", "max", "pow", "ceil", "floor", "round", "abs", "exp", "PI"];
  const SPEC_KEYS = ["Cspec", "WiciSpec", "WdcnSpec"];
  const EXPR_ARGS = KEYS.concat(["N", "alpha", "alphaDcn", "P", "log2", "log10"]).concat(SPEC_KEYS).concat(MATH_KEYS);

  function derivedVals() {
    return {
      N: state.DP * state.TP,
      alpha: effOf("C") / effOf("Wici"),
      alphaDcn: effOf("C") / effOf("Wdcn"),
      // F is per-expert width (chapter-12 convention): weights scale with E·F
      P: 2 * state.D * state.E * state.F * state.L,
      log2: Math.log2, log10: Math.log10,
    };
  }
  function exprArgValues() {
    const d = derivedVals();
    const es = effState();
    const vals = KEYS.map((k) => es[k]);
    vals.push(d.N, d.alpha, d.alphaDcn, d.P, d.log2, d.log10);
    for (const sk of SPEC_KEYS) vals.push(es[sk]);
    for (const mk of MATH_KEYS) vals.push(Math[mk]);
    return vals;
  }

  const exprCache = new Map();
  function evalExpr(src) {
    let fn = exprCache.get(src);
    if (!fn) {
      try {
        fn = new Function(...EXPR_ARGS, '"use strict"; return (' + src + ");");
      } catch (e) {
        console.error("Bad expression:", src, e);
        fn = () => NaN;
      }
      exprCache.set(src, fn);
    }
    return function () {
      try { return fn.apply(null, exprArgValues()); }
      catch (e) { console.error("Expression failed:", src, e); return NaN; }
    };
  }
  function evalNow(src) { return evalExpr(src)(); }

  // ---------- formatting ----------
  const thou = (x) => x.toLocaleString("en-US", { maximumFractionDigits: 0 });

  function siFmt(x, digits) {
    if (!isFinite(x)) return "∞";
    const neg = x < 0 ? "−" : "";
    x = Math.abs(x);
    if (x === 0) return "0";
    const units = [
      [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"],
    ];
    for (const [mag, suf] of units) {
      if (x >= mag) {
        const v = x / mag;
        const d = digits != null ? digits : v >= 100 ? 0 : v >= 10 ? 1 : 2;
        return neg + trimZeros(v.toFixed(d)) + suf;
      }
    }
    if (x >= 100 || x === Math.round(x)) return neg + thou(Math.round(x));
    return neg + trimZeros(x.toPrecision(3));
  }
  function trimZeros(s) { return s.indexOf(".") >= 0 ? s.replace(/\.?0+$/, "") : s; }

  function bytesFmt(x) {
    if (!isFinite(x)) return "∞";
    const units = [[1e15, "PB"], [1e12, "TB"], [1e9, "GB"], [1e6, "MB"], [1e3, "kB"]];
    for (const [mag, suf] of units) {
      if (Math.abs(x) >= mag) return trimZeros((x / mag).toPrecision(3)) + " " + suf;
    }
    return thou(Math.round(x)) + " B";
  }

  function timeFmt(x) {
    if (!isFinite(x)) return "∞";
    if (x <= 0) return "0 s";
    const units = [
      [86400, "days", 1], [3600, "hr", 1], [60, "min", 1],
      [1, "s", 2], [1e-3, "ms", 2], [1e-6, "µs", 2], [1e-9, "ns", 1],
    ];
    for (const [mag, suf, d] of units) {
      if (x >= mag * (suf === "days" ? 2 : 1)) {
        return trimZeros((x / mag).toFixed(d)) + " " + suf;
      }
    }
    return trimZeros((x / 1e-9).toFixed(1)) + " ns";
  }

  const FMTS = {
    int: (x) => (isFinite(x) ? thou(Math.round(x)) : "∞"),
    chips: (x) => (isFinite(x) ? thou(Math.round(x)) : "∞"),
    sig3: (x) => (isFinite(x) ? (Math.abs(x) >= 1000 ? thou(Math.round(Number(x.toPrecision(3)))) : trimZeros(x.toPrecision(3))) : "∞"),
    si: (x) => siFmt(x),
    tokens: (x) => siFmt(x),
    bytes: bytesFmt,
    e: (x) => (isFinite(x) ? (x === 0 ? "0" : x.toExponential(1).replace("e+", "e")) : "∞"),
    bw: (x) => bytesFmt(x) + "/s",
    time: timeFmt,
    days: (x) => (isFinite(x) ? trimZeros((x / 86400).toFixed(1)) + " days" : "∞"),
    pct: (x) => (isFinite(x) ? trimZeros((100 * x).toFixed(Math.abs(x) < 0.1 ? 1 : 0)) + "%" : "∞"),
    x: (x) => (isFinite(x) ? trimZeros(x.toPrecision(2)) + "×" : "∞"),
  };
  // fix flops: express in proper engineering units
  FMTS.flops = function (x) {
    if (!isFinite(x)) return "∞";
    const units = [[1e18, "EFLOP/s"], [1e15, "PFLOP/s"], [1e12, "TFLOP/s"], [1e9, "GFLOP/s"]];
    for (const [mag, suf] of units) if (x >= mag) return trimZeros((x / mag).toPrecision(3)) + " " + suf;
    return siFmt(x) + " FLOP/s";
  };

  function fmt(value, name) {
    const f = FMTS[name || "sig3"] || FMTS.sig3;
    return f(value);
  }

  // ---------- pub/sub ----------
  const subs = [];
  let notifying = false;
  function subscribe(fn) { subs.push(fn); }
  function notify() {
    if (notifying) return; // no re-entrancy
    notifying = true;
    for (const fn of subs) {
      try { fn(state); } catch (e) { console.error("subscriber failed", e); }
    }
    notifying = false;
    scheduleHash();
  }

  function set(patch) {
    let changed = false;
    for (const k in patch) {
      if (!(k in state)) { console.warn("unknown state key", k); continue; }
      const v = clamp(k, Number(patch[k]));
      if (isFinite(v) && state[k] !== v) { state[k] = v; changed = true; }
    }
    if (changed) notify();
  }

  // The reset button is for the scrubs. Keys owned by the top-bar pickers —
  // model shape, hardware, spec/measured — survive a reset (the dropdowns are
  // easy to change on their own).
  const PRESET_KEYS = ["D", "F", "L", "E", "k",
    "C", "Wici", "Wdcn", "HBM", "podSize", "gpu", "MDP", "MTP",
    "effC", "effIci", "effDcn", "meas"];
  const RESET_KEYS = KEYS.filter((k) => PRESET_KEYS.indexOf(k) < 0);
  function resetAll() {
    for (const k of RESET_KEYS) state[k] = DEFAULTS[k];
    notify();
  }

  // ---------- URL hash persistence ----------
  // Settled changes push history entries, so the browser's back/forward
  // walk through your earlier configurations (popstate applies them below).
  let hashTimer = null;
  function scheduleHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const diff = [];
      for (const k of KEYS) {
        if (state[k] !== DEFAULTS[k]) diff.push(k + "=" + encodeURIComponent(compactNum(state[k])));
      }
      const h = diff.length ? "#" + diff.join("&") : "";
      if ((location.hash || "") === h) return; // unchanged — no new entry
      history.pushState(null, "", h || location.pathname + location.search);
    }, 300);
  }
  function compactNum(x) {
    if (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0)) {
      return x.toExponential(4).replace(/\.?0+e/, "e").replace("e+", "e");
    }
    return String(x);
  }
  // pre-rename hash keys (old shared URLs) → today's state keys
  const HASH_ALIASES = { X: "DP", Y: "TP", Z: "PP", MX: "MDP", MY: "MTP" };
  function loadHash() {
    if (!location.hash || location.hash.length < 2) return;
    const patch = {};
    for (const pair of location.hash.slice(1).split("&")) {
      let [k, v] = pair.split("=");
      if (HASH_ALIASES[k]) k = HASH_ALIASES[k];
      if (k in DEFAULTS && v !== undefined) {
        const n = Number(decodeURIComponent(v));
        if (isFinite(n)) patch[k] = n;
      }
    }
    for (const k in patch) state[k] = clamp(k, patch[k]);
  }
  // back/forward: re-apply the state a hash entry recorded. Plain #anchor
  // hashes (no "=") are TOC navigation — leave the state alone.
  window.addEventListener("popstate", () => {
    const h = location.hash.slice(1);
    if (h && h.indexOf("=") < 0) return;
    Object.assign(state, DEFAULTS);
    loadHash();
    notify(); // scheduleHash re-derives the same hash and pushes nothing
  });

  // ---------- snapping ----------
  const SNAPS = {
    pow2: (v) => Math.pow(2, Math.round(Math.log2(Math.max(1, v)))),
    int: (v) => Math.round(v),
    "125": (v) => {
      if (v <= 0) return v;
      const exp = Math.floor(Math.log10(v));
      const base = Math.pow(10, exp);
      const m = v / base;
      const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
      return nice * base;
    },
  };

  // ---------- instant provenance tooltip (replaces slow native title) ----------
  // One transient hover card + a STACK of pinned cards (recursive: tokens
  // inside a pinned card carry their own tooltips, pinnable in turn).
  let hoverCard = null;            // { el, anchor } — the transient card
  const pinnedCards = [];          // [{ el, anchor, refreshers }]
  let cardZ = 120;

  function makeCard(isPinned) {
    const el = document.createElement("div");
    el.className = "hover-tip" + (isPinned ? " pinned" : "");
    el.style.display = "block";
    el.style.zIndex = ++cardZ;
    document.body.appendChild(el);
    return el;
  }
  function renderRows(cardEl, rows, refreshers) {
    cardEl.textContent = "";
    for (const r of rows) {
      const row = document.createElement("div");
      if (r.cls) row.className = r.cls;
      if (r.el) row.appendChild(r.el);
      else row.textContent = r.text;
      if (r.refresh && refreshers) refreshers.push({ el: row, fn: r.refresh });
      cardEl.appendChild(row);
    }
  }
  function placeCard(cardEl, anchorEl, entry) {
    const er = anchorEl.getBoundingClientRect();
    if (!er.width && !er.height) return false; // anchor hidden or gone
    const tw = cardEl.offsetWidth, th = cardEl.offsetHeight;
    let x = er.left + er.width / 2 - tw / 2;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    let y = er.bottom + 8;
    if (y + th > window.innerHeight - 8) y = er.top - th - 8;
    if (entry) { x += entry.dx || 0; y += entry.dy || 0; } // user-dragged offset
    cardEl.style.left = x + "px";
    cardEl.style.top = y + "px";
    return true;
  }
  function hideHoverTip() {
    if (hoverCard) { hoverCard.el.remove(); hoverCard = null; }
  }
  function pinnedFor(anchor) { return pinnedCards.find((p) => p.anchor === anchor); }
  function unpinEntry(entry) {
    const i = pinnedCards.indexOf(entry);
    if (i < 0) return;
    pinnedCards.splice(i, 1);
    // cascade: cards anchored inside this card go with it
    const children = pinnedCards.filter((p) => entry.el.contains(p.anchor));
    entry.el.remove();
    for (const c of children) unpinEntry(c);
  }
  function unpinAll() { while (pinnedCards.length) unpinEntry(pinnedCards[pinnedCards.length - 1]); }

  window.addEventListener("scroll", () => {
    hideHoverTip();
    for (const p of [...pinnedCards]) {
      if (!placeCard(p.el, p.anchor, p)) unpinEntry(p);
    }
  }, { capture: true, passive: true });
  document.addEventListener("pointerdown", (ev) => {
    if (!pinnedCards.length) return;
    const inside = pinnedCards.some((p) => p.el.contains(ev.target) || p.anchor.contains(ev.target));
    if (!inside) unpinAll();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && pinnedCards.length) unpinEntry(pinnedCards[pinnedCards.length - 1]);
  });
  // pinned cards re-render their live rows and track their anchors on every state change
  subscribe(() => {
    for (const p of [...pinnedCards]) {
      for (const r of p.refreshers) { try { r.el.textContent = r.fn(); } catch (e) { /* transient */ } }
      placeCard(p.el, p.anchor, p);
    }
  });

  const IDENT_RE = /(?<![\w.])[A-Za-z_][A-Za-z0-9_]*/g;

  // English names for every state key (green tooltips + in-tip scrub tokens)
  const KEY_NAMES = {
    C: "Chip speed — peak FLOPs/s", Wici: "In-pod bandwidth, per axis (ICI / NVLink egress)",
    Wdcn: "Cross-pod bandwidth per chip (DCN / InfiniBand)", HBM: "HBM capacity per chip",
    D: "d_model — the hidden dimension", F: "Feed-forward width of one expert (d_ff when dense)",
    L: "Layers", B: "Batch — total tokens per step",
    DP: "Data / FSDP parallel shards (a mesh axis; the chapter's X)", TP: "Tensor-parallel shards (a mesh axis; the chapter's Y)",
    MDP: "Hardware mesh axes carrying the data/FSDP sharding", MTP: "Hardware mesh axes carrying the tensor sharding",
    PP: "Pipeline stages (the chapter's Z)", Mmicro: "Microbatches",
    MFU: "Assumed model FLOPs utilization for wall-clock estimates — always applied against SPEC peak (Cspec), so measured mode doesn't double-count the GEMM shortfall", podSize: "Chips per pod (ICI / NVLink domain)",
    gpu: "GPU switched-fabric flag (0 = TPU mesh)", E: "Experts per layer (total, incl. shared)",
    k: "Experts activated per token (incl. shared)", EP: "Expert-parallel degree (chapter 12's Z)",
    meas: "0 = spec sheet numbers, 1 = measured/sustained (spec × the eff factors)",
    effC: "Sustained GEMM fraction of spec peak compute (see the hardware table's citations)",
    effIci: "Achieved collective fraction of spec in-pod bandwidth",
    effDcn: "Achieved fraction of spec cross-pod bandwidth",
    pD: "Problem model — d_model", pF: "Problem model — d_ff", pL: "Problem model — layers",
    pNH: "Problem model — query heads", pNK: "Problem model — KV heads",
    pH: "Problem model — head dim", pV: "Problem model — vocab size", pB: "Problem batch — tokens",
  };
  // derived names drill down to their own definitions inside a pinned tip
  const DERIVED_DEFS = {
    N: { expr: "DP*TP", name: "total chips" },
    alpha: { expr: "C/Wici", name: "ICI arithmetic intensity — the ridge" },
    alphaDcn: { expr: "C/Wdcn", name: "DCN arithmetic intensity" },
    P: { expr: "2*D*E*F*L", name: "MLP-stack parameter count" },
  };

  // a scrubbable variable token inside the tooltip (usable once pinned)
  function makeTipVar(key) {
    const s = document.createElement("span");
    s.className = "tip-scrub";
    s.textContent = key;
    let sx = 0, sv = 0, drag = false;
    s.addEventListener("pointerdown", (ev) => {
      drag = true; sx = ev.clientX; sv = state[key];
      s.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      ev.stopPropagation();
    });
    s.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const dx = ev.clientX - sx;
      const lim = LIMITS[key] || [1e-9, 1e18];
      let v;
      if (lim[1] / Math.max(lim[0], 1e-9) > 100) v = sv * Math.pow(10, dx / 160);
      else v = sv + (dx / 300) * (lim[1] - lim[0]);
      if (DEFAULTS[key] === Math.round(DEFAULTS[key]) && lim[1] <= 1e4) v = Math.round(v);
      set({ [key]: clamp(key, v) });
    });
    const end = () => { drag = false; };
    s.addEventListener("pointerup", end);
    s.addEventListener("pointercancel", end);
    s.addEventListener("lostpointercapture", end);
    const lim = LIMITS[key] || [0, 1e18];
    attachHoverTip(s, () => [
      { cls: "tip-label", text: KEY_NAMES[key] || key },
      { cls: "tip-code", text: key + " = " + shortNum(state[key]) },
      { cls: "tip-sub", text: "range " + shortNum(lim[0]) + " … " + shortNum(lim[1]) + " · drag ⟷" },
    ]);
    return s;
  }

  // a derived-name token: hover shows its definition; click pins it as
  // another card whose own tokens are scrubbable/pinnable — recursion all the way down
  function makeTipDerived(id) {
    const s = document.createElement("span");
    s.className = "tip-drv";
    s.textContent = id;
    const d = DERIVED_DEFS[id];
    const line = () => "= " + substituted(d.expr) + "  =  " + fmt(evalNow(d.expr), id === "P" ? "si" : "sig3");
    attachHoverTip(s, () => [
      { cls: "tip-label", text: d.name + " — click to pin" },
      { cls: "tip-code", el: exprRowEl(d.expr) },
      { cls: "tip-sub", text: line(), refresh: line },
    ], { pinnable: true });
    return s;
  }

  // render an expression with its variables live: state keys scrubbable,
  // derived names drillable, everything else plain text
  function exprRowEl(expr) {
    const el = document.createElement("span");
    let last = 0, m;
    IDENT_RE.lastIndex = 0;
    while ((m = IDENT_RE.exec(expr))) {
      if (m.index > last) el.appendChild(document.createTextNode(expr.slice(last, m.index).replace(/\*/g, "·")));
      const id = m[0];
      if (id in state) el.appendChild(makeTipVar(id));
      else if (id in DERIVED_DEFS) el.appendChild(makeTipDerived(id));
      else el.appendChild(document.createTextNode(id));
      last = m.index + id.length;
    }
    if (last < expr.length) el.appendChild(document.createTextNode(expr.slice(last).replace(/\*/g, "·")));
    return el;
  }
  function shortNum(v) {
    if (!isFinite(v)) return "∞";
    if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) {
      return v.toExponential(2).replace(/\.?0+e/, "e").replace("e+", "e");
    }
    return Math.abs(v) >= 1000 ? thou(Math.round(v)) : String(Number(v.toPrecision(4)));
  }
  // the expr with every variable replaced by its current value: provenance made concrete
  function substituted(expr) {
    const d = derivedVals();
    const es = effState();
    return expr
      .replace(IDENT_RE, (m) => {
        if (m in es) return shortNum(es[m]);
        if (m === "N" || m === "alpha" || m === "alphaDcn" || m === "P") return shortNum(d[m]);
        return m;
      })
      .replace(/\*/g, "·");
  }
  // rowsFn() -> [{cls, text | el, refresh}] — rows with `el` mount a prebuilt
  // element (e.g. a scrubbable formula); rows with `refresh` re-render live while
  // pinned. opts.pinnable: clicking pins the card; cards stack recursively; click
  // an anchor again / click outside all cards / Esc (top card first) dismisses.
  function attachHoverTip(el, rowsFn, opts) {
    el.addEventListener("pointerenter", () => {
      if (pinnedFor(el)) return; // its card is already pinned
      hideHoverTip();
      const card = makeCard(false);
      renderRows(card, rowsFn(), null);
      hoverCard = { el: card, anchor: el };
      placeCard(card, el);
    });
    el.addEventListener("pointerleave", hideHoverTip);
    el.addEventListener("pointercancel", hideHoverTip);
    if (opts && opts.pinnable) {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const existing = pinnedFor(el);
        if (existing) { unpinEntry(existing); return; }
        hideHoverTip();
        const card = makeCard(true);
        const refreshers = [];
        renderRows(card, rowsFn(), refreshers);
        const entry = { el: card, anchor: el, refreshers, dx: 0, dy: 0 };
        pinnedCards.push(entry);
        placeCard(card, el, entry);
        // the label row doubles as a drag handle: move the card out of the way
        const handle = card.querySelector(".tip-label") || card.firstChild;
        if (handle) {
          handle.classList.add("tip-handle");
          let hx = 0, hy = 0, dragging = false;
          handle.addEventListener("pointerdown", (ev) => {
            dragging = true; hx = ev.clientX - entry.dx; hy = ev.clientY - entry.dy;
            handle.setPointerCapture(ev.pointerId);
            ev.preventDefault(); ev.stopPropagation();
          });
          handle.addEventListener("pointermove", (ev) => {
            if (!dragging) return;
            entry.dx = ev.clientX - hx; entry.dy = ev.clientY - hy;
            placeCard(card, el, entry);
          });
          const end = () => { dragging = false; };
          handle.addEventListener("pointerup", end);
          handle.addEventListener("pointercancel", end);
          handle.addEventListener("lostpointercapture", end);
        }
      });
    }
  }

  // ---------- scrubbable numbers ----------
  function initVar(el) {
    const key = el.dataset.var;
    if (!(key in state)) { console.warn("t-var unknown key", key); return; }
    const min = el.dataset.min != null ? Number(el.dataset.min) : (LIMITS[key] ? LIMITS[key][0] : 1);
    const max = el.dataset.max != null ? Number(el.dataset.max) : (LIMITS[key] ? LIMITS[key][1] : 1e9);
    const scale = el.dataset.scale || (max / Math.max(min, 1e-9) > 100 ? "log" : "lin");
    const snap = el.dataset.snap ? SNAPS[el.dataset.snap] : (state[key] === Math.round(state[key]) && max <= 1e4 ? SNAPS.int : null);
    const fmtName = el.dataset.fmt || "si";
    const stepAttr = el.dataset.step != null ? Number(el.dataset.step) : null;

    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "slider");
    el.setAttribute("aria-valuemin", String(min));
    el.setAttribute("aria-valuemax", String(max));
    // in measured mode the green C/W numbers show (and edit) the EFFECTIVE
    // value the page actually computes with; the spec value stays in state
    const EFF_KEY = { C: "effC", Wici: "effIci", Wdcn: "effDcn" }[key];
    const effF = () => (EFF_KEY && state.meas ? state[EFF_KEY] : 1);
    const shown = () => state[key] * effF();

    const codeLine = () => key + " = " + shortNum(shown()) +
      (effF() !== 1 ? "   (measured — spec " + shortNum(state[key]) + " × " + shortNum(state[EFF_KEY]) + ")" : "");
    attachHoverTip(el, () => [
      { cls: "tip-label", text: KEY_NAMES[key] || key },
      { cls: "tip-code", text: codeLine(), refresh: codeLine },
      { cls: "tip-sub", text: "range " + shortNum(min) + " … " + shortNum(max) + (el.dataset.snap ? " · snaps to " + el.dataset.snap : "") + " · drag ⟷ · double-click to type (blank = reset)" },
    ]);

    let editing = false;
    function render() {
      if (editing) return; // don't clobber the reader's typing
      el.textContent = fmt(shown(), fmtName);
      el.setAttribute("aria-valuenow", String(shown()));
      el.setAttribute("aria-valuetext", fmt(shown(), fmtName));
    }
    subscribe(render);
    render();

    // ---- type-in editing: double-click, type an exact value, Enter/blur commits,
    // Escape cancels, committing an EMPTY field reverts to the default ----
    function parseTyped(s) {
      s = s.trim().replace(/,/g, "");
      if (s === "") return DEFAULTS[key]; // blank = reset
      let mult = 1;
      if (/%$/.test(s)) { mult = 0.01; s = s.slice(0, -1); }
      const m = s.match(/^[-+]?(\d*\.?\d+(?:[eE][-+]?\d+)?)\s*([kKMmBbGgTt]?)$/);
      if (!m) return null;
      const suf = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, g: 1e9, G: 1e9, t: 1e12, T: 1e12 }[m[2]] || 1;
      return Number(m[1]) * suf * mult;
    }
    function startEdit() {
      if (editing) return;
      editing = true;
      hideHoverTip();
      el.classList.add("editing");
      el.setAttribute("contenteditable", "plaintext-only");
      if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
      el.textContent = compactNum(shown());
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    function endEdit(commit) {
      if (!editing) return;
      const typed = el.textContent;
      editing = false;
      el.removeAttribute("contenteditable");
      el.classList.remove("editing");
      if (commit) {
        let v = parseTyped(typed);
        if (v != null && isFinite(v)) {
          // typed values are exact: clamp to range but do NOT snap.
          // (a blank commit already came back as the raw default; anything
          // typed is in DISPLAY units — divide the measured factor back out)
          if (typed.trim() !== "") v = v / effF();
          set({ [key]: clamp(key, Math.min(max, Math.max(min, v))) });
        }
      }
      render();
    }
    el.addEventListener("dblclick", (ev) => { ev.preventDefault(); startEdit(); });
    el.addEventListener("blur", () => endEdit(true));

    function apply(raw) {
      let v = Math.min(max, Math.max(min, raw));
      if (snap) v = Math.min(max, Math.max(min, snap(v)));
      if (stepAttr) v = Math.round(v / stepAttr) * stepAttr;
      set({ [key]: v });
    }

    // pointer drag
    let startX = 0, startV = 0, dragging = false, moved = false;
    el.addEventListener("pointerdown", (ev) => {
      if (editing) return; // typing mode: leave the caret alone
      dragging = true; moved = false;
      startX = ev.clientX; startV = state[key];
      el.setPointerCapture(ev.pointerId);
      el.classList.add("dragging");
      document.body.style.cursor = "ew-resize";
      ev.preventDefault();
    });
    el.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      if (scale === "log") {
        apply(startV * Math.pow(10, dx / 160));
      } else {
        const span = max - min;
        apply(startV + (dx / 300) * span);
      }
    });
    function endDrag() {
      dragging = false;
      el.classList.remove("dragging");
      document.body.style.cursor = "";
    }
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    // lostpointercapture fires on every capture-release path (including releases
    // outside the window) — without it the ew-resize cursor can stick page-wide
    el.addEventListener("lostpointercapture", endDrag);
    window.addEventListener("blur", endDrag);
    el.addEventListener("keydown", (ev) => {
      if (editing) {
        if (ev.key === "Enter") { ev.preventDefault(); endEdit(true); }
        else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); endEdit(false); }
        return; // everything else (digits, arrows, selection) belongs to the caret
      }
      if (ev.key === "Enter") { ev.preventDefault(); startEdit(); return; }
      const dir = ev.key === "ArrowUp" || ev.key === "ArrowRight" ? 1 : ev.key === "ArrowDown" || ev.key === "ArrowLeft" ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      const cur = state[key];
      let next;
      if (snap === SNAPS.pow2) next = cur * Math.pow(2, dir);
      else if (scale === "log") next = dir > 0 ? cur * (snap === SNAPS["125"] ? 2 : 1.25) : cur / (snap === SNAPS["125"] ? 2 : 1.25);
      else next = cur + dir * (stepAttr || Math.max(1, Math.round((max - min) / 100)));
      apply(next);
    });
  }

  // ---------- derived outputs ----------
  function initOut(el) {
    const expr = el.dataset.expr || "NaN";
    const get = evalExpr(expr);
    const fmtName = el.dataset.fmt || "sig3";
    const subLine = () => "= " + substituted(expr) + "  =  " + fmt(get(), fmtName);
    attachHoverTip(el, () => [
      { cls: "tip-label", text: "computed live — click to pin, then scrub the green names" },
      { cls: "tip-code", el: exprRowEl(expr) },
      { cls: "tip-sub", text: subLine(), refresh: subLine },
    ], { pinnable: true });
    function render() { el.textContent = fmt(get(), fmtName); }
    subscribe(render);
    render();
  }

  function initIf(el) {
    const expr = el.dataset.expr || "false";
    const get = evalExpr(expr);
    const thenT = el.dataset.then || "yes";
    const elseT = el.dataset.else || "no";
    const verdictLine = () => substituted(expr) + "  →  " + (get() ? "true" : "false");
    attachHoverTip(el, () => [
      { cls: "tip-label", text: "live verdict — true when (click to pin, then scrub)" },
      { cls: "tip-code", el: exprRowEl(expr) },
      { cls: "tip-sub", text: verdictLine(), refresh: verdictLine },
    ], { pinnable: true });
    function render() {
      const ok = !!get();
      el.textContent = ok ? thenT : elseT;
      el.classList.toggle("t-if-true", ok);
      el.classList.toggle("t-if-false", !ok);
    }
    subscribe(render);
    render();
  }

  function initShow(el) {
    const get = evalExpr(el.dataset.expr || "true");
    function render() { el.hidden = !get(); }
    subscribe(render);
    render();
  }

  // ---------- presets ----------
  function initPreset(el) {
    let patch = {};
    try { patch = JSON.parse(el.dataset.set || "{}"); } catch (e) { console.error("bad preset", el); }
    el.addEventListener("click", () => set(patch));
    function render() {
      const active = Object.keys(patch).every((k) => state[k] === Number(patch[k]));
      el.classList.toggle("active", active);
    }
    subscribe(render);
    render();
  }

  // ---------- dimension hover ----------
  const dimSubs = [];
  let curDim = null;
  function dimHover(dim) {
    if (dim === curDim) return;
    if (curDim) document.documentElement.classList.remove("hl-" + curDim);
    curDim = dim;
    if (dim) document.documentElement.classList.add("hl-" + dim);
    for (const fn of dimSubs) { try { fn(dim); } catch (e) { console.error(e); } }
  }
  function onDimHover(fn) { dimSubs.push(fn); }

  // meaning tooltips for equation variable tokens; some letters are
  // context-dependent, disambiguated by the token's own text
  function dimMeaning(dim, el) {
    const txt = el.textContent || "";
    switch (dim) {
      case "B": return ["batch — total tokens per step, across all devices", "B = " + fmt(state.B, "tokens")];
      case "D": return ["d_model — the hidden / residual-stream dimension", "D = " + fmt(state.D, "int")];
      case "F": return ["feed-forward width of ONE expert (for a dense model, simply d_ff). A token multiplies through k·F; weights hold E·F.",
        "F = " + fmt(state.F, "int") + (state.k > 1 ? "   k·F = " + fmt(state.k * state.F, "int") + "   E·F = " + fmt(state.E * state.F, "si") : "")];
      case "L": return ["number of layers in the model", "L = " + fmt(state.L, "int")];
      case "T": return ["sequence length (the page doesn't track it — batch B is already in tokens)", "T — static"];
      case "DP": return ["chips on the data/FSDP-parallel mesh axis (the chapter's X)", "DP = " + fmt(state.DP, "int")];
      case "TP": return ["chips on the tensor-parallel mesh axis (the chapter's Y)", "TP = " + fmt(state.TP, "int")];
      case "N": return ["total chips in the slice, N = DP·TP", "N = " + fmt(state.DP * state.TP, "int")];
      case "C": return [state.meas ? "matmul FLOPs/s of one chip — MEASURED mode: sustained = spec × " + fmt(state.effC, "sig3") : "peak matmul FLOPs/s of one chip",
        "C = " + fmt(effOf("C"), "flops") + (state.meas ? "  (spec " + fmt(state.C, "flops") + ")" : "")];
      case "W":
        if (/dcn/i.test(txt)) return ["cross-pod (DCN / InfiniBand) bandwidth per chip" + (state.meas ? " — measured" : ""), "W_dcn = " + fmt(effOf("Wdcn"), "bw") + (state.meas ? "  (spec " + fmt(state.Wdcn, "bw") + ")" : "")];
        if (/ici/i.test(txt)) return ["in-pod interconnect bandwidth per axis (ICI; NVLink egress under GPU presets)" + (state.meas ? " — measured" : ""), "W_ici = " + fmt(effOf("Wici"), "bw") + (state.meas ? "  (spec " + fmt(state.Wici, "bw") + ")" : "")];
        return ["network bandwidth — W_ici in-pod, W_dcn between pods", "W_ici = " + fmt(effOf("Wici"), "bw") + "   W_dcn = " + fmt(effOf("Wdcn"), "bw")];
      case "PP": return ["pipeline stages (the pipelining section's Z)", "PP = " + fmt(state.PP, "int")];
      case "EP": return ["expert-parallel degree (chapter 12's Z)", "EP = " + fmt(state.EP, "int")];
      case "E": return ["experts per layer — total holding weights, counting shared", "E = " + fmt(state.E, "int") + "   E·F = " + fmt(state.E * state.F, "si")];
      case "k": return ["experts activated per token, counting shared", "k = " + fmt(state.k, "int") + "   k·F = " + fmt(state.k * state.F, "int")];
      case "M":
        if (/micro/i.test(txt)) return ["number of microbatches in the pipeline", "M_micro = " + fmt(state.Mmicro, "int")];
        if (/DP/.test(txt.replace(/^M/, ""))) return ["hardware mesh axes carrying the data/FSDP sharding", "M_DP = " + fmt(state.MDP, "int")];
        if (/TP/.test(txt.replace(/^M/, ""))) return ["hardware mesh axes carrying the tensor sharding", "M_TP = " + fmt(state.MTP, "int")];
        return ["mesh-axes multiplier (M_DP / M_TP), or the chips per ICI slice in the pods section", "M_DP = " + fmt(state.MDP, "int") + "   M_TP = " + fmt(state.MTP, "int") + "   slice = " + fmt(state.podSize, "int")];
      default: return null;
    }
  }

  function initDimTokens(root) {
    root.querySelectorAll(".v").forEach((el) => {
      const cls = Array.from(el.classList).find((c) => /^v-[A-Za-z]+$/.test(c));
      if (!cls) return;
      const dim = cls.slice(2);
      el.addEventListener("mouseenter", () => dimHover(dim));
      el.addEventListener("mouseleave", () => dimHover(null));
      attachHoverTip(el, () => {
        const m = dimMeaning(dim, el);
        return m ? [{ cls: "tip-label", text: m[0] }, { cls: "tip-code", text: m[1], refresh: () => dimMeaning(dim, el)[1] }] : [];
      }, { pinnable: true });
    });
  }

  // ---------- hardware terminology layer ----------
  // The chapter speaks TPU; under a GPU preset the same sentences read in GPU
  // vocabulary. <span class="tm">TPUs</span> or <span class="tm" data-g="…">.
  // TPU mode always shows the chapter's exact words (the element's own text).
  const TERM_G = {
    TPU: "GPU", TPUs: "GPUs", ICI: "NVLink", DCN: "InfiniBand",
    MXU: "tensor core", MXUs: "tensor cores",
    pod: "node", pods: "nodes", Pod: "Node", Pods: "Nodes",
  };
  function initTermTokens(root) {
    const toks = [];
    root.querySelectorAll(".tm").forEach((el) => {
      const t = el.textContent;
      const g = el.dataset.g != null ? el.dataset.g : (TERM_G[t.trim()] || t);
      toks.push({ el, t, g });
    });
    if (!toks.length) return;
    let cur = null;
    const render = () => {
      const gm = state.gpu >= 0.5;
      if (gm === cur) return;
      cur = gm;
      for (const k of toks) k.el.textContent = gm ? k.g : k.t;
      scheduleMarginLayout();
    };
    subscribe(render);
    render();
  }

  // ---------- shape tokenizer ----------
  // Inside <span class="shape">…</span> einsum notation, wrap bare dimension
  // letters and axis subscripts as .v tokens so they get the same colors and
  // hover meanings as everywhere else. Runs before initDimTokens.
  function initShapeTokens(root) {
    const LETTER_RE = /\b([BDFLTEk])\b/;
    root.querySelectorAll(".shape").forEach((sh) => {
      sh.querySelectorAll("sub").forEach((sub) => {
        const t = sub.textContent.trim();
        if (/^(B|D|F|L|T|DP|TP|EP|PP)$/.test(t) && !sub.closest(".v")) {
          sub.classList.add("v", "v-" + t);
        }
      });
      const walker = document.createTreeWalker(sh, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && n.parentElement.closest(".v"))
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const n of nodes) {
        const parts = n.textContent.split(new RegExp(LETTER_RE.source, "g"));
        if (parts.length < 2) continue;
        const frag = document.createDocumentFragment();
        parts.forEach((p, i) => {
          if (i % 2) {
            const el = document.createElement("i");
            el.className = "v v-" + p;
            el.textContent = p;
            frag.appendChild(el);
          } else if (p) frag.appendChild(document.createTextNode(p));
        });
        n.parentNode.replaceChild(frag, n);
      }
    });
  }

  // ---------- live table rows ----------
  // In a table whose rows carry .t-preset[data-set] loaders, cells annotated
  // data-live="D|F|…" (a state key) or data-live-expr="k*F" grow a live twin;
  // when the page state matches a row's preset, that row shows the live
  // (scrubbable/computed) values instead of its printed ones.
  const LIVE_VAR_ATTRS = {
    D: { min: "512", max: "65536", snap: "pow2", fmt: "int" },
    F: { min: "512", max: "262144", scale: "log", snap: "125", fmt: "int" },
    L: { min: "1", max: "200", scale: "lin", snap: "int", fmt: "int" },
    E: { min: "1", max: "2048", scale: "log", snap: "pow2", fmt: "int" },
    k: { min: "1", max: "64", scale: "lin", snap: "int", fmt: "int" },
    effC: { min: "0.2", max: "1", scale: "lin", fmt: "sig3" },
    effIci: { min: "0.2", max: "1", scale: "lin", fmt: "sig3" },
    effDcn: { min: "0.2", max: "1", scale: "lin", fmt: "sig3" },
  };
  function initLiveRows(root) {
    root.querySelectorAll("td[data-live], td[data-live-expr]").forEach((td) => {
      const stat = document.createElement("span");
      stat.className = "cell-static";
      while (td.firstChild) stat.appendChild(td.firstChild);
      td.appendChild(stat);
      const live = document.createElement("span");
      live.className = "cell-live";
      const key = td.dataset.live;
      if (key && key in state) {
        const v = document.createElement("span");
        v.className = "t-var";
        v.dataset.var = key;
        const cfg = LIVE_VAR_ATTRS[key] || {};
        for (const a in cfg) v.dataset[a] = cfg[a];
        live.appendChild(v);
        initVar(v);
      } else if (td.dataset.liveExpr) {
        const o = document.createElement("span");
        o.className = "t-out";
        o.dataset.expr = td.dataset.liveExpr;
        o.dataset.fmt = td.dataset.fmt || "int";
        live.appendChild(o);
        initOut(o);
      } else return;
      td.appendChild(live);
    });
    // row activation: state matches the row's preset exactly (on its keys)
    root.querySelectorAll("tr").forEach((tr) => {
      if (!tr.querySelector("td[data-live], td[data-live-expr]")) return;
      const btn = tr.querySelector(".t-preset[data-set]");
      if (!btn) return;
      let patch;
      try { patch = JSON.parse(btn.dataset.set); } catch (e) { return; }
      const check = () => {
        const active = Object.keys(patch).every((k) => state[k] === Number(patch[k]));
        tr.classList.toggle("live-row", active);
      };
      subscribe(check);
      check();
    });
  }

  // ---------- sidenotes ----------
  // The sentence a note annotates: walk text nodes before the .sn marker inside
  // its block, back to the previous sentence terminator (or block start).
  function anchorRangeFor(sn) {
    const block = sn.closest("p, li, figcaption, summary, td, .eq, .eq-live, .takeaway, .note") || sn.parentElement;
    if (!block) return null;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!(sn.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING)) return NodeFilter.FILTER_REJECT;
        if (n.parentElement && n.parentElement.closest(".sn")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    if (!nodes.length) return null;
    // find the last sentence terminator that has > 2 chars of text after it
    let after = 0, startNode = nodes[0], startOff = 0;
    outer:
    for (let i = nodes.length - 1; i >= 0; i--) {
      const t = nodes[i].textContent;
      for (let j = t.length - 1; j >= 0; j--) {
        if (/[.!?]/.test(t[j]) && after > 2) {
          startNode = nodes[i];
          startOff = j + 1;
          break outer;
        }
        after++;
      }
    }
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEndBefore(sn);
    return range;
  }

  let anchorHlTimer = null;
  function setAnchorHighlight(sn) {
    if (!(window.Highlight && CSS.highlights)) return false;
    const range = anchorRangeFor(sn);
    if (!range) return false;
    clearTimeout(anchorHlTimer);
    CSS.highlights.set("sn-anchor", new Highlight(range));
    return true;
  }
  function clearAnchorHighlight() {
    if (window.Highlight && CSS.highlights) CSS.highlights.delete("sn-anchor");
  }
  function highlightAnchor(sn) { // click: brief highlight, or text selection as fallback
    if (setAnchorHighlight(sn)) {
      anchorHlTimer = setTimeout(clearAnchorHighlight, 2000);
    } else {
      const range = anchorRangeFor(sn);
      if (!range) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function initSidenotes(root) {
    // hovering a note's marker (✦/Δ/◦) or its margin body highlights the
    // sentence it annotates; clicking selects it (fallback browsers) too
    root.querySelectorAll(".sn").forEach((sn) => {
      sn.querySelectorAll(".sn-ref, .sn-body").forEach((part) => {
        part.addEventListener("pointerenter", () => setAnchorHighlight(sn));
        part.addEventListener("pointerleave", clearAnchorHighlight);
      });
    });
    root.querySelectorAll(".sn > .sn-body").forEach((body) => {
      body.addEventListener("click", (ev) => {
        if (ev.target.closest("a, button, .t-var")) return; // let interactive children work
        if (!mnQuery.matches) return; // narrow screens: body sits inline already
        highlightAnchor(body.parentElement);
      });
    });
    root.querySelectorAll(".sn > .sn-ref").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (mnQuery.matches) {
          // wide screens: the note is already in the margin — flash it instead
          // of restyling it (restyle = height change = margin collisions)
          const body = btn.parentElement.querySelector(".sn-body");
          if (body) {
            body.classList.remove("flash");
            void body.offsetWidth; // restart the animation
            body.classList.add("flash");
          }
          return;
        }
        btn.parentElement.classList.toggle("open");
        scheduleMarginLayout();
      });
    });
  }

  // ---------- margin-note layout (wide screens) ----------
  // Notes are absolutely positioned inside .paper: each wants to sit beside its
  // inline anchor, but is shunted downward past the previous note when they'd
  // collide. Re-runs (debounced) on state changes, resize, and details toggles,
  // because live numbers change note heights at runtime.
  const mnQuery = window.matchMedia("(min-width: 80rem)");
  let mnTimer = null;

  function layoutMarginNotes() {
    const paper = document.querySelector(".paper");
    if (!paper) return;
    const sns = Array.from(document.querySelectorAll(".sn"));
    if (!mnQuery.matches) {
      for (const sn of sns) {
        const body = sn.querySelector(".sn-body");
        if (!body) continue;
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.width = "";
        body.style.display = "";
        body.classList.remove("laid");
      }
      return;
    }
    const paperRect = paper.getBoundingClientRect();
    const section = paper.querySelector("section") || paper;
    const colRight = section.getBoundingClientRect().right - paperRect.left;
    const gutter = 26;
    const left = colRight + gutter;
    // notes may overflow the paper's right edge — size them to the real
    // viewport room (capped), not the paper's own thin margin column
    const viewRoom = document.documentElement.clientWidth - (paperRect.left + left) - 18;
    const noteW = Math.max(160, Math.min(19 * 16, viewRoom));

    // breakout figures intrude into the margin column — treat them as obstacles
    const blockers = [];
    for (const fig of document.querySelectorAll("figure.breakout")) {
      const fr = fig.getBoundingClientRect();
      if (!fr.height) continue;
      if (fr.right - paperRect.left > colRight + 8) {
        blockers.push({ top: fr.top - paperRect.top - 6, bottom: fr.bottom - paperRect.top + 6 });
      }
    }
    blockers.sort((a, b) => a.top - b.top);

    const items = [];
    for (const sn of sns) {
      const body = sn.querySelector(".sn-body");
      const ref = sn.querySelector(".sn-ref") || sn;
      if (!body) continue;
      const r = ref.getBoundingClientRect();
      items.push({ body, anchorTop: r.top - paperRect.top, visible: !!(r.width || r.height) });
    }
    items.sort((a, b) => a.anchorTop - b.anchorTop);
    let lastBottom = -1e9;
    for (const it of items) {
      if (!it.visible) { // anchor hidden (e.g. inside a closed <details>)
        it.body.style.display = "none";
        it.body.classList.remove("laid");
        continue;
      }
      it.body.style.display = "";
      it.body.style.position = "absolute";
      it.body.style.left = left + "px";
      it.body.style.width = noteW + "px";
      const hgt = it.body.offsetHeight;
      // center the note on its anchor line (reduces downstream shunting);
      // collisions still push it below its predecessor
      let y = Math.max(it.anchorTop - hgt / 2, lastBottom + 10);
      let moved = true;
      while (moved) { // slide down past any figure the note would overlap
        moved = false;
        for (const b of blockers) {
          if (y < b.bottom && y + hgt > b.top) { y = b.bottom + 10; moved = true; }
        }
      }
      it.body.style.top = y + "px";
      it.body.classList.add("laid");
      lastBottom = y + hgt;
    }
  }

  function scheduleMarginLayout() {
    clearTimeout(mnTimer);
    mnTimer = setTimeout(() => { layoutMarginNotes(); anchorRectCache = null; }, 80);
  }

  // ---------- sentence-hover → margin-note highlight ----------
  // rAF-throttled hit test against cached page-coordinate rects of each
  // note's anchor sentence; cache invalidates whenever the margin re-lays-out.
  let anchorRectCache = null;
  let hotSn = null, hitPending = false;
  function buildAnchorRects() {
    anchorRectCache = [];
    if (!mnQuery.matches) return;
    document.querySelectorAll(".sn").forEach((sn) => {
      const body = sn.querySelector(".sn-body");
      if (!body || !body.classList.contains("laid")) return;
      const range = anchorRangeFor(sn);
      if (!range) return;
      const rects = Array.from(range.getClientRects()).map((r) => ({
        left: r.left, right: r.right,
        top: r.top + window.scrollY, bottom: r.bottom + window.scrollY,
      }));
      if (rects.length) anchorRectCache.push({ sn, body, rects });
    });
  }
  document.addEventListener("pointermove", (ev) => {
    if (hitPending || !mnQuery.matches) return;
    hitPending = true;
    const px = ev.clientX, py = ev.clientY + window.scrollY;
    requestAnimationFrame(() => {
      hitPending = false;
      if (!anchorRectCache) buildAnchorRects();
      let hit = null;
      for (const a of anchorRectCache) {
        if (a.rects.some((r) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom)) { hit = a; break; }
      }
      if (hit === hotSn) return;
      // hovering the sentence highlights the pair: the margin note AND the
      // sentence itself (same highlight the ◦ marker hover uses)
      if (hotSn) { hotSn.body.classList.remove("sn-hot"); clearAnchorHighlight(); }
      hotSn = hit;
      if (hotSn) { hotSn.body.classList.add("sn-hot"); setAnchorHighlight(hotSn.sn); }
    });
  }, { passive: true });

  // ---------- widget registry ----------
  const factories = {};
  const instances = [];
  const Widgets = {
    register(name, factory) { factories[name] = factory; },
  };

  function mountWidgets(root) {
    root.querySelectorAll("[data-widget]").forEach((el) => {
      const name = el.dataset.widget;
      const factory = factories[name];
      if (!factory) {
        el.innerHTML = "";
        const warn = document.createElement("div");
        warn.textContent = "⚠ widget not found: " + name;
        warn.style.color = "var(--bad)";
        el.appendChild(warn);
        console.error("widget not found:", name);
        return;
      }
      let opts = {};
      try { opts = JSON.parse(el.dataset.opts || "{}"); } catch (e) { console.error("bad opts for", name); }
      try {
        const inst = factory(el, opts);
        if (inst && inst.update) instances.push(inst);
      } catch (e) {
        console.error("widget init failed:", name, e);
      }
    });
  }

  // ---------- sortable tables ----------
  // any <table class="tbl sortable">: click a header to sort by that column;
  // numeric-aware (strips ≈ and commas, understands k/M/B/T suffixes)
  function sortKeyOf(text) {
    const s = text.trim().replace(/[≈,\s]/g, "");
    const m = s.match(/^[-+]?(\d*\.?\d+(?:[eE][-+]?\d+)?)([kKMmBbTt]?)/);
    if (m) {
      const suf = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, t: 1e12, T: 1e12 }[m[2]] || 1;
      return Number(m[1]) * suf;
    }
    return null;
  }
  function initSortableTables(root) {
    root.querySelectorAll("table.sortable").forEach((tbl) => {
      const tbody = tbl.tBodies[0];
      if (!tbody) return;
      const ths = Array.from(tbl.tHead ? tbl.tHead.querySelectorAll("th") : []);
      ths.forEach((th, col) => {
        th.classList.add("th-sort");
        th.setAttribute("role", "button");
        th.setAttribute("tabindex", "0");
        function toggle() {
          const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
          ths.forEach((o) => o.removeAttribute("aria-sort"));
          th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
          const rows = Array.from(tbody.rows);
          rows.sort((a, b) => {
            const cellText = (tr) => {
              if (!tr.cells[col]) return "";
              const st = tr.cells[col].querySelector(".cell-static");
              return st ? st.textContent : tr.cells[col].textContent;
            };
            const ta = cellText(a), tb = cellText(b);
            const na = sortKeyOf(ta), nb = sortKeyOf(tb);
            if (na != null && nb != null) return dir * (na - nb);
            return dir * ta.trim().localeCompare(tb.trim());
          });
          rows.forEach((r) => tbody.appendChild(r));
          scheduleMarginLayout();
        }
        th.addEventListener("click", toggle);
        th.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } });
      });
    });
  }

  // ---------- TOC scroll spy ----------
  function initToc() {
    const toc = document.querySelector("nav.toc");
    if (!toc) return;
    const links = Array.from(toc.querySelectorAll("a[href^='#']"));
    const targets = links
      .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
      .filter(Boolean);
    if (!targets.length) return;
    function spy() {
      let best = null;
      for (const t of targets) {
        if (t.getBoundingClientRect().top < 140) best = t;
      }
      links.forEach((a) => a.classList.toggle("active", best != null && a.getAttribute("href") === "#" + best.id));
    }
    document.addEventListener("scroll", spy, { passive: true });
    spy();
  }

  // ---------- boot ----------
  function boot() {
    loadHash();
    const root = document;
    root.querySelectorAll(".t-var[data-var]").forEach(initVar);
    root.querySelectorAll(".t-out[data-expr]").forEach(initOut);
    root.querySelectorAll(".t-if[data-expr]").forEach(initIf);
    root.querySelectorAll(".t-show[data-expr]").forEach(initShow);
    root.querySelectorAll(".t-preset[data-set]").forEach(initPreset);
    initTermTokens(root);
    initShapeTokens(root);
    initLiveRows(root);
    initDimTokens(root);
    initSidenotes(root);
    mountWidgets(root);
    // widgets see the EFFECTIVE hardware view (spec × measured factors)
    subscribe(() => { const E = effState(); for (const w of instances) { try { w.update(E); } catch (e) { console.error("widget update failed", e); } } });
    const S = effState();
    for (const w of instances) { try { w.update(S); } catch (e) { console.error("widget first update failed", e); } }
    const resetBtns = document.querySelectorAll("button.reset");
    resetBtns.forEach((b) => b.addEventListener("click", resetAll));
    // reset buttons light up whenever the SCRUBS have strayed from their
    // defaults (picking a model/hardware/measured mode is not "dirty")
    subscribe(() => {
      const dirty = RESET_KEYS.some((kk) => state[kk] !== DEFAULTS[kk]);
      resetBtns.forEach((b) => b.classList.toggle("dirty", dirty));
    });
    // declarative instant tooltips: any element with data-tip (optional
    // data-tip-label; data-tip-href adds a source link, clickable once
    // pinned). Click-to-pin everywhere EXCEPT elements whose click already
    // does something (buttons, sortable headers).
    root.querySelectorAll("[data-tip]").forEach((el) => {
      const clickTaken = !!(el.closest("button, th") || el.querySelector("button"));
      attachHoverTip(el, () => {
        const rows = [];
        if (el.dataset.tipLabel) rows.push({ cls: "tip-label", text: el.dataset.tipLabel });
        rows.push({ text: el.dataset.tip });
        if (el.dataset.tipHref) {
          const a = document.createElement("a");
          a.href = el.dataset.tipHref;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = (el.dataset.tipSrc || "source") + " ↗";
          const wrap = document.createElement("span");
          wrap.className = "tip-link";
          wrap.appendChild(a);
          rows.push({ cls: "tip-sub", el: wrap });
        }
        return rows;
      }, { pinnable: !clickTaken });
    });
    initSortableTables(root);
    initToc();
    notify(); // one full sync

    // margin-note layout: initially (twice — fonts/widgets settle late),
    // on every state change, on resize, and when any <details> toggles
    subscribe(scheduleMarginLayout);
    window.addEventListener("resize", scheduleMarginLayout);
    if (mnQuery.addEventListener) mnQuery.addEventListener("change", scheduleMarginLayout);
    document.addEventListener("toggle", scheduleMarginLayout, true);
    layoutMarginNotes();
    setTimeout(layoutMarginNotes, 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // ---------- exports ----------
  window.Core = {
    get: () => state,
    defaults: () => Object.assign({}, DEFAULTS),
    set, subscribe, evalExpr, evalNow, fmt, resetAll,
    dimHover, onDimHover,
    SERIES: { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", s4: "#eda100", s5: "#e87ba4", s6: "#008300", s7: "#4a3aa7", s8: "#e34948" },
    CHROME: { ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7", surface: "#fcfcfb", good: "#0ca30c", bad: "#d03b3b" },
  };
  window.Widgets = Widgets;
})();
