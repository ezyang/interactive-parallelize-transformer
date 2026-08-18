/* ============================================================
   charts.js — log-log SVG chart engine + the two big charts.
   Widgets: "roofline-chart" (time-per-layer vs global batch B)
            "xy-explorer"   (T_fsdp / T_tp vs X for fixed N=X·Y).
   Conventions copied from js/roofline.js (sibling module).
   ============================================================ */
(function () {
  "use strict";
  const axLabel = (a) => ({ X: "DP", Y: "TP", MX: "M_DP", MY: "M_TP", Z: "PP", MDP: "M_DP", MTP: "M_TP" }[a] || a);
  const SER = Core.SERIES, CHR = Core.CHROME;
  const SVGNS = "http://www.w3.org/2000/svg";

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
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function snap125(v) {
    if (!fin(v) || v <= 0) return v;
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    const m = v / base;
    const nice = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
    return nice * base;
  }

  /* ---------- shared crosshair tooltip (one div on body) ---------- */
  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "chart-tip";
      tipEl.style.display = "none";
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  // rows: [{color, dashed, label, value}] — textContent only.
  function showTip(clientX, clientY, xLabel, rows) {
    const t = tip();
    t.textContent = "";
    const xr = div("tip-x", xLabel);
    t.appendChild(xr);
    for (const r of rows) {
      const row = div("tip-row");
      const key = document.createElement("span");
      key.className = "tip-key";
      key.style.borderTopColor = r.color;
      if (r.dashed) key.style.borderTopStyle = "dashed";
      row.appendChild(key);
      row.appendChild(document.createTextNode(r.label));
      const val = div("tip-val", r.value);
      row.appendChild(val);
      t.appendChild(row);
    }
    t.style.display = "block";
    const vw = window.innerWidth, vh = window.innerHeight;
    const bw = t.offsetWidth, bh = t.offsetHeight;
    let x = clientX + 14, y = clientY + 14;
    if (x + bw > vw - 8) x = clientX - bw - 14;
    if (y + bh > vh - 8) y = clientY - bh - 14;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  function hideTip() { if (tipEl) tipEl.style.display = "none"; }

  /* ============================================================
     log-log chart scaffold — persistent SVG + layered groups.
     Caller sets the domain each update and redraws layers; the
     svg node itself (and any hit targets) survive updates so
     in-flight pointer drags are never cancelled.
     ============================================================ */
  let uid = 0;
  function makeChart(cfg) {
    const W = cfg.W, H = cfg.H, m = cfg.m;
    const svg = h("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": cfg.ariaLabel || "chart" });
    svg.style.width = "100%";
    svg.style.touchAction = "none";
    svg.style.fontFamily = "system-ui, sans-serif";
    const clipId = "chart-clip-" + (++uid);
    svg.appendChild(h("defs", {},
      h("clipPath", { id: clipId },
        h("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }))));
    const layers = {
      wash: h("g"),
      grid: h("g"),
      series: h("g", { "clip-path": "url(#" + clipId + ")" }),
      anno: h("g"),
      cross: h("g"),
      marker: h("g"),
    };
    svg.appendChild(layers.wash);
    svg.appendChild(layers.grid);
    svg.appendChild(layers.series);
    svg.appendChild(layers.anno);
    svg.appendChild(layers.cross);
    svg.appendChild(layers.marker);

    let x0 = 1, x1 = 10, y0 = 1, y1 = 10; // log-log domain
    const chart = {
      svg, layers, W, H, m, clipId,
      setDomain(nx0, nx1, ny0, ny1) { x0 = nx0; x1 = nx1; y0 = ny0; y1 = ny1; },
      px(v) { return m.l + ((Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * (W - m.l - m.r); },
      py(v) { return H - m.b - ((Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * (H - m.t - m.b); },
      fromPx(x) { return Math.pow(10, Math.log10(x0) + ((x - m.l) / (W - m.l - m.r)) * (Math.log10(x1) - Math.log10(x0))); },
      domain() { return { x0, x1, y0, y1 }; },
      // gridlines at powers of 10 within the current domain
      drawGrid(opts) {
        const g = layers.grid;
        g.innerHTML = "";
        const xFmt = opts.xFmt || "si", yFmt = opts.yFmt || "time";
        if (opts.xTicks) {
          for (const t of opts.xTicks) {
            const x = chart.px(t.v);
            g.appendChild(h("line", { x1: x, y1: m.t, x2: x, y2: H - m.b, stroke: CHR.grid, "stroke-width": 1 }));
            if (t.label != null) {
              g.appendChild(h("text", { x: x, y: H - m.b + 16, "text-anchor": "middle", "font-size": 11, fill: CHR.muted }, t.label));
            }
          }
        } else {
          for (let e = Math.ceil(Math.log10(x0) - 1e-9); e <= Math.floor(Math.log10(x1) + 1e-9); e++) {
            const v = Math.pow(10, e);
            const x = chart.px(v);
            g.appendChild(h("line", { x1: x, y1: m.t, x2: x, y2: H - m.b, stroke: CHR.grid, "stroke-width": 1 }));
            g.appendChild(h("text", { x: x, y: H - m.b + 16, "text-anchor": "middle", "font-size": 11, fill: CHR.muted }, Core.fmt(v, xFmt)));
          }
        }
        for (let e = Math.ceil(Math.log10(y0) - 1e-9); e <= Math.floor(Math.log10(y1) + 1e-9); e++) {
          const v = Math.pow(10, e);
          const y = chart.py(v);
          g.appendChild(h("line", { x1: m.l, y1: y, x2: W - m.r, y2: y, stroke: CHR.grid, "stroke-width": 1 }));
          g.appendChild(h("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", "font-size": 11, fill: CHR.muted },
            yFmt === "x" ? Core.fmt(v, "si") + "×" : Core.fmt(v, yFmt)));
        }
        g.appendChild(h("line", { x1: m.l, y1: H - m.b, x2: W - m.r, y2: H - m.b, stroke: CHR.axis, "stroke-width": 1 }));
        if (opts.xLabel) {
          g.appendChild(h("text", { x: (m.l + W - m.r) / 2, y: H - 8, "text-anchor": "middle", "font-size": 11.5, fill: CHR.ink2 }, opts.xLabel));
        }
        if (opts.yLabel) {
          g.appendChild(h("text", { x: 14, y: (m.t + H - m.b) / 2, "font-size": 11.5, fill: CHR.ink2, "text-anchor": "middle", transform: "rotate(-90 14 " + (m.t + H - m.b) / 2 + ")" }, opts.yLabel));
        }
      },
      // sample fn(x) across the x-domain; returns an SVG path "d" (skips non-finite)
      pathFor(fn, steps) {
        steps = steps || 120;
        const parts = [];
        let pen = false;
        for (let i = 0; i <= steps; i++) {
          const x = Math.pow(10, Math.log10(x0) + (i / steps) * (Math.log10(x1) - Math.log10(x0)));
          const y = fn(x);
          if (!fin(y) || y <= 0) { pen = false; continue; }
          parts.push((pen ? "L" : "M") + chart.px(x).toFixed(1) + " " + chart.py(y).toFixed(1));
          pen = true;
        }
        return parts.join(" ");
      },
      line(fn, color, width, dashed) {
        return h("path", {
          d: chart.pathFor(fn), fill: "none", stroke: color,
          "stroke-width": width || 2, "stroke-linecap": "round", "stroke-linejoin": "round",
          "stroke-dasharray": dashed ? "6 5" : null,
        });
      },
    };
    return chart;
  }

  /* crosshair: vertical hairline + shared tooltip. getRows(xValue) →
     { xLabel, rows:[{color,dashed,label,value}] } or null to hide. */
  function attachCrosshair(chart, getRows, isDragging) {
    const hair = h("line", { stroke: CHR.axis, "stroke-width": 1, "stroke-dasharray": "2 3", visibility: "hidden" });
    chart.layers.cross.appendChild(hair);
    chart.svg.addEventListener("pointermove", function (ev) {
      if (isDragging && isDragging()) { hair.setAttribute("visibility", "hidden"); hideTip(); return; }
      const rect = chart.svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * chart.W;
      if (sx < chart.m.l || sx > chart.W - chart.m.r) { hair.setAttribute("visibility", "hidden"); hideTip(); return; }
      const info = getRows(chart.fromPx(sx));
      if (!info) { hair.setAttribute("visibility", "hidden"); hideTip(); return; }
      hair.setAttribute("x1", sx); hair.setAttribute("x2", sx);
      hair.setAttribute("y1", chart.m.t); hair.setAttribute("y2", chart.H - chart.m.b);
      hair.setAttribute("visibility", "visible");
      showTip(ev.clientX, ev.clientY, info.xLabel, info.rows);
    });
    chart.svg.addEventListener("pointerleave", function () {
      hair.setAttribute("visibility", "hidden");
      hideTip();
    });
    // page scroll moves the chart out from under a stationary cursor; hide rather than strand the tip
    window.addEventListener("scroll", function () {
      hair.setAttribute("visibility", "hidden");
      hideTip();
    }, { passive: true, capture: true });
    return hair;
  }

  /* draggable vertical marker: line + flag + ≥24px invisible hit strip.
     Persistent nodes; update via api.setX(). onDrag(xValue, phase) with
     phase in {"down","move","up"}. */
  function makeVMarker(chart, color, onDrag) {
    const g = chart.layers.marker;
    const line = h("line", { stroke: color, "stroke-width": 2, "stroke-linecap": "round" });
    const knob = h("circle", { r: 5, fill: color, stroke: CHR.surface, "stroke-width": 2 });
    const flagBg = h("rect", { rx: 4, fill: color });
    const flagTx = h("text", { "font-size": 11, "font-weight": 700, fill: CHR.surface, "text-anchor": "middle" });
    const hit = h("rect", { fill: "transparent", cursor: "ew-resize", width: 28, y: chart.m.t - 20, height: chart.H - chart.m.t - chart.m.b + 20, role: "slider", "aria-label": "drag to move the chart marker" });
    g.appendChild(line); g.appendChild(knob); g.appendChild(flagBg); g.appendChild(flagTx); g.appendChild(hit);
    let dragging = false;
    function xFromEvent(ev) {
      const rect = chart.svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * chart.W;
      const d = chart.domain();
      return Math.min(d.x1, Math.max(d.x0, chart.fromPx(sx)));
    }
    hit.addEventListener("pointerdown", function (ev) {
      dragging = true;
      hit.setPointerCapture(ev.pointerId);
      hideTip();
      onDrag(xFromEvent(ev), "down");
      ev.preventDefault();
    });
    hit.addEventListener("pointermove", function (ev) { if (dragging) onDrag(xFromEvent(ev), "move"); });
    function up(ev) { if (dragging) { dragging = false; onDrag(xFromEvent(ev), "up"); } }
    hit.addEventListener("pointerup", up);
    hit.addEventListener("pointercancel", up);
    return {
      isDragging() { return dragging; },
      setX(xv, flagText) {
        const x = chart.px(xv);
        line.setAttribute("x1", x); line.setAttribute("x2", x);
        line.setAttribute("y1", chart.m.t); line.setAttribute("y2", chart.H - chart.m.b);
        knob.setAttribute("cx", x); knob.setAttribute("cy", chart.H - chart.m.b);
        hit.setAttribute("x", x - 14);
        flagTx.textContent = flagText;
        // size the flag around the text, clamped inside the viewBox
        const w = Math.max(30, flagText.length * 6.4 + 12);
        const fx = Math.min(Math.max(x, chart.m.l + w / 2), chart.W - chart.m.r - w / 2 + 20);
        flagTx.setAttribute("x", fx); flagTx.setAttribute("y", chart.m.t - 6);
        flagBg.setAttribute("x", fx - w / 2); flagBg.setAttribute("y", chart.m.t - 19);
        flagBg.setAttribute("width", w); flagBg.setAttribute("height", 17);
      },
    };
  }

  function legendKey(color, label, dashed) {
    const lg = div("lg");
    const k = div("key-line");
    k.style.borderTopColor = color;
    if (dashed) k.style.borderTopStyle = "dashed";
    lg.appendChild(k);
    lg.appendChild(document.createTextNode(label));
    return lg;
  }

  /* ============================================================
     roofline-chart — the flagship. x = global batch B (tokens,
     1e4..1e9 log), y = time per layer (log). Series per SPEC
     physics (F = per-expert width: math moves k·F, weights E·F),
     all N = X·Y chips in use. Pure schemes select their actual
     collective fabric; the mixed curve uses the TPU closed form or
     a topology-aware GPU search, constrained to 1 ≤ X ≤ N.
     Toggle: absolute times ↔ ratio T_math/T_comms (hairline at 1,
     red wash below = comms-bound). Draggable marker at current B.
     ============================================================ */
  Widgets.register("roofline-chart", function (el, opts) {
    el.innerHTML = "";
    let view = "times";
    const SCRUB = "#006300";

    const title = div("w-title", "Core DP/FSDP/TP rooflines — time per layer as the batch grows");
    const tabs = div("tabs");
    const btnT = document.createElement("button");
    btnT.textContent = "absolute times";
    const btnR = document.createElement("button");
    btnR.textContent = "ratio: T_math ÷ T_comms";
    tabs.appendChild(btnT); tabs.appendChild(btnR);
    const legend = div("legend");
    const chart = makeChart({
      W: 720, H: 390, m: { l: 66, r: 26, t: 40, b: 46 },
      ariaLabel: "log-log chart of per-layer compute and communication time versus global batch size",
    });
    const readout = div("w-readout");
    readout.style.marginTop = "0.35rem";
    el.appendChild(title); el.appendChild(tabs); el.appendChild(legend);
    el.appendChild(chart.svg); el.appendChild(readout);

    const BX0 = 1e4, BX1 = 1e9;

    function bestMixed(S, B, N) {
      if (!S.gpu) {
        const raw = Math.sqrt((B * S.MDP * N) / (S.E * S.F * S.MTP));
        const x = Math.max(1, Math.min(N, raw));
        const t = Core.mixedTimes(S, x, N / x, B);
        return { x, time: t.tcomms };
      }
      // The GPU curve is piecewise because the inner TP axis must cross a
      // whole NVLink domain before it reduces the scale-out FSDP bottleneck.
      let best = { x: 1, time: Infinity };
      const steps = 192;
      for (let i = 0; i <= steps; i++) {
        const x = Math.pow(N, i / steps);
        const t = Core.mixedTimes(S, x, N / x, B).tcomms;
        if (t < best.time) best = { x, time: t };
      }
      return best;
    }

    // series definitions, closed over live state at render time
    function seriesFns(S) {
      const N = Math.max(1, S.DP * S.TP);
      const tmath = (B) => (4 * B * S.D * S.k * S.F) / (N * S.C);
      const Wdp = Core.collectiveBandwidth(S, N, S.MDP);
      const Wtp = Core.collectiveBandwidth(S, N, S.MTP);
      const defs = [
        { label: "T_math (compute, all " + Core.fmt(N, "si") + " chips)", color: CHR.ink, dashed: true, fn: tmath, isMath: true },
        { label: "data parallel / FSDP comms (W=" + Core.fmt(Wdp, "bw") + ")", color: SER.s1, fn: () => (4 * S.D * S.E * S.F) / Wdp },
        { label: "tensor parallel comms (W=" + Core.fmt(Wtp, "bw") + ")", color: SER.s2, fn: (B) => (4 * B * S.D) / Wtp },
        { label: "mixed FSDP+TP (best constrained continuous " + axLabel("X") + "," + axLabel("Y") + ") comms", color: SER.s3, fn: (B) => bestMixed(S, B, N).time },
      ];
      return { defs, tmath };
    }
    // what's actually plotted in the current view
    function plotted(S) {
      const { defs, tmath } = seriesFns(S);
      if (view === "times") return defs;
      return defs.filter((d) => !d.isMath).map((d) => ({
        label: d.label, color: d.color, dashed: d.dashed,
        fn: (B) => tmath(B) / d.fn(B),
      }));
    }

    function yDomain(S) {
      let lo = Infinity, hi = -Infinity;
      for (const d of plotted(S)) {
        for (const bx of [BX0, BX1]) {
          const v = d.fn(bx);
          if (fin(v) && v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
      }
      if (!fin(lo) || !fin(hi)) { lo = 1e-6; hi = 1; }
      if (view === "ratio") { lo = Math.min(lo, 0.3); hi = Math.max(hi, 3); }
      let e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
      // clamp sanely
      e0 = Math.max(e0, view === "times" ? -9 : -6);
      e1 = Math.min(e1, view === "times" ? 5 : 6);
      if (e1 <= e0) e1 = e0 + 1;
      if (e1 - e0 > 10) e0 = e1 - 10;
      return [Math.pow(10, e0), Math.pow(10, e1)];
    }

    const marker = makeVMarker(chart, SCRUB, function (xv, phase) {
      const b = Math.min(BX1, Math.max(BX0, snap125(xv)));
      if (fin(b)) Core.set({ B: b });
    });

    attachCrosshair(chart, function (bx) {
      const S = Core.getEffective();
      const rows = plotted(S).map((d) => {
        const v = d.fn(bx);
        return { color: d.color, dashed: d.dashed, label: d.label, value: view === "times" ? Core.fmt(v, "time") : Core.fmt(v, "x") };
      });
      return { xLabel: "B = " + Core.fmt(bx, "si") + " tokens", rows };
    }, marker.isDragging);

    btnT.addEventListener("click", function () { view = "times"; render(Core.getEffective()); });
    btnR.addEventListener("click", function () { view = "ratio"; render(Core.getEffective()); });

    function render(S) {
      btnT.setAttribute("aria-pressed", view === "times");
      btnR.setAttribute("aria-pressed", view === "ratio");
      const [y0, y1] = yDomain(S);
      chart.setDomain(BX0, BX1, y0, y1);
      chart.drawGrid({
        xFmt: "si", yFmt: view === "times" ? "time" : "x",
        xLabel: "global batch B (tokens per step)",
        yLabel: view === "times" ? "time per layer" : "T_math ÷ T_comms (>1 ⇒ compute wins)",
      });

      // washes + reference hairline (ratio view)
      chart.layers.wash.innerHTML = "";
      chart.layers.anno.innerHTML = "";
      if (view === "ratio" && 1 > y0 && 1 < y1) {
        const yOne = chart.py(1);
        chart.layers.wash.appendChild(h("rect", {
          x: chart.m.l, y: yOne, width: chart.W - chart.m.l - chart.m.r,
          height: chart.H - chart.m.b - yOne, fill: "rgba(208,59,59,0.07)",
        }));
        chart.layers.anno.appendChild(h("line", {
          x1: chart.m.l, y1: yOne, x2: chart.W - chart.m.r, y2: yOne,
          stroke: CHR.ink, "stroke-width": 1,
        }));
        chart.layers.anno.appendChild(h("text", {
          x: chart.m.l + 8, y: chart.H - chart.m.b - 8, "font-size": 10.5, fill: "#8f2222", "font-weight": 600,
        }, "comms-bound (ratio < 1)"));
      }

      // series
      const defs = plotted(S);
      chart.layers.series.innerHTML = "";
      for (const d of defs) {
        chart.layers.series.appendChild(chart.line(d.fn, d.color, 2, d.dashed));
      }

      // direct end-labels where they fit (ink text + colored tick, no overlap)
      const used = [];
      for (const d of defs) {
        const v = d.fn(BX1);
        if (!fin(v) || v <= y0 || v >= y1) continue;
        let y = chart.py(v);
        if (used.some((u) => Math.abs(u - y) < 13)) continue;
        used.push(y);
        const short = d.isMath ? "T_math" : d.label.indexOf("data") === 0 ? "DP / FSDP" : d.label.indexOf("tensor") === 0 ? "TP" : "mixed";
        chart.layers.anno.appendChild(h("line", { x1: chart.W - chart.m.r - 2, y1: y, x2: chart.W - chart.m.r + 8, y2: y, stroke: d.color, "stroke-width": 3, "stroke-linecap": "round", "stroke-dasharray": d.dashed ? "3 3" : null }));
        chart.layers.anno.appendChild(h("text", { x: chart.W - chart.m.r - 6, y: y - 5, "text-anchor": "end", "font-size": 10.5, fill: CHR.ink2, "font-weight": 600 }, short));
      }

      // draggable marker at current B
      const bNow = Math.min(BX1, Math.max(BX0, S.B));
      marker.setX(bNow, "B = " + Core.fmt(S.B, "si"));

      // readout: the verdict at the current B
      const { tmath } = seriesFns(S);
      const N = Math.max(1, S.DP * S.TP);
      const optimum = bestMixed(S, S.B, N);
      const best = optimum.time;
      const tm = tmath(S.B);
      const ok = fin(tm) && fin(best) && tm >= best;
      readout.textContent = "At B = " + Core.fmt(S.B, "si") + ": T_math " + Core.fmt(tm, "time") +
        " vs best constrained mixed comms " + Core.fmt(best, "time") +
        " at " + axLabel("X") + "≈" + Core.fmt(optimum.x, "si") +
        ", " + axLabel("Y") + "≈" + Core.fmt(N / optimum.x, "si") +
        (ok ? " — compute-bound with " + Core.fmt(tm / best, "x") + " headroom." : " — comms-bound by " + Core.fmt(best / tm, "x") + ".");

      // legend
      legend.innerHTML = "";
      for (const d of defs) legend.appendChild(legendKey(d.color, view === "ratio" ? "T_math ÷ " + d.label : d.label, d.dashed));
    }

    return { update: render };
  });

  /* ============================================================
     xy-explorer — split a fixed N = X·Y between FSDP (X) and
     TP (Y). x-axis: X in powers of 2 from 1..N (log2). Curves
     (F = per-expert width: math moves k·F, weights E·F):
       T_fsdp(X) source closed form on TPU; hierarchical on GPU
       T_tp(X) uses the fabric carrying Y = N/X
       max(both)                          s3 aqua, 3px (what you pay)
       T_math    = 4·B·D·k·F/(N·C)        ink dashed horizontal
     Green wash where max < T_math (compute-bound). Draggable
     marker on current X snaps to powers of 2 and sets Y = N/X.
     Dotted drop-line at X_opt = √(B·MX·N/(E·F·MY)).
     ============================================================ */
  Widgets.register("xy-explorer", function (el, opts) {
    el.innerHTML = "";
    const SCRUB = "#006300";

    const title = div("w-title"); // text set each render (axis names follow the notation toggle)
    const legend = div("legend"); // rebuilt each render (labels name axes)
    const chart = makeChart({
      W: 720, H: 380, m: { l: 66, r: 26, t: 40, b: 46 },
      ariaLabel: "log-log chart of FSDP and tensor-parallel communication time versus the FSDP shard count, for fixed total chips",
    });
    const readout = div("w-readout");
    readout.style.marginTop = "0.35rem";
    el.appendChild(title); el.appendChild(legend); el.appendChild(chart.svg); el.appendChild(readout);

    function fns(S) {
      const N = Math.max(1, S.DP * S.TP);
      const at = (x) => Core.mixedTimes(S, x, N / x);
      return {
        N,
        tfsdp: (x) => at(x).tfsdp,
        ttp: (x) => at(x).ttp,
        tmath: at(Math.max(1, S.DP)).tmath,
      };
    }

    function optimum(S, f) {
      if (!S.gpu) {
        const raw = Math.sqrt((S.B * S.MDP * f.N) / (S.E * S.F * S.MTP));
        const x = Math.max(1, Math.min(f.N, raw));
        return { x, value: Math.max(f.tfsdp(x), f.ttp(x)) };
      }
      let best = { x: 1, value: Infinity };
      const steps = 240;
      for (let i = 0; i <= steps; i++) {
        const x = Math.pow(f.N, i / steps);
        const v = Math.max(f.tfsdp(x), f.ttp(x));
        if (v < best.value) best = { x, value: v };
      }
      return best;
    }

    // drag: capture N at pointerdown so setting X mid-drag can't change the budget
    let nFixed = null;
    const marker = makeVMarker(chart, SCRUB, function (xv, phase) {
      if (phase === "down") nFixed = Math.max(1, Core.get().DP * Core.get().TP);
      const N = nFixed != null ? nFixed : Math.max(1, Core.get().DP * Core.get().TP);
      let x = Math.pow(2, Math.round(Math.log2(Math.max(1, xv))));
      x = Math.min(N, Math.max(1, x));
      x = Math.max(x, N / 8192); // keep Y within its clamp so X·Y stays = N
      if (fin(x) && fin(N / x)) Core.set({ DP: x, TP: N / x });
      if (phase === "up") nFixed = null;
    });

    attachCrosshair(chart, function (xv) {
      const S = Core.getEffective();
      const f = fns(S);
      const x = Math.min(f.N, Math.max(1, Math.pow(2, Math.round(Math.log2(Math.max(1, xv))))));
      const a = f.tfsdp(x), b = f.ttp(x);
      return {
        xLabel: axLabel("X") + " = " + Core.fmt(x, "si") + "  (" + axLabel("Y") + " = " + Core.fmt(f.N / x, "si") + ")",
        rows: [
          { color: SER.s1, label: "T_fsdp", value: Core.fmt(a, "time") },
          { color: SER.s2, label: "T_tp", value: Core.fmt(b, "time") },
          { color: SER.s3, label: "max (comms)", value: Core.fmt(Math.max(a, b), "time") },
          { color: CHR.ink, dashed: true, label: "T_math", value: Core.fmt(f.tmath, "time") },
        ],
      };
    }, marker.isDragging);

    function render(S) {
      const aX = axLabel("X"), aY = axLabel("Y");
      title.textContent = "Splitting N chips between FSDP (" + aX + ") and tensor parallelism (" + aY + " = N ÷ " + aX + ")";
      legend.innerHTML = "";
      legend.appendChild(legendKey(SER.s1, "T_fsdp — weight comms, grows with " + aX));
      legend.appendChild(legendKey(SER.s2, "T_tp — activation comms, shrinks with " + aX));
      legend.appendChild(legendKey(SER.s3, "max(T_fsdp, T_tp) — what you actually wait for"));
      legend.appendChild(legendKey(CHR.ink, "T_math — compute per layer", true));
      chart.svg.setAttribute("aria-label",
        "log-log chart of FSDP and tensor-parallel communication time versus the FSDP shard count " + aX + ", for fixed total chips");
      const f = fns(S);
      const N = f.N;
      const X1 = Math.max(2, N);

      // y-domain: fit endpoints of every curve + tmath, snap to decades
      let lo = Infinity, hi = -Infinity;
      for (const v of [f.tfsdp(1), f.tfsdp(X1), f.ttp(1), f.ttp(X1), f.tmath]) {
        if (fin(v) && v > 0) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
      if (!fin(lo) || !fin(hi)) { lo = 1e-6; hi = 1; }
      let e0 = Math.max(-9, Math.floor(Math.log10(lo)));
      let e1 = Math.min(5, Math.ceil(Math.log10(hi)));
      if (e1 <= e0) e1 = e0 + 1;
      if (e1 - e0 > 10) e0 = e1 - 10;
      const y0 = Math.pow(10, e0), y1 = Math.pow(10, e1);
      chart.setDomain(1, X1, y0, y1);

      // x ticks at powers of 2; thin labels when crowded
      const kMax = Math.floor(Math.log2(X1) + 1e-9);
      const every = Math.max(1, Math.ceil((kMax + 1) / 11));
      const xTicks = [];
      for (let k = 0; k <= kMax; k++) {
        xTicks.push({ v: Math.pow(2, k), label: k % every === 0 ? Core.fmt(Math.pow(2, k), "si") : null });
      }
      chart.drawGrid({
        xTicks, yFmt: "time",
        xLabel: aX + " — chips spent on FSDP (" + aY + " = N ÷ " + aX + " on tensor parallelism)",
        yLabel: "time per layer",
      });

      // Green wash: sample the actual topology-aware clocks. This remains
      // correct across GPU fabric boundaries, where the closed-form TPU
      // interval no longer applies.
      chart.layers.wash.innerHTML = "";
      let washMin = Infinity, washMax = -Infinity;
      const washSteps = 160;
      for (let i = 0; i < washSteps; i++) {
        const xa = Math.pow(X1, i / washSteps);
        const xb = Math.pow(X1, (i + 1) / washSteps);
        const xm = Math.sqrt(xa * xb);
        if (Math.max(f.tfsdp(xm), f.ttp(xm)) >= f.tmath) continue;
        washMin = Math.min(washMin, xa); washMax = Math.max(washMax, xb);
        chart.layers.wash.appendChild(h("rect", {
          x: chart.px(xa), y: chart.m.t,
          width: Math.max(0, chart.px(xb) - chart.px(xa) + 0.5),
          height: chart.H - chart.m.t - chart.m.b, fill: "rgba(12,163,12,0.07)",
        }));
      }
      if (fin(washMin) && fin(washMax)) {
        chart.layers.wash.appendChild(h("text", {
          x: (chart.px(washMin) + chart.px(washMax)) / 2, y: chart.m.t + 14, "text-anchor": "middle",
          "font-size": 10.5, fill: "#075607", "font-weight": 600,
        }, "compute-bound"));
      }

      // series
      chart.layers.series.innerHTML = "";
      const lFsdp = chart.line(f.tfsdp, SER.s1, 2);
      const lTp = chart.line(f.ttp, SER.s2, 2);
      lFsdp.setAttribute("opacity", "0.55");
      lTp.setAttribute("opacity", "0.55");
      chart.layers.series.appendChild(lFsdp);
      chart.layers.series.appendChild(lTp);
      chart.layers.series.appendChild(chart.line((x) => Math.max(f.tfsdp(x), f.ttp(x)), SER.s3, 2));
      if (fin(f.tmath) && f.tmath > 0) {
        chart.layers.series.appendChild(h("line", {
          x1: chart.m.l, y1: chart.py(f.tmath), x2: chart.W - chart.m.r, y2: chart.py(f.tmath),
          stroke: CHR.ink, "stroke-width": 2, "stroke-linecap": "round", "stroke-dasharray": "6 5",
        }));
      }

      // annotations: T_math end label + X_opt dotted drop-line
      chart.layers.anno.innerHTML = "";
      if (fin(f.tmath) && f.tmath > y0 && f.tmath < y1) {
        chart.layers.anno.appendChild(h("text", {
          x: chart.W - chart.m.r - 4, y: chart.py(f.tmath) - 6, "text-anchor": "end",
          "font-size": 10.5, fill: CHR.ink2, "font-weight": 600,
        }, "T_math"));
      }
      const opt = optimum(S, f);
      const xOpt = opt.x;
      if (fin(xOpt) && xOpt >= 1 && xOpt <= X1) {
        const vOpt = opt.value;
        const yTop = fin(vOpt) && vOpt > 0 ? Math.max(chart.m.t, Math.min(chart.H - chart.m.b, chart.py(vOpt))) : chart.m.t;
        chart.layers.anno.appendChild(h("line", {
          x1: chart.px(xOpt), y1: yTop, x2: chart.px(xOpt), y2: chart.H - chart.m.b,
          stroke: CHR.ink2, "stroke-width": 1.5, "stroke-dasharray": "1 4", "stroke-linecap": "round",
        }));
        chart.layers.anno.appendChild(h("text", {
          x: chart.px(xOpt), y: yTop - 6, "text-anchor": "middle",
          "font-size": 10.5, fill: CHR.ink2, "font-weight": 600,
        }, aX + "_opt ≈ " + Core.fmt(xOpt, "si")));
      }

      // marker at current X
      const xNow = Math.min(X1, Math.max(1, S.DP));
      marker.setX(xNow, aX + " = " + Core.fmt(S.DP, "si") + " · " + aY + " = " + Core.fmt(S.TP, "si"));

      // readout row: X, Y, T_fsdp, T_tp, T_math, verdict pill
      const a = f.tfsdp(S.DP), b = f.ttp(S.DP);
      const comms = Math.max(a, b);
      const ok = fin(f.tmath) && fin(comms) && f.tmath >= comms;
      readout.textContent = "";
      readout.appendChild(document.createTextNode(
        aX + " = " + Core.fmt(S.DP, "si") + " · " + aY + " = " + Core.fmt(S.TP, "si") +
        " · T_fsdp " + Core.fmt(a, "time") + " · T_tp " + Core.fmt(b, "time") +
        " · T_math " + Core.fmt(f.tmath, "time") + "  "));
      const pill = document.createElement("span");
      pill.className = "verdict " + (ok ? "ok" : "bad");
      pill.textContent = ok ? "compute-bound ✓" : "comms-bound ✗";
      readout.appendChild(pill);
    }

    return { update: render };
  });
})();
