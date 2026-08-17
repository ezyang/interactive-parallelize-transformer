/* ============================================================
   pipeline.js — widget: "pipeline-schedule".
   Gantt chart of pipeline-parallel training: Z devices (rows) ×
   time (columns), generated live from state Z and Mmicro.
   Modes: naive (GPipe) / 1F1B / overlap-dW (DeepSeek-v3 style).
   Forward = 1 cell; backward split into dx (1 cell) + dW (1 cell),
   so backward = 2× forward, as in the chapter.
   ============================================================ */
(function () {
  "use strict";
  const Core = window.Core;
  const Widgets = window.Widgets;
  if (!Core || !Widgets) return;
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

  /* ---------- schedule generator (self-tested standalone in node) ----------
     Cell = {d, t, j, ph} with ph in "F" | "dx" | "dW"; cell at time t
     occupies [t, t+1). Dependencies (end-of-cell → start-of-next):
       F(d,j)  needs F(d-1,j) done (d>0)
       dx(d,j) needs dx(d+1,j) done (d<Z-1), else F(Z-1,j) done
       dW(d,j) needs dx(d,j) done
     In naive & 1F1B the backward is a FUSED block: dx then dW back to back on
     the same device, and the upstream stage waits for the WHOLE block (dW end)
     — this reproduces the chapter's GPipe bubble (Z-1)/(M+Z-1) exactly.
     In overlap-dW mode, dx is handed upstream the moment it finishes and dW
     becomes a free-floating filler task slid into idle slots (DeepSeek-v3
     style); T is measured from the schedule, not closed-form —
     the tail dW still trails dx, so T = 2M + 2(Z-1) + 1. */
  function genSchedule(Z, M, mode) {
    const fDone = [], xDone = [], wDone = []; // end times per [d][j]
    for (let d = 0; d < Z; d++) {
      fDone.push(new Array(M).fill(Infinity));
      xDone.push(new Array(M).fill(Infinity));
      wDone.push(new Array(M).fill(Infinity));
    }
    // per-device critical queue, executed strictly in order (blocking)
    const queues = [];
    for (let d = 0; d < Z; d++) {
      const q = [];
      if (mode === "naive") {
        for (let j = 0; j < M; j++) q.push({ ph: "F", j: j });
        for (let j = M - 1; j >= 0; j--) { q.push({ ph: "dx", j: j }); q.push({ ph: "dW", j: j }); }
      } else {
        // 1F1B ordering (also the critical queue for overlap mode)
        const W = Math.min(Z - 1 - d, M);
        for (let j = 0; j < W; j++) q.push({ ph: "F", j: j });
        let f = W, b = 0;
        while (f < M || b < M) {
          if (f < M) { q.push({ ph: "F", j: f }); f++; }
          if (b < M) {
            q.push({ ph: "dx", j: b });
            if (mode !== "overlap") q.push({ ph: "dW", j: b });
            b++;
          }
        }
      }
      queues.push(q);
    }
    // overlap mode: per-device pool of deferred dW work, FIFO by dx completion
    const wPool = [];
    for (let d = 0; d < Z; d++) wPool.push([]);

    function ready(d, task, t) {
      const j = task.j;
      if (task.ph === "F") return d === 0 ? true : fDone[d - 1][j] <= t;
      if (task.ph === "dx") {
        if (d === Z - 1) return fDone[d][j] <= t;
        return (mode === "overlap" ? xDone[d + 1][j] : wDone[d + 1][j]) <= t;
      }
      return xDone[d][j] <= t; // dW
    }

    const cells = [];
    const heads = new Array(Z).fill(0);
    let t = 0, doneCount = 0;
    const total = Z * M * 3;
    const TMAX = 12 * (M + Z) + 64; // safety net; never hit in tests
    while (doneCount < total && t < TMAX) {
      for (let d = 0; d < Z; d++) {
        let task = null;
        const q = queues[d];
        if (heads[d] < q.length && ready(d, q[heads[d]], t)) {
          task = q[heads[d]];
          heads[d]++;
        } else if (mode === "overlap" && wPool[d].length && xDone[d][wPool[d][0]] <= t) {
          task = { ph: "dW", j: wPool[d].shift() };
        }
        if (!task) continue;
        const j = task.j;
        cells.push({ d: d, t: t, j: j, ph: task.ph });
        doneCount++;
        if (task.ph === "F") fDone[d][j] = t + 1;
        else if (task.ph === "dx") {
          xDone[d][j] = t + 1;
          if (mode === "overlap") wPool[d].push(j);
        } else wDone[d][j] = t + 1;
      }
      t++;
    }
    const T = cells.reduce((m, c) => Math.max(m, c.t + 1), 0);
    // max in-flight microbatches on any device: activation of j lives on
    // stage d from the start of F(d,j) until dW(d,j) has consumed it.
    let maxIF = 0;
    for (let d = 0; d < Z; d++) {
      const events = [];
      for (let j = 0; j < M; j++) {
        if (isFinite(fDone[d][j])) events.push([fDone[d][j] - 1, 1]);
        if (isFinite(wDone[d][j])) events.push([wDone[d][j], -1]);
      }
      events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let n = 0;
      for (const e of events) { n += e[1]; if (n > maxIF) maxIF = n; }
    }
    return { Z: Z, M: M, T: T, busy: cells.length, cells: cells, maxInFlight: maxIF };
  }

  // drawn-size budget rules (readouts always use the TRUE Z, Mmicro)
  function drawBudget(Z, M) {
    let Zd = Z, Md = M;
    let guard = 0;
    while (Zd * (3 * Md + 2 * Zd) > 4000 && guard++ < 40) {
      if (Md > 4 && Md >= Zd) Md = Math.ceil(Md / 2);
      else Zd = Math.ceil(Zd / 2);
    }
    return { Zd: Zd, Md: Md, clamped: Zd !== Z || Md !== M };
  }

  const MODES = [
    { id: "naive", label: "naive (GPipe)" },
    { id: "1f1b", label: "1F1B" },
    { id: "overlap", label: "overlap dW" },
  ];

  Widgets.register("pipeline-schedule", function (el, opts) {
    el.innerHTML = "";
    let mode = "naive";

    const title = div("w-title", "The pipeline schedule — rows are devices, each column is one forward-pass-sized slice of time");
    const tabs = div("tabs");
    const btns = {};
    for (const m of MODES) {
      const b = document.createElement("button");
      b.textContent = m.label;
      b.setAttribute("aria-pressed", m.id === mode ? "true" : "false");
      b.addEventListener("click", function () { mode = m.id; render(Core.get()); });
      tabs.appendChild(b);
      btns[m.id] = b;
    }

    // legend (HTML row, swatches from the binding palette)
    const legend = div("legend");
    function swatchKey(fill, label, hatched) {
      const lg = div("lg");
      const sw = document.createElement("span");
      sw.style.cssText = "display:inline-block;width:12px;height:12px;border-radius:2px;" +
        (hatched
          ? "background:repeating-linear-gradient(45deg,#fcfcfb,#fcfcfb 2px,#c3c2b7 2px,#c3c2b7 3px);border:1px solid #c3c2b7;"
          : "background:" + fill + ";");
      lg.appendChild(sw);
      lg.appendChild(document.createTextNode(label));
      return lg;
    }
    legend.appendChild(swatchKey(SER.s1, "forward"));
    legend.appendChild(swatchKey(SER.s2, "backward ∂L/∂x (dx)"));
    legend.appendChild(swatchKey(SER.s3, "backward ∂L/∂W (dW)"));
    legend.appendChild(swatchKey(null, "bubble (idle)", true));

    const svgWrap = div("");
    svgWrap.style.position = "relative";
    const note = div("w-readout"); // clamp note, hidden unless needed
    note.style.cssText = "font-size:0.8rem;color:#898781;margin-top:0.25rem;";
    note.hidden = true;
    const readout = div("w-readout");
    readout.style.marginTop = "0.4rem";

    // single tooltip, textContent only
    const tip = document.createElement("div");
    tip.style.cssText = "position:absolute;pointer-events:none;background:#0b0b0b;color:#fcfcfb;" +
      "font-size:11px;font-family:system-ui;padding:3px 7px;border-radius:4px;white-space:nowrap;" +
      "z-index:5;display:none;";
    svgWrap.appendChild(tip);

    el.appendChild(title);
    el.appendChild(tabs);
    el.appendChild(legend);
    el.appendChild(svgWrap);
    el.appendChild(note);
    el.appendChild(readout);

    const PHASE_FILL = { F: SER.s1, dx: SER.s2, dW: SER.s3 };
    const PHASE_NAME = { F: "forward", dx: "backward ∂L/∂x", dW: "backward ∂L/∂W" };
    const patId = "pipe-hatch-" + Math.random().toString(36).slice(2, 8);

    function showTip(ev, c) {
      tip.textContent = "device " + c.d + " · microbatch " + c.j + " · " + PHASE_NAME[c.ph];
      tip.style.display = "block";
      const r = svgWrap.getBoundingClientRect();
      let x = ev.clientX - r.left + 12, y = ev.clientY - r.top - 26;
      if (x > r.width - 170) x = ev.clientX - r.left - 160;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    }
    function hideTip() { tip.style.display = "none"; }

    function render(S) {
      for (const m of MODES) btns[m.id].setAttribute("aria-pressed", m.id === mode ? "true" : "false");

      const Z = Math.max(1, Math.round(S.PP));
      const M = Math.max(1, Math.round(S.Mmicro));

      // readouts ALWAYS from the true schedule
      const trueSch = genSchedule(Z, M, mode);
      const budget = drawBudget(Z, M);
      const drawSch = budget.clamped ? genSchedule(budget.Zd, budget.Md, mode) : trueSch;

      drawGantt(drawSch);

      if (budget.clamped) {
        note.hidden = false;
        note.textContent = "Too many cells to draw at Z=" + Z + ", M=" + M +
          " — showing a Z=" + budget.Zd + ", M=" + budget.Md +
          " miniature with the same schedule rules. The numbers below still come from the full schedule.";
      } else {
        note.hidden = true;
      }

      const ideal = 3 * M;
      const bubble = trueSch.T > 0 ? 1 - trueSch.busy / (Z * trueSch.T) : 0;
      readout.textContent =
        "step: " + trueSch.T + " cells vs " + ideal + " ideal (3·M) · " +
        "bubble: " + Core.fmt(bubble, "pct") + " · " +
        "per-device utilization: " + Core.fmt(1 - bubble, "pct") + " · " +
        "max in-flight microbatches per device: " + trueSch.maxInFlight + " of " + M;
    }

    function drawGantt(sch) {
      const Z = sch.Z, T = Math.max(1, sch.T);
      const W = 760, left = 64, right = 10, top = 8, bottom = 30;
      const cellW = (W - left - right) / T;
      const rowH = Math.max(9, Math.min(26, cellW * 1.15));
      const H = top + Z * rowH + bottom;
      const gx = (t) => left + t * cellW;
      const gy = (d) => top + d * rowH;
      const gap = Math.min(2, cellW * 0.18); // 2px surface gap, shrinking only when cells are tiny
      const labelOK = sch.Z * (3 * sch.M + 2 * sch.Z) <= 1800 && cellW >= 14;

      const svg = h("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "pipeline schedule Gantt chart: " + Z + " devices by " + T + " time steps, mode " + mode });
      svg.style.width = "100%";

      // idle-hatch pattern
      svg.appendChild(h("defs", {},
        h("pattern", { id: patId, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
          h("rect", { width: 6, height: 6, fill: CHR.surface }),
          h("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: CHR.axis, "stroke-width": 1 }))));

      // device labels + first/last busy per device (for hatching the bubble)
      const firstBusy = new Array(Z).fill(Infinity);
      const lastBusy = new Array(Z).fill(-1);
      const busySet = new Set();
      for (const c of sch.cells) {
        if (c.t < firstBusy[c.d]) firstBusy[c.d] = c.t;
        if (c.t > lastBusy[c.d]) lastBusy[c.d] = c.t;
        busySet.add(c.d * 100000 + c.t);
      }

      const fs = Math.max(8, Math.min(12, rowH * 0.5));
      for (let d = 0; d < Z; d++) {
        svg.appendChild(h("text", { x: left - 8, y: gy(d) + rowH / 2 + fs * 0.36,
          "text-anchor": "end", "font-size": fs, fill: CHR.ink2 }, "device " + d));
        // hatch idle runs strictly between this device's first and last busy cell
        let runStart = -1;
        for (let t = firstBusy[d]; t <= lastBusy[d] + 1; t++) {
          const idle = t <= lastBusy[d] && !busySet.has(d * 100000 + t);
          if (idle && runStart < 0) runStart = t;
          if (!idle && runStart >= 0) {
            svg.appendChild(h("rect", { x: gx(runStart), y: gy(d) + gap / 2,
              width: (t - runStart) * cellW - gap, height: rowH - gap,
              fill: "url(#" + patId + ")", stroke: CHR.grid, "stroke-width": 0.75, rx: 1 }));
            runStart = -1;
          }
        }
      }

      // task cells
      const labelFS = Math.max(7, Math.min(10.5, cellW * 0.55, rowH * 0.5));
      for (const c of sch.cells) {
        const r = h("rect", { x: gx(c.t), y: gy(c.d) + gap / 2,
          width: Math.max(1, cellW - gap), height: rowH - gap,
          fill: PHASE_FILL[c.ph], rx: 1 });
        r.addEventListener("pointerenter", (ev) => showTip(ev, c));
        r.addEventListener("pointermove", (ev) => showTip(ev, c));
        r.addEventListener("pointerleave", hideTip);
        svg.appendChild(r);
        if (labelOK) {
          const tl = h("text", { x: gx(c.t) + (cellW - gap) / 2, y: gy(c.d) + rowH / 2 + labelFS * 0.36,
            "text-anchor": "middle", "font-size": labelFS, fill: "#fcfcfb",
            "font-weight": 600, "pointer-events": "none" }, String(c.j));
          svg.appendChild(tl);
        }
      }

      // time arrow below
      const ay = top + Z * rowH + 14;
      svg.appendChild(h("line", { x1: left, y1: ay, x2: left + Math.min(150, T * cellW) - 8, y2: ay,
        stroke: CHR.axis, "stroke-width": 1.5 }));
      svg.appendChild(h("path", { d: "M " + (left + Math.min(150, T * cellW) - 8) + " " + ay +
        " l -6 -3.5 l 0 7 z", fill: CHR.axis }));
      svg.appendChild(h("text", { x: left + Math.min(150, T * cellW) + 2, y: ay + 3.5,
        "font-size": 11, fill: CHR.muted }, "time (1 cell = one microbatch forward)"));

      // swap into the DOM, keeping the tooltip element
      const old = svgWrap.querySelector("svg");
      if (old) old.remove();
      svgWrap.insertBefore(svg, tip);
      hideTip();
    }

    return { update: render };
  });
})();
