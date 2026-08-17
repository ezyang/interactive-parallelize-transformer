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
    X: 512, Y: 8, MX: 2, MY: 1,
    Z: 4, Mmicro: 8,
    MFU: 0.4, podSize: 8960, gpu: 0,
    E: 1, k: 1, EP: 8,
    pD: 5120, pF: 13824, pL: 40, pNH: 40, pNK: 40, pH: 128, pV: 32000, pB: 16e6,
  };
  const KEYS = Object.keys(DEFAULTS);
  const state = Object.assign({}, DEFAULTS);

  // hard clamps so nothing explodes
  const LIMITS = {
    C: [1e12, 1e17], Wici: [1e9, 1e13], Wdcn: [1e8, 1e12], HBM: [1e9, 1e13],
    D: [128, 262144], F: [128, 1048576], L: [1, 1000],
    B: [1, 1e10],
    X: [1, 1048576], Y: [1, 8192], MX: [1, 3], MY: [1, 3],
    Z: [1, 64], Mmicro: [1, 128],
    MFU: [0.05, 1], podSize: [1, 65536], gpu: [0, 1],
    E: [1, 2048], k: [1, 64], EP: [1, 1024],
    pD: [128, 65536], pF: [128, 262144], pL: [1, 500], pNH: [1, 512], pNK: [1, 512],
    pH: [16, 1024], pV: [1000, 1e6], pB: [1, 1e10],
  };

  function clamp(k, v) {
    const lim = LIMITS[k];
    if (!lim || !isFinite(v)) return v;
    return Math.min(lim[1], Math.max(lim[0], v));
  }

  // ---------- derived + expression evaluation ----------
  const MATH_KEYS = ["sqrt", "min", "max", "pow", "ceil", "floor", "round", "abs", "exp", "PI"];
  const EXPR_ARGS = KEYS.concat(["N", "alpha", "alphaDcn", "P", "log2", "log10"]).concat(MATH_KEYS);

  function derivedVals() {
    return {
      N: state.X * state.Y,
      alpha: state.C / state.Wici,
      alphaDcn: state.C / state.Wdcn,
      // F is per-expert width (chapter-12 convention): weights scale with E·F
      P: 2 * state.D * state.E * state.F * state.L,
      log2: Math.log2, log10: Math.log10,
    };
  }
  function exprArgValues() {
    const d = derivedVals();
    const vals = KEYS.map((k) => state[k]);
    vals.push(d.N, d.alpha, d.alphaDcn, d.P, d.log2, d.log10);
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

  function resetAll() {
    Object.assign(state, DEFAULTS);
    history.replaceState(null, "", location.pathname);
    notify();
  }

  // ---------- URL hash persistence ----------
  let hashTimer = null;
  function scheduleHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const diff = [];
      for (const k of KEYS) {
        if (state[k] !== DEFAULTS[k]) diff.push(k + "=" + encodeURIComponent(compactNum(state[k])));
      }
      const h = diff.length ? "#" + diff.join("&") : location.pathname;
      history.replaceState(null, "", diff.length ? h : location.pathname + location.search);
    }, 300);
  }
  function compactNum(x) {
    if (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0)) {
      return x.toExponential(4).replace(/\.?0+e/, "e").replace("e+", "e");
    }
    return String(x);
  }
  function loadHash() {
    if (!location.hash || location.hash.length < 2) return;
    const patch = {};
    for (const pair of location.hash.slice(1).split("&")) {
      const [k, v] = pair.split("=");
      if (k in DEFAULTS && v !== undefined) {
        const n = Number(decodeURIComponent(v));
        if (isFinite(n)) patch[k] = n;
      }
    }
    for (const k in patch) state[k] = clamp(k, patch[k]);
  }

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
  function placeCard(cardEl, anchorEl) {
    const er = anchorEl.getBoundingClientRect();
    if (!er.width && !er.height) return false; // anchor hidden or gone
    const tw = cardEl.offsetWidth, th = cardEl.offsetHeight;
    let x = er.left + er.width / 2 - tw / 2;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    let y = er.bottom + 8;
    if (y + th > window.innerHeight - 8) y = er.top - th - 8;
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
      if (!placeCard(p.el, p.anchor)) unpinEntry(p);
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
      placeCard(p.el, p.anchor);
    }
  });

  const IDENT_RE = /(?<![\w.])[A-Za-z_][A-Za-z0-9_]*/g;

  // English names for every state key (green tooltips + in-tip scrub tokens)
  const KEY_NAMES = {
    C: "Chip speed — peak FLOPs/s", Wici: "In-pod bandwidth, per axis (ICI / NVLink egress)",
    Wdcn: "Cross-pod bandwidth per chip (DCN / InfiniBand)", HBM: "HBM capacity per chip",
    D: "d_model — the hidden dimension", F: "Feed-forward width of one expert (d_ff when dense)",
    L: "Layers", B: "Batch — total tokens per step",
    X: "Mesh axis X — data / FSDP shards", Y: "Mesh axis Y — tensor-parallel shards",
    MX: "Mesh axes carrying X", MY: "Mesh axes carrying Y",
    Z: "Pipeline stages", Mmicro: "Microbatches",
    MFU: "Model FLOPs utilization", podSize: "Chips per pod (ICI / NVLink domain)",
    gpu: "GPU switched-fabric flag (0 = TPU mesh)", E: "Experts per layer (total, incl. shared)",
    k: "Experts activated per token (incl. shared)", EP: "Expert-parallel degree (Z_E)",
    pD: "Problem model — d_model", pF: "Problem model — d_ff", pL: "Problem model — layers",
    pNH: "Problem model — query heads", pNK: "Problem model — KV heads",
    pH: "Problem model — head dim", pV: "Problem model — vocab size", pB: "Problem batch — tokens",
  };
  // derived names drill down to their own definitions inside a pinned tip
  const DERIVED_DEFS = {
    N: { expr: "X*Y", name: "total chips" },
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
    return expr
      .replace(IDENT_RE, (m) => {
        if (m in state) return shortNum(state[m]);
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
        pinnedCards.push({ el: card, anchor: el, refreshers });
        placeCard(card, el);
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
    attachHoverTip(el, () => [
      { cls: "tip-label", text: KEY_NAMES[key] || key },
      { cls: "tip-code", text: key + " = " + shortNum(state[key]) },
      { cls: "tip-sub", text: "range " + shortNum(min) + " … " + shortNum(max) + (el.dataset.snap ? " · snaps to " + el.dataset.snap : "") + " · drag ⟷ · double-click to type (blank = reset)" },
    ]);

    let editing = false;
    function render() {
      if (editing) return; // don't clobber the reader's typing
      el.textContent = fmt(state[key], fmtName);
      el.setAttribute("aria-valuenow", String(state[key]));
      el.setAttribute("aria-valuetext", fmt(state[key], fmtName));
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
      el.textContent = compactNum(state[key]);
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
        const v = parseTyped(typed);
        if (v != null && isFinite(v)) {
          // typed values are exact: clamp to range but do NOT snap
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
      case "X": return ["chips along mesh axis X (data / FSDP parallelism)", "X = " + fmt(state.X, "int")];
      case "Y": return ["chips along mesh axis Y (tensor parallelism)", "Y = " + fmt(state.Y, "int")];
      case "N": return ["total chips in the slice, N = X·Y", "N = " + fmt(state.X * state.Y, "int")];
      case "C": return ["peak matmul FLOPs/s of one chip", "C = " + fmt(state.C, "flops")];
      case "W":
        if (/dcn/i.test(txt)) return ["cross-pod (DCN / InfiniBand) bandwidth per chip", "W_dcn = " + fmt(state.Wdcn, "bw")];
        if (/ici/i.test(txt)) return ["in-pod interconnect bandwidth per axis (ICI; NVLink egress under GPU presets)", "W_ici = " + fmt(state.Wici, "bw")];
        return ["network bandwidth — W_ici in-pod, W_dcn between pods", "W_ici = " + fmt(state.Wici, "bw") + "   W_dcn = " + fmt(state.Wdcn, "bw")];
      case "Z":
        if (/E/.test(txt.replace(/^Z/, ""))) return ["expert-parallel degree (chapter 12's Z, renamed Z_E here)", "Z_E = " + fmt(state.EP, "int")];
        return ["pipeline stages (in the notation table: the third mesh axis)", "Z = " + fmt(state.Z, "int")];
      case "E": return ["experts per layer — total holding weights, counting shared", "E = " + fmt(state.E, "int") + "   E·F = " + fmt(state.E * state.F, "si")];
      case "k": return ["experts activated per token, counting shared", "k = " + fmt(state.k, "int") + "   k·F = " + fmt(state.k * state.F, "int")];
      case "M":
        if (/micro/i.test(txt)) return ["number of microbatches in the pipeline", "M_micro = " + fmt(state.Mmicro, "int")];
        if (/X/.test(txt)) return ["hardware mesh axes carrying the X (FSDP) sharding", "M_X = " + fmt(state.MX, "int")];
        if (/Y/.test(txt)) return ["hardware mesh axes carrying the Y (TP) sharding", "M_Y = " + fmt(state.MY, "int")];
        return ["mesh-axes multiplier (M_X / M_Y), or the chips per ICI slice in the pods section", "M_X = " + fmt(state.MX, "int") + "   M_Y = " + fmt(state.MY, "int") + "   slice = " + fmt(state.podSize, "int")];
      default: return null;
    }
  }

  function initDimTokens(root) {
    root.querySelectorAll(".v").forEach((el) => {
      const cls = Array.from(el.classList).find((c) => /^v-[A-Za-z]$/.test(c));
      if (!cls) return;
      const dim = cls.slice(2);
      el.addEventListener("mouseenter", () => dimHover(dim));
      el.addEventListener("mouseleave", () => dimHover(null));
      attachHoverTip(el, () => {
        const m = dimMeaning(dim, el);
        return m ? [{ cls: "tip-label", text: m[0] }, { cls: "tip-code", text: m[1] }] : [];
      });
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
    const noteW = Math.min(16 * 16, Math.max(160, paperRect.width - colRight - gutter - 4));
    const left = colRight + gutter;

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
      let y = Math.max(it.anchorTop - 4, lastBottom + 10);
      const hgt = it.body.offsetHeight;
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
    mnTimer = setTimeout(layoutMarginNotes, 80);
  }

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
            const ta = (a.cells[col] ? a.cells[col].textContent : ""), tb = (b.cells[col] ? b.cells[col].textContent : "");
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
    initDimTokens(root);
    initSidenotes(root);
    mountWidgets(root);
    subscribe((S) => { for (const w of instances) { try { w.update(S); } catch (e) { console.error("widget update failed", e); } } });
    const S = state;
    for (const w of instances) { try { w.update(S); } catch (e) { console.error("widget first update failed", e); } }
    const resetBtns = document.querySelectorAll("button.reset");
    resetBtns.forEach((b) => b.addEventListener("click", resetAll));
    // reset buttons light up whenever the state has strayed from the defaults
    subscribe(() => {
      const dirty = KEYS.some((kk) => state[kk] !== DEFAULTS[kk]);
      resetBtns.forEach((b) => b.classList.toggle("dirty", dirty));
    });
    // declarative instant tooltips: any element with data-tip (optional data-tip-label)
    root.querySelectorAll("[data-tip]").forEach((el) => {
      attachHoverTip(el, () => {
        const rows = [];
        if (el.dataset.tipLabel) rows.push({ cls: "tip-label", text: el.dataset.tipLabel });
        rows.push({ text: el.dataset.tip });
        return rows;
      });
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
