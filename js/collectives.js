/* ============================================================
   collectives.js — animated collective-communication widgets.
   Widgets: "collective" (ring of 8 chips, hop-by-hop animation of
   allgather / reducescatter / allreduce / ar-decomp) and
   "pods-diagram" (multi-pod DCN picture with per-pod batch check).
   ============================================================ */
(function () {
  "use strict";
  const tp = (S, t, g) => (S.gpu >= 0.5 ? g : t); // hardware-terminology swap
  const axLabel = (a) => ({ X: "DP", Y: "TP", MX: "M_DP", MY: "M_TP", Z: "PP", MDP: "M_DP", MTP: "M_TP" }[a] || a);
  const SER = Core.SERIES, CHR = Core.CHROME;
  const SVGNS = "http://www.w3.org/2000/svg";
  const CHIP_COLORS = [SER.s1, SER.s2, SER.s3, SER.s4, SER.s5, SER.s6, SER.s7, SER.s8];

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

  /* ============================================================
     collective
     Ring of 8 chips animating a collective op hop-by-hop.
     Bidirectional: two flows, one per ring direction, like a real
     1D torus. opts: { op, bytesExpr, axisVar, label }.
       op = allgather | reducescatter | allreduce | ar-decomp
     time = k·bytes/(Wici·M), k=2 for allreduce/ar-decomp else 1.
     ============================================================ */
  const OP_NAMES = {
    allgather: "AllGather",
    reducescatter: "ReduceScatter",
    allreduce: "AllReduce",
    "ar-decomp": "AllReduce = ReduceScatter + AllGather",
  };
  const OP_COLORS = { ag: "#2a78d6", rs: "#eb6834", ar: "#4a3aa7" };

  Widgets.register("collective", function (el, opts) {
    el.innerHTML = "";
    const op = opts.op || "allreduce";
    const bytesExpr = opts.bytesExpr || "2*D*F";
    const axisVar = opts.axisVar || "MDP";
    const k = op === "allreduce" || op === "ar-decomp" ? 2 : 1;
    const phases = op === "allgather" ? ["ag"] : op === "reducescatter" ? ["rs"] : ["rs", "ag"];
    const NC = 8, HOPS = NC / 2;
    const totalHops = HOPS * phases.length;
    const DUR_MS = phases.length === 2 ? 4000 : 2800; // calm loop
    const HOLD = 0.18; // fraction of extra dwell at the end before wrap

    // ---- DOM scaffold ----
    const title = div("w-title", opts.label || OP_NAMES[op]);
    const controls = div("w-controls");
    const playBtn = document.createElement("button");
    playBtn.textContent = "❚❚ pause";
    playBtn.setAttribute("aria-label", "play or pause the animation");
    const bar = document.createElement("input");
    bar.type = "range";
    bar.min = "0"; bar.max = "1000"; bar.step = "1"; bar.value = "0";
    bar.setAttribute("aria-label", "animation progress");
    bar.style.flex = "1";
    bar.style.minWidth = "120px";
    bar.style.accentColor = OP_COLORS[phases.length === 2 ? "ar" : phases[0]];
    const phaseLabel = div("w-readout");
    phaseLabel.style.fontSize = "0.78rem";
    phaseLabel.style.color = CHR.ink2;
    controls.appendChild(playBtn);
    controls.appendChild(bar);
    controls.appendChild(phaseLabel);

    const svgWrap = div("");
    const decompWrap = div("");
    const readout = div("w-readout");
    readout.style.marginTop = "0.4rem";
    readout.style.fontSize = "0.85rem";
    el.appendChild(title);
    el.appendChild(controls);
    el.appendChild(svgWrap);
    if (op === "ar-decomp") el.appendChild(decompWrap);
    el.appendChild(readout);

    // ---- ring geometry ----
    const W = 720, H = 330, cx = 360, cy = 172, R = 118;
    const chipW = 58, chipH = 22, segW = 6.5, segH = 15;
    const pos = [];
    for (let i = 0; i < NC; i++) {
      const a = (-90 + i * (360 / NC)) * Math.PI / 180;
      pos.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    const svg = h("svg", {
      viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": "ring of 8 chips animating " + (OP_NAMES[op] || op) + " hop by hop in both directions",
    });
    svg.style.width = "100%";
    // static: ring edges + chip outlines + indices
    const gStatic = h("g");
    for (let i = 0; i < NC; i++) {
      const a = pos[i], b = pos[(i + 1) % NC];
      gStatic.appendChild(h("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: CHR.grid, "stroke-width": 2 }));
    }
    for (let i = 0; i < NC; i++) {
      gStatic.appendChild(h("rect", {
        x: pos[i].x - chipW / 2, y: pos[i].y - chipH / 2, width: chipW, height: chipH,
        rx: 5, fill: CHR.surface, stroke: CHIP_COLORS[i], "stroke-width": 1.6,
      }));
      // chip index tag, placed away from ring center
      const dx = pos[i].x - cx, dy = pos[i].y - cy;
      const dl = Math.hypot(dx, dy) || 1;
      gStatic.appendChild(h("text", {
        x: pos[i].x + (dx / dl) * (chipW / 2 + 14), y: pos[i].y + (dy / dl) * (chipH / 2 + 12) + 4,
        "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: CHR.ink2,
      }, String(i)));
    }
    const gDyn = h("g");     // segments + packets, redrawn per frame
    const capText = h("text", { x: cx, y: cy + 4, "text-anchor": "middle", "font-size": 12, fill: CHR.ink2 });
    svg.appendChild(gStatic);
    svg.appendChild(gDyn);
    svg.appendChild(capText);
    svgWrap.appendChild(svg);

    // ---- occupancy / packets model ----
    // AG: shard i has reached chip j once a directional flow has carried it
    //     floor(t) hops (cw and ccw flows run simultaneously).
    // RS: time-reverse — partial copies collapse toward the home chip.
    function reach(phase, t) {
      return phase === "ag" ? Math.floor(t + 1e-9) : Math.ceil(HOPS - t - 1e-9);
    }
    function occupied(i, j, phase, t) {
      const dcw = (j - i + NC) % NC;
      const dccw = (i - j + NC) % NC;
      const r = reach(phase, t);
      return dcw <= r || dccw <= r;
    }
    function packets(phase, t) {
      // returns [{shard, from, to, f}] — packets in flight this instant
      const out = [];
      const hop = Math.floor(t + 1e-9);
      const f = t - hop;
      if (hop >= HOPS || f <= 0) return out;
      for (let i = 0; i < NC; i++) {
        if (phase === "ag") {
          out.push({ shard: i, from: (i + hop) % NC, to: (i + hop + 1) % NC, f });
          out.push({ shard: i, from: (i - hop + NC * 2) % NC, to: (i - hop - 1 + NC * 2) % NC, f });
        } else {
          const d = HOPS - hop; // distance of the outermost copies still alive
          out.push({ shard: i, from: (i - d + NC * 2) % NC, to: (i - d + 1 + NC * 2) % NC, f });
          out.push({ shard: i, from: (i + d) % NC, to: (i + d - 1 + NC) % NC, f });
        }
      }
      return out;
    }

    function phaseCaption(phaseIdx, phase) {
      const n = phases.length;
      const pre = n === 2 ? "phase " + (phaseIdx + 1) + "/2: " : "";
      if (phase === "ag") return pre + "AllGather — every shard hops both ways until all chips hold everything";
      return pre + "ReduceScatter — partial sums hop inward; each chip keeps one reduced shard";
    }

    // ---- frame render ----
    function drawFrame(progress) {
      const g = Math.min(1, progress) * totalHops;
      const phaseIdx = Math.min(phases.length - 1, Math.floor(g / HOPS));
      const t = g - phaseIdx * HOPS;
      const phase = phases[phaseIdx];
      const done = progress >= 1;

      gDyn.innerHTML = "";
      for (let j = 0; j < NC; j++) {
        const x0 = pos[j].x - (NC * segW) / 2;
        const y0 = pos[j].y - segH / 2;
        for (let i = 0; i < NC; i++) {
          if (!occupied(i, j, phase, t)) continue;
          // in RS the copies are partial sums → translucent; the fully
          // reduced home shard (end of RS, or during AG) is solid.
          const solid = phase === "ag" || (i === j && t >= HOPS - 1e-9);
          gDyn.appendChild(h("rect", {
            x: x0 + i * segW + 0.5, y: y0, width: segW - 1, height: segH,
            rx: 1.5, fill: CHIP_COLORS[i], "fill-opacity": solid ? 0.95 : 0.4,
          }));
        }
      }
      if (!done) {
        for (const p of packets(phase, t)) {
          const a = pos[p.from], b = pos[p.to];
          // offset the two directions to opposite sides of the link
          const nxv = -(b.y - a.y), nyv = b.x - a.x;
          const nl = Math.hypot(nxv, nyv) || 1;
          const cw = ((p.to - p.from + NC) % NC) === 1 ? 1 : -1;
          const ox = (nxv / nl) * 6 * cw, oy = (nyv / nl) * 6 * cw;
          gDyn.appendChild(h("circle", {
            cx: a.x + (b.x - a.x) * p.f + ox, cy: a.y + (b.y - a.y) * p.f + oy,
            r: 3.4, fill: CHIP_COLORS[p.shard], stroke: CHR.surface, "stroke-width": 1,
          }));
        }
      }
      capText.textContent = done ? "done — loop restarts" : "";
      phaseLabel.textContent = phaseCaption(phaseIdx, phase);
      bar.value = String(Math.round(Math.min(1, progress) * 1000));
      if (rsBar && agBar) {
        rsBar.setAttribute("stroke-width", !done && phase === "rs" ? 2.5 : 1);
        agBar.setAttribute("stroke-width", !done && phase === "ag" ? 2.5 : 1);
      }
    }

    // ---- ar-decomp mini-timelines (widths are a constant 2:1:1) ----
    let rsBar = null, agBar = null, arTime = null, rsTime = null, agTime = null;
    if (op === "ar-decomp") {
      const DW = 720, DH = 96, dl = 130, dr = 130, rowH = 24, y1 = 10, y2 = 54;
      const span = DW - dl - dr;
      const dsvg = h("svg", {
        viewBox: `0 0 ${DW} ${DH}`, role: "img",
        "aria-label": "AllReduce decomposes into a ReduceScatter followed by an AllGather of the same total cost",
      });
      dsvg.style.width = "100%";
      dsvg.appendChild(h("text", { x: dl - 10, y: y1 + rowH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: CHR.ink2 }, "AllReduce"));
      dsvg.appendChild(h("rect", { x: dl, y: y1, width: span, height: rowH, rx: 4, fill: "rgba(74,58,167,0.14)", stroke: OP_COLORS.ar, "stroke-width": 1 }));
      arTime = h("text", { x: dl + span / 2, y: y1 + rowH / 2 + 4, "text-anchor": "middle", "font-size": 11.5, "font-weight": 700, fill: "#3a2b85" });
      dsvg.appendChild(arTime);
      dsvg.appendChild(h("text", { x: dl - 10, y: y2 + rowH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: CHR.ink2 }, "= RS, then AG"));
      rsBar = h("rect", { x: dl, y: y2, width: span / 2 - 2, height: rowH, rx: 4, fill: "rgba(235,104,52,0.16)", stroke: OP_COLORS.rs, "stroke-width": 1 });
      agBar = h("rect", { x: dl + span / 2 + 2, y: y2, width: span / 2 - 2, height: rowH, rx: 4, fill: "rgba(42,120,214,0.16)", stroke: OP_COLORS.ag, "stroke-width": 1 });
      dsvg.appendChild(rsBar);
      dsvg.appendChild(agBar);
      rsTime = h("text", { x: dl + span / 4, y: y2 + rowH / 2 + 4, "text-anchor": "middle", "font-size": 11.5, "font-weight": 700, fill: "#7a3413" });
      agTime = h("text", { x: dl + (3 * span) / 4, y: y2 + rowH / 2 + 4, "text-anchor": "middle", "font-size": 11.5, "font-weight": 700, fill: "#104281" });
      dsvg.appendChild(rsTime);
      dsvg.appendChild(agTime);
      // brace annotation: same total cost
      dsvg.appendChild(h("line", { x1: DW - dr + 12, y1: y1 + rowH / 2, x2: DW - dr + 12, y2: y2 + rowH / 2, stroke: CHR.axis, "stroke-width": 1 }));
      dsvg.appendChild(h("text", { x: DW - dr + 20, y: (y1 + y2 + rowH) / 2, "font-size": 11.5, fill: CHR.ink2, "font-weight": 600 }, "same total cost"));
      dsvg.appendChild(h("text", { x: DW - dr + 20, y: (y1 + y2 + rowH) / 2 + 14, "font-size": 10.5, fill: CHR.muted }, "same bytes moved"));
      decompWrap.appendChild(dsvg);
    }

    // ---- animation loop (rAF, paused off-screen) ----
    let progress = 0;       // 0..1+HOLD; display clamps to 1
    let playing = true;
    let visible = true;
    let rafId = null;
    let lastTs = null;

    function tick(ts) {
      rafId = null;
      if (lastTs != null) {
        progress += (ts - lastTs) / DUR_MS;
        if (progress >= 1 + HOLD) progress = 0;
      }
      lastTs = ts;
      drawFrame(Math.min(1, progress));
      schedule();
    }
    function schedule() {
      if (playing && visible && rafId == null) rafId = requestAnimationFrame(tick);
      if (!(playing && visible)) lastTs = null;
    }
    playBtn.addEventListener("click", () => {
      playing = !playing;
      playBtn.textContent = playing ? "❚❚ pause" : "▶ play";
      lastTs = null;
      schedule();
    });
    bar.addEventListener("input", () => {
      playing = false;
      playBtn.textContent = "▶ play";
      lastTs = null;
      progress = Number(bar.value) / 1000;
      drawFrame(progress);
    });
    if (typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) visible = e.isIntersecting;
        lastTs = null;
        schedule();
      }, { rootMargin: "60px" });
      io.observe(el);
    }
    drawFrame(0);
    schedule();

    // ---- live readout (state-dependent) ----
    const getBytes = Core.evalExpr(bytesExpr);
    function update(S) {
      const bytes = getBytes();
      const M = S[axisVar] != null ? S[axisVar] : 1;
      const time = (k * bytes) / (S.Wici * M);
      readout.textContent =
        "bytes = " + bytesExpr.replace(/\*/g, "·") + " = " + Core.fmt(bytes, "bytes") +
        " · over M = " + Core.fmt(M, "int") + (M > 1 ? " ICI axes" : " ICI axis") +
        " · T = " + k + "·bytes ÷ (Wici·" + axLabel(axisVar) + ") = " + Core.fmt(time, "time");
      if (arTime) {
        arTime.textContent = "AllReduce · " + Core.fmt(time, "time");
        rsTime.textContent = "ReduceScatter · " + Core.fmt(time / 2, "time");
        agTime.textContent = "AllGather · " + Core.fmt(time / 2, "time");
      }
    }
    return { update };
  });

  /* ============================================================
     pods-diagram
     K = ceil(N / podSize) pods (draw at most 4, then an ellipsis
     pod), each a mini mesh of chips, joined by thin gray DCN links
     labeled with the live per-chip Wdcn. Readout compares the
     per-pod batch B/K against alphaDcn with a verdict pill.
     ============================================================ */
  Widgets.register("pods-diagram", function (el, opts) {
    el.innerHTML = "";
    const title = div("w-title", "Pods on the data-center network");
    const svgWrap = div("");
    const readout = div("w-readout");
    readout.style.marginTop = "0.45rem";
    readout.style.fontSize = "0.85rem";
    readout.style.display = "flex";
    readout.style.flexWrap = "wrap";
    readout.style.gap = "0.4rem 0.9rem";
    readout.style.alignItems = "center";
    const readText = document.createElement("span");
    const pill = document.createElement("span");
    pill.className = "verdict";
    readout.appendChild(readText);
    readout.appendChild(pill);
    el.appendChild(title);
    el.appendChild(svgWrap);
    el.appendChild(readout);

    // one pod: rounded rect with a grid of chip dots and a torus hint
    function drawPod(g, x, y, w, hgt, label, ellipsis) {
      g.appendChild(h("rect", {
        x, y, width: w, height: hgt, rx: 10,
        fill: CHR.surface, stroke: CHR.axis, "stroke-width": 1.4,
      }));
      if (ellipsis) {
        g.appendChild(h("text", {
          x: x + w / 2, y: y + hgt / 2 + 8, "text-anchor": "middle",
          "font-size": 26, fill: CHR.muted, "font-weight": 700,
        }, "…"));
      } else {
        // 4×4 mini mesh with light ICI wires between neighbors
        const rows = 4, cols = 4, pad = 16;
        const sx = (w - 2 * pad) / (cols - 1), sy = (hgt - 2 * pad - 12) / (rows - 1);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const px = x + pad + c * sx, py = y + pad + r * sy;
            if (c + 1 < cols) g.appendChild(h("line", { x1: px, y1: py, x2: px + sx, y2: py, stroke: CHR.grid, "stroke-width": 1 }));
            if (r + 1 < rows) g.appendChild(h("line", { x1: px, y1: py, x2: px, y2: py + sy, stroke: CHR.grid, "stroke-width": 1 }));
          }
        }
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            g.appendChild(h("circle", {
              cx: x + pad + c * sx, cy: y + pad + r * sy, r: 3.2,
              fill: "#b9b8b0", "fill-opacity": 0.9,
            }));
          }
        }
      }
      g.appendChild(h("text", {
        x: x + w / 2, y: y + hgt - 7, "text-anchor": "middle",
        "font-size": 10.5, fill: CHR.ink2, "font-weight": 600,
      }, label));
    }

    function render(S) {
      const N = S.DP * S.TP;
      const K = Math.max(1, Math.ceil(N / S.podSize));
      const alphaDcn = (S.E / S.k) * S.C / S.Wdcn; // per-expert F convention: MoE weights inflate the DCN ridge by E/k
      const perPod = S.B / K;
      const drawn = Math.min(K, 4);
      const showEllipsis = K > 4;
      const nBoxes = drawn + (showEllipsis ? 1 : 0);

      const W = 720, H = 190;
      const podH = 118, podY = 26;
      const gapCount = nBoxes - 1;
      const gap = nBoxes > 1 ? 68 : 0; // room for the DCN link labels
      const podW = Math.min(140, (W - 40 - gap * gapCount) / nBoxes);
      const startX = (W - (nBoxes * podW + gap * gapCount)) / 2;

      const svg = h("svg", {
        viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": K === 1
          ? "a single " + tp(S, "pod", "node") + " of chips; the scale-out network is not needed yet"
          : K + " " + tp(S, "pods", "nodes") + " of chips joined by scale-out network links",
      });
      svg.style.width = "100%";
      const g = h("g");
      svg.appendChild(g);

      // decide the row of boxes: pods 1..drawn, with an ellipsis box
      // standing in second-to-last and the final box labeled pod K
      const chipsLabel = Core.fmt(Math.min(S.podSize, N), "si") + " chips";
      const boxes = [];
      for (let i = 0; i < nBoxes; i++) {
        if (showEllipsis && i === nBoxes - 2) boxes.push({ ellipsis: true, label: "· · ·" });
        else {
          const idx = showEllipsis && i === nBoxes - 1 ? K : i + 1;
          boxes.push({ ellipsis: false, label: tp(S, "pod ", "node ") + idx + " · " + chipsLabel });
        }
      }

      // DCN links first (behind pods): thin gray lines pod-to-pod
      const midY = podY + podH / 2;
      for (let i = 0; i + 1 < nBoxes; i++) {
        const x1 = startX + (i + 1) * podW + i * gap;
        const x2 = x1 + gap;
        g.appendChild(h("line", { x1, y1: midY, x2, y2: midY, stroke: CHR.axis, "stroke-width": 1.2 }));
        g.appendChild(h("text", {
          x: (x1 + x2) / 2, y: midY - 8, "text-anchor": "middle",
          "font-size": 9.5, fill: CHR.muted,
        }, tp(S, "DCN", "IB")));
        g.appendChild(h("text", {
          x: (x1 + x2) / 2, y: midY + 14, "text-anchor": "middle",
          "font-size": 9.5, fill: CHR.muted,
        }, Core.fmt(S.Wdcn, "bw") + "/chip"));
      }
      boxes.forEach((b, i) => {
        drawPod(g, startX + i * (podW + gap), podY, podW, podH, b.label, b.ellipsis);
      });

      // top caption
      svg.appendChild(h("text", {
        x: W / 2, y: 15, "text-anchor": "middle", "font-size": 11.5, fill: CHR.ink2, "font-weight": 600,
      }, K === 1
        ? "N = " + Core.fmt(N, "si") + " chips fit in one " + tp(S, "pod", "node") + " of " + Core.fmt(S.podSize, "si") + " — " + tp(S, "DCN", "InfiniBand") + " not yet needed"
        : "K = ⌈N ÷ podSize⌉ = " + Core.fmt(K, "int") + " " + tp(S, "pods", "nodes") + ", pure data parallelism across the slow links"));

      svgWrap.innerHTML = "";
      svgWrap.appendChild(svg);

      // readout + verdict
      const ok = perPod > alphaDcn;
      if (K === 1) {
        readText.textContent =
          "One " + tp(S, "pod", "node") + " holds all " + Core.fmt(N, "si") + " chips, so every collective rides the fast " + tp(S, "ICI", "NVLink") + ". " +
          "Grow N past podSize = " + Core.fmt(S.podSize, "si") + " chips and the slow " + tp(S, "DCN", "InfiniBand") + " links come into play.";
        pill.className = "verdict ok";
        pill.textContent = tp(S, "DCN", "InfiniBand") + " not needed";
      } else {
        readText.textContent =
          "per-" + tp(S, "pod", "node") + " batch B ÷ K = " + Core.fmt(perPod, "si") + " tokens vs α_dcn = C ÷ Wdcn = " +
          Core.fmt(alphaDcn, "int") + " →";
        pill.className = "verdict " + (ok ? "ok" : "bad");
        pill.textContent = ok ? "compute-bound over " + tp(S, "DCN", "IB") + " ✓" : tp(S, "DCN", "IB") + "-bound ✗";
      }
    }

    return { update: render };
  });
})();
