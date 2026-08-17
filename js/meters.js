/* ============================================================
   meters.js — quantitative verdict widgets.
   Widgets: "bound-meter" (T_math vs T_comms per layer, shared
   linear scale, exposed-comms hatch, verdict pill) and
   "mem-meter" (stacked per-chip HBM bar vs capacity tick).
   ============================================================ */
(function () {
  "use strict";
  const axLabel = (a) => ({ X: "DP", Y: "TP", MX: "M_DP", MY: "M_TP", Z: "PP", MDP: "M_DP", MTP: "M_TP" }[a] || a);
  const SER = Core.SERIES, CHR = Core.CHROME;
  const SVGNS = "http://www.w3.org/2000/svg";
  const INKBAR = "#3a3a38"; // near-ink for the T_math reference bar
  const RED = "#d03b3b";

  function h(tag, attrs, ...children) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) {
      if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    for (const c of children) {
      if (c == null) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  function div(cls, text) {
    const el = document.createElement("div");
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  let uidCounter = 0;

  /* ============================================================
     bound-meter
     Two horizontal bars on one shared linear time scale:
     T_math (near-ink) and T_comms (scheme color), per layer.
     The comms bar sits directly beneath the math bar, sharing the
     same origin — any comms overhang past T_math is hatched red
     ("exposed"), same visual language as overlap-timeline.
     ============================================================ */
  // label / tmFormula / tcFormula are functions: they name mesh axes, so they
  const BOUND_SCHEMES = {
    // F = per-expert width (chapter-12 convention): math terms carry k·F,
    // weight-moving comms carry E·F. Dense models are the E = k = 1 case.
    dp: {
      label: () => "data parallelism (backward pass)",
      color: SER.s1,
      tm: (S) => (8 * S.B * S.D * S.k * S.F) / (S.DP * S.C),
      tc: (S) => (8 * S.D * S.E * S.F) / (S.Wici * S.MDP),
      tmFormula: () => "T_math = 8·B·D·k·F / (" + axLabel("X") + "·C)",
      tcFormula: () => "T_comms = 8·D·E·F / (Wici·" + axLabel("MX") + ")",
    },
    fsdp: {
      label: () => "FSDP (forward pass)",
      color: SER.s1,
      tm: (S) => (4 * S.B * S.D * S.k * S.F) / (S.DP * S.C),
      tc: (S) => (4 * S.D * S.E * S.F) / (S.Wici * S.MDP),
      tmFormula: () => "T_math = 4·B·D·k·F / (" + axLabel("X") + "·C)",
      tcFormula: () => "T_comms = 4·D·E·F / (Wici·" + axLabel("MX") + ")",
    },
    tp: {
      label: () => "tensor parallelism (forward pass)",
      color: SER.s2,
      tm: (S) => (4 * S.B * S.D * S.k * S.F) / (S.TP * S.C),
      tc: (S) => (4 * S.B * S.D) / (S.Wici * S.MTP),
      tmFormula: () => "T_math = 4·B·D·k·F / (" + axLabel("Y") + "·C)",
      tcFormula: () => "T_comms = 4·B·D / (Wici·" + axLabel("MY") + ")",
    },
    mixed: {
      label: () => "FSDP + TP (forward pass, N = " + axLabel("X") + "·" + axLabel("Y") + ")",
      color: SER.s3,
      tm: (S) => (4 * S.B * S.D * S.k * S.F) / (S.DP * S.TP * S.C),
      tc: (S) => Math.max(
        (4 * S.D * S.E * S.F) / (S.TP * S.Wici * S.MDP),
        (4 * S.B * S.D) / (S.DP * S.Wici * S.MTP)
      ),
      tmFormula: () => "T_math = 4·B·D·k·F / (N·C)",
      tcFormula: () => "T_comms = max(4·D·E·F / (" + axLabel("Y") + "·Wici·" + axLabel("MX") +
        "), 4·B·D / (" + axLabel("X") + "·Wici·" + axLabel("MY") + "))",
    },
    dcn: {
      label: () => Core.get().gpu >= 0.5 ? "cross-node data parallelism over InfiniBand (backward pass)" : "cross-pod data parallelism over DCN (backward pass)",
      color: SER.s1,
      tm: (S) => (8 * S.B * S.D * S.k * S.F) / (S.DP * S.TP * S.C),
      tc: (S) => (8 * S.D * S.E * S.F) / (S.podSize * S.Wdcn),
      tmFormula: () => "T_math = 8·B·D·k·F / (N·C)",
      tcFormula: () => "T_comms = 8·D·E·F / (podSize·Wdcn)",
    },
  };

  Widgets.register("bound-meter", function (el, opts) {
    el.innerHTML = "";
    const scheme = BOUND_SCHEMES[(opts && opts.scheme) || "dp"] || BOUND_SCHEMES.dp;
    const uid = "bm-hatch-" + (++uidCounter);

    const title = div("w-title"); // text set each render (scheme label may name axes)
    const legend = div("legend");
    function rectKey(label, css) {
      const lg = div("lg");
      const k = div("key-rect");
      k.style.cssText = css;
      lg.appendChild(k);
      lg.appendChild(document.createTextNode(label));
      return lg;
    }
    legend.appendChild(rectKey("T_math (compute)", "background:" + INKBAR));
    legend.appendChild(rectKey("T_comms — hidden part", "background:" + scheme.color));
    legend.appendChild(rectKey("exposed (chips idle)",
      "background:repeating-linear-gradient(45deg, rgba(208,59,59,0.18), rgba(208,59,59,0.18) 2px, " + RED + " 2px, " + RED + " 4px)"));
    const svgWrap = div("");
    const readout = div("w-readout");
    readout.style.marginTop = "0.4rem";
    const pill = document.createElement("span");
    pill.className = "verdict ok";
    const headroom = document.createElement("span");
    readout.appendChild(pill);
    readout.appendChild(headroom);
    el.appendChild(title);
    el.appendChild(legend);
    el.appendChild(svgWrap);
    el.appendChild(readout);

    // freeze the time axis mid-scrub so the bars move against a still scale
    let lastSpan = 0;

    function render(S) {
      title.textContent = "Per-layer clock check — " + scheme.label();
      const tm = scheme.tm(S);
      const tc = scheme.tc(S);
      const W = 720, left = 128, right = 84;
      const barH = 24, gap = 10, y1 = 26, y2 = y1 + barH + gap;
      const H = y2 + barH + 30;
      const rawSpan = Math.max(tm, tc) * 1.06 || 1;
      const scrubbing = !!document.querySelector(".t-var.dragging");
      const span = scrubbing && lastSpan ? Math.max(lastSpan, rawSpan) : rawSpan;
      lastSpan = span;
      const xw = (t) => left + (t / span) * (W - left - right);

      const svg = h("svg", {
        viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": "bar meter comparing per-layer compute time " + Core.fmt(tm, "time") +
          " against communication time " + Core.fmt(tc, "time") + " for " + scheme.label(),
      });
      svg.style.width = "100%";

      // shared origin baseline
      svg.appendChild(h("line", { x1: left, y1: y1 - 8, x2: left, y2: y2 + barH + 8, stroke: CHR.axis, "stroke-width": 1 }));

      // track labels
      svg.appendChild(h("text", { x: left - 10, y: y1 + barH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: CHR.ink2 }, "T_math / layer"));
      svg.appendChild(h("text", { x: left - 10, y: y2 + barH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: CHR.ink2 }, "T_comms / layer"));

      // T_math bar (near-ink reference)
      const mathBar = h("rect", { x: left, y: y1, width: Math.max(1, xw(tm) - left), height: barH, rx: 4, fill: INKBAR },
        h("title", {}, scheme.tmFormula() + " = " + Core.fmt(tm, "time")));
      svg.appendChild(mathBar);
      // data-end square at baseline (4px, rounded)
      svg.appendChild(h("rect", { x: xw(tm) - 2, y: y1 + barH - 2, width: 4, height: 4, rx: 1, fill: CHR.ink }));
      svg.appendChild(h("text", { x: xw(tm) + 6, y: y1 + barH / 2 + 4, "font-size": 11, fill: CHR.ink, "font-weight": 700 }, Core.fmt(tm, "time")));

      // T_comms bar: hidden part in scheme color, overhang hatched red
      const hiddenT = Math.min(tc, tm);
      const commsBar = h("rect", { x: left, y: y2, width: Math.max(1, xw(hiddenT) - left), height: barH, rx: 4, fill: scheme.color },
        h("title", {}, scheme.tcFormula() + " = " + Core.fmt(tc, "time")));
      svg.appendChild(commsBar);
      if (tc > tm) {
        const pat = h("pattern", { id: uid, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
          h("rect", { width: 6, height: 6, fill: "rgba(208,59,59,0.18)" }),
          h("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: RED, "stroke-width": 2 }));
        svg.appendChild(h("defs", {}, pat));
        svg.appendChild(h("rect", {
          x: xw(tm), y: y2, width: Math.max(1, xw(tc) - xw(tm)), height: barH,
          fill: "url(#" + uid + ")", stroke: RED, "stroke-width": 1, rx: 2,
        }, h("title", {}, scheme.tcFormula() + " — the part past T_math is exposed: chips sit idle for " + Core.fmt(tc - tm, "time"))));
        svg.appendChild(h("text", { x: (xw(tm) + xw(tc)) / 2, y: y2 + barH + 16, "text-anchor": "middle", "font-size": 11, fill: "#8f2222", "font-weight": 600 }, "exposed"));
      } else {
        svg.appendChild(h("text", { x: (xw(tc) + xw(tm)) / 2, y: y2 + barH + 16, "text-anchor": "middle", "font-size": 11, fill: "#075607" },
          "hidden under compute ✓"));
      }
      svg.appendChild(h("rect", { x: xw(tc) - 2, y: y2 + barH - 2, width: 4, height: 4, rx: 1, fill: CHR.ink }));
      svg.appendChild(h("text", { x: xw(tc) + 6, y: y2 + barH / 2 + 4, "font-size": 11, fill: CHR.ink, "font-weight": 700 }, Core.fmt(tc, "time")));

      // dashed marker at the layer's true cost = max of the two
      const stepT = Math.max(tm, tc);
      svg.appendChild(h("line", { x1: xw(stepT), y1: y1 - 8, x2: xw(stepT), y2: y2 + barH + 2, stroke: CHR.ink, "stroke-width": 1, "stroke-dasharray": "3 3" }));
      svg.appendChild(h("text", { x: xw(stepT), y: y1 - 14, "text-anchor": "middle", "font-size": 11, fill: CHR.ink, "font-weight": 700 },
        "layer costs " + Core.fmt(stepT, "time")));

      svgWrap.innerHTML = "";
      svgWrap.appendChild(svg);

      // verdict pill + headroom
      const computeBound = tm >= tc;
      pill.className = "verdict " + (computeBound ? "ok" : "bad");
      pill.textContent = computeBound ? "compute-bound ✓" : "communication-bound ✗";
      const ratio = tm / tc;
      headroom.textContent = computeBound
        ? " compute exceeds comms by " + Core.fmt(ratio, "x") + " — that's your headroom before the network bites."
        : " comms exceed compute by " + Core.fmt(tc / tm, "x") + " (T_math/T_comms = " + Core.fmt(ratio, "x") + ").";
    }

    return { update: render };
  });
  /* ============================================================
     mem-meter
     One stacked horizontal bar of per-chip HBM bytes:
     params (2P, P = 2·D·E·F·L) + optimizer (8P, Adam fp32 m+v) +
     checkpointed activations (2·L·B·(D+2·k·F)), each divided per the scheme's
     sharding. Vertical capacity tick at HBM; overflow past the
     tick is hatched red with a "doesn't fit" flag.
     ============================================================ */
  const MEM_SCHEMES = {
    dp: {
      label: "pure data parallelism",
      divP: () => 1, divA: (S) => S.DP,
      noteP: () => "replicated on every chip (÷1)",
      noteA: () => "batch sharded over " + axLabel("X"),
    },
    fsdp: {
      label: "FSDP",
      divP: (S) => S.DP, divA: (S) => S.DP,
      noteP: () => "sharded over " + axLabel("X"),
      noteA: () => "batch sharded over " + axLabel("X"),
    },
    mixed: {
      label: "FSDP + TP",
      divP: (S) => S.DP * S.TP, divA: (S) => S.DP * S.TP,
      noteP: () => "sharded over N = " + axLabel("X") + "·" + axLabel("Y"),
      noteA: () => "sharded over " + axLabel("X") + "·" + axLabel("Y"),
    },
  };

  Widgets.register("mem-meter", function (el, opts) {
    el.innerHTML = "";
    const scheme = MEM_SCHEMES[(opts && opts.scheme) || "dp"] || MEM_SCHEMES.dp;
    const uid = "mm-hatch-" + (++uidCounter);
    const COLORS = { params: SER.s1, optimizer: SER.s7, activations: SER.s3 };

    const title = div("w-title", "Does it fit? Per-chip HBM under " + scheme.label);
    const legend = div("legend");
    for (const [name, color] of [["params (2P bytes)", COLORS.params], ["optimizer state (8P bytes)", COLORS.optimizer], ["activations (2·L·B·(D+2·k·F) bytes)", COLORS.activations]]) {
      const lg = div("lg");
      const sw = document.createElement("span");
      sw.className = "key-rect";
      sw.style.background = color;
      lg.appendChild(sw);
      lg.appendChild(document.createTextNode(name));
      legend.appendChild(lg);
    }
    const svgWrap = div("");
    const readout = div("w-readout");
    readout.style.marginTop = "0.4rem";
    const pill = document.createElement("span");
    pill.className = "verdict ok";
    const summary = document.createElement("span");
    readout.appendChild(pill);
    readout.appendChild(summary);
    el.appendChild(title);
    el.appendChild(legend);
    el.appendChild(svgWrap);
    el.appendChild(readout);

    function render(S) {
      // P = 2·D·E·F·L (weights hold all E experts); activations touch only the k activated
      const P = 2 * S.D * S.E * S.F * S.L;
      const dP = scheme.divP(S), dA = scheme.divA(S);
      const actBytes = 2 * S.L * S.B * (S.D + 2 * S.k * S.F);
      const segs = [
        { key: "params", bytes: (2 * P) / dP, color: COLORS.params,
          tip: "params = 2·P ÷ " + Core.fmt(dP, "int") + " (" + scheme.noteP() + ") = " + Core.fmt((2 * P) / dP, "bytes") },
        { key: "optimizer", bytes: (8 * P) / dP, color: COLORS.optimizer,
          tip: "optimizer (Adam, fp32 m+v) = 8·P ÷ " + Core.fmt(dP, "int") + " (" + scheme.noteP() + ") = " + Core.fmt((8 * P) / dP, "bytes") },
        { key: "activations", bytes: actBytes / dA, color: COLORS.activations,
          tip: "checkpointed activations = 2·L·B·(D+2·k·F) ÷ " + Core.fmt(dA, "int") + " (" + scheme.noteA() + ") = " + Core.fmt(actBytes / dA, "bytes") },
      ];
      const total = segs.reduce((a, s) => a + s.bytes, 0);
      const ratio = total / S.HBM;
      const broken = ratio > 50;

      const W = 720, left = 16, right = 20;
      const barH = 24, y0 = 30;
      const H = y0 + barH + 34;
      // linear scale sized so both the total and the capacity tick are visible;
      // past 50× capacity we clip and annotate instead of squashing the tick to 0px.
      const xmax = broken ? 50 * S.HBM : Math.max(total, S.HBM) * 1.06;
      const xw = (b) => left + (b / xmax) * (W - left - right);

      const svg = h("svg", {
        viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": "stacked memory bar: " + Core.fmt(total, "bytes") + " needed per chip versus " +
          Core.fmt(S.HBM, "bytes") + " of HBM under " + scheme.label + (total > S.HBM ? " — does not fit" : " — fits"),
      });
      svg.style.width = "100%";

      // hatch pattern for the overflow region
      const pat = h("pattern", { id: uid, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
        h("rect", { width: 6, height: 6, fill: "rgba(208,59,59,0.18)" }),
        h("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: RED, "stroke-width": 2 }));
      svg.appendChild(h("defs", {}, pat));

      // segments with 2px surface gaps
      let acc = 0;
      const GAP = 2;
      for (const s of segs) {
        const x0 = xw(acc);
        acc += s.bytes;
        const x1 = xw(acc);
        const wpx = Math.max(0, x1 - x0 - GAP);
        if (wpx > 0.5) {
          svg.appendChild(h("rect", { x: x0 + GAP / 2, y: y0, width: wpx, height: barH, rx: 3, fill: s.color },
            h("title", {}, s.tip)));
        }
      }

      // overflow hatch: the part of the stack past the capacity tick
      if (total > S.HBM) {
        const ox = xw(S.HBM);
        const oend = Math.min(xw(total), W - right);
        svg.appendChild(h("rect", {
          x: ox, y: y0 - 3, width: Math.max(1, oend - ox), height: barH + 6,
          fill: "url(#" + uid + ")", stroke: RED, "stroke-width": 1, rx: 2,
        }, h("title", {}, "overflow: " + Core.fmt(total - S.HBM, "bytes") + " past HBM capacity")));
        svg.appendChild(h("text", { x: Math.min((ox + oend) / 2, W - 70), y: y0 + barH + 18, "text-anchor": "middle", "font-size": 11, fill: "#8f2222", "font-weight": 700 }, "doesn't fit"));
      }

      // capacity tick
      const cx = xw(S.HBM);
      svg.appendChild(h("line", { x1: cx, y1: y0 - 14, x2: cx, y2: y0 + barH + 8, stroke: CHR.ink, "stroke-width": 1.5 }));
      svg.appendChild(h("text", { x: cx, y: y0 - 18, "text-anchor": cx > W - 120 ? "end" : "middle", "font-size": 11, fill: CHR.ink, "font-weight": 700 },
        "HBM: " + Core.fmt(S.HBM, "bytes")));

      // total end label (or broken-scale note)
      if (broken) {
        svg.appendChild(h("text", { x: W - right, y: y0 + barH / 2 + 4, "text-anchor": "end", "font-size": 11, fill: "#8f2222", "font-weight": 700 },
          "off the chart: " + Core.fmt(ratio, "x") + " capacity"));
      } else {
        const tx = xw(total);
        svg.appendChild(h("text", {
          x: tx + 6 > W - 76 ? tx - 6 : tx + 6, y: y0 + barH / 2 + 4,
          "text-anchor": tx + 6 > W - 76 ? "end" : "start",
          "font-size": 11, fill: CHR.ink, "font-weight": 700,
        }, Core.fmt(total, "bytes")));
      }

      svgWrap.innerHTML = "";
      svgWrap.appendChild(svg);

      const fits = total <= S.HBM;
      pill.className = "verdict " + (fits ? "ok" : "bad");
      pill.textContent = fits ? "fits ✓" : "doesn't fit ✗";
      summary.textContent = " " + Core.fmt(total, "bytes") + " needed per chip vs " + Core.fmt(S.HBM, "bytes") +
        " of HBM (" + Core.fmt(ratio, "x") + " of capacity)" +
        (fits ? " — " + Core.fmt(S.HBM - total, "bytes") + " to spare." : " — " + Core.fmt(total - S.HBM, "bytes") + " over.");
    }

    return { update: render };
  });
})();
