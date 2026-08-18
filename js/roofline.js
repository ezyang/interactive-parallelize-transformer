/* ============================================================
   roofline.js — intuition-building widgets for the network roofline.
   Widgets: "overlap-timeline", "roofline-curve".
   ============================================================ */
(function () {
  "use strict";
  const hwTerm = (t, g) => (Core.get().gpu >= 0.5 ? g : t); // vocabulary follows the hardware
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

  /* ============================================================
     overlap-timeline
     Two tracks: compute (MXU) and network (ICI), same time axis.
     Step time per layer = max of the two. Exposed comms glows.
     Modes: "weights" (DP/FSDP: bytes = 4·D·E·F/MX, deaf to B)
            "acts"    (TP: bytes = 4BD/MY, scales with B)
     F convention: F = per-expert width; math moves k·F, weights E·F.
     ============================================================ */
  Widgets.register("overlap-timeline", function (el, opts) {
    el.innerHTML = "";
    let mode = "weights";

    const title = div("w-title", "One layer, two clocks — total time is whichever finishes last");
    const tabs = div("tabs");
    const btnW = document.createElement("button");
    btnW.textContent = "what moves: weights (DP / FSDP)";
    const btnA = document.createElement("button");
    btnA.textContent = "what moves: activations (TP)";
    tabs.appendChild(btnW);
    tabs.appendChild(btnA);

    const legend = div("legend");
    function rectKey(label, css) {
      const lg = div("lg");
      const k = div("key-rect");
      k.style.cssText = css;
      lg.appendChild(k);
      lg.appendChild(document.createTextNode(label));
      return lg;
    }
    const computeKey = rectKey("compute (MXU)", "background:#3a3a38");
    legend.appendChild(computeKey);
    const commsKey = rectKey("communication — hidden part", "background:" + SER.s1);
    legend.appendChild(commsKey);
    legend.appendChild(rectKey("exposed comms (chips idle)",
      "background:repeating-linear-gradient(45deg, rgba(208,59,59,0.18), rgba(208,59,59,0.18) 2px, #d03b3b 2px, #d03b3b 4px)"));

    const svgWrap = div("");
    const readout = div("w-readout");
    readout.style.marginTop = "0.4rem";
    el.appendChild(title);
    el.appendChild(tabs);
    el.appendChild(legend);
    el.appendChild(svgWrap);
    el.appendChild(readout);

    btnW.addEventListener("click", () => { mode = "weights"; update(Core.get()); });
    btnA.addEventListener("click", () => { mode = "acts"; update(Core.get()); });

    function times(S) {
      // per-layer forward-pass times, per SPEC physics
      if (mode === "weights") {
        return {
          tm: (4 * S.B * S.D * (S.k * S.F)) / (S.DP * S.C),
          tc: (4 * S.D * (S.E * S.F)) / (S.Wici * S.MDP),
          moved: "the layer's weights (2·D·" + (S.E > 1 ? "E·" : "") + "F bytes ×2 gathers)",
          who: "FSDP over " + axLabel("X") + "=" + Core.fmt(S.DP, "int") + " chips",
        };
      }
      return {
        tm: (4 * S.B * S.D * (S.k * S.F)) / (S.TP * S.C),
        tc: (4 * S.B * S.D) / (S.Wici * S.MTP),
        moved: "the layer's activations (2·B·D bytes ×2 collectives)",
        who: "TP over " + axLabel("Y") + "=" + Core.fmt(S.TP, "int") + " chips",
      };
    }

    // ---- tweened display model ----
    // Values and the time axis both animate (log-space exponential approach).
    // While the reader drags, the axis only RATCHETS UP (bars move against a
    // steady scale — the affordance); ~450 ms after the last change it
    // relaxes back down so the bars use the space again.
    let cur = null;   // displayed { tm, tc, span }
    let tgt = null;   // target   { tm, tc, moved, who }
    let rafId = null, shrinkTimer = null, lastChange = 0;

    function update(S) {
      const t = times(S);
      if (!tgt || t.tm !== tgt.tm || t.tc !== tgt.tc) lastChange = performance.now();
      tgt = t;
      if (!cur) { // first paint: snap, no tween from nothing
        cur = { tm: t.tm, tc: t.tc, span: Math.max(t.tm, t.tc) * 1.12 || 1 };
        draw();
        return;
      }
      kick();
    }
    function kick() { if (rafId == null) rafId = requestAnimationFrame(tick); }
    function tick() {
      rafId = null;
      const scrubbing = !!document.querySelector(".t-var.dragging");
      if (scrubbing) lastChange = performance.now();
      const rawSpan = Math.max(tgt.tm, tgt.tc) * 1.12 || 1;
      const quiesced = !scrubbing && performance.now() - lastChange > 450;
      const spanTgt = quiesced ? rawSpan : Math.max(cur.span, rawSpan);
      const approach = (c, t) => {
        const lc = Math.log(Math.max(c, 1e-12)), lt = Math.log(Math.max(t, 1e-12));
        return Math.abs(lt - lc) < 0.004 ? t : Math.exp(lc + (lt - lc) * 0.28);
      };
      cur.tm = approach(cur.tm, tgt.tm);
      cur.tc = approach(cur.tc, tgt.tc);
      cur.span = approach(cur.span, spanTgt);
      draw();
      const settled = cur.tm === tgt.tm && cur.tc === tgt.tc && cur.span === spanTgt;
      if (!settled || scrubbing) { kick(); return; }
      if (cur.span !== rawSpan) { // parked on the ratcheted scale — shrink later
        clearTimeout(shrinkTimer);
        shrinkTimer = setTimeout(kick, 480);
      }
    }

    function draw() {
      btnW.setAttribute("aria-pressed", mode === "weights");
      btnA.setAttribute("aria-pressed", mode === "acts");
      const { moved, who } = tgt || cur;
      const tm = cur.tm, tc = cur.tc, span = cur.span;
      const W = 720, H = 150, left = 118, right = 24, trackH = 26, gap = 22;
      const y1 = 34, y2 = y1 + trackH + gap;
      commsKey.querySelector(".key-rect").style.background = mode === "weights" ? SER.s1 : SER.s2;
      computeKey.lastChild.textContent = "compute (" + hwTerm("MXU", "tensor core") + ")";
      const xw = (t) => left + (t / span) * (W - left - right);

      const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": "timeline comparing compute time and communication time for one layer" });
      svg.style.width = "100%";

      // hidden-comms shading: the part of comms under compute is "free"
      const stepT = Math.max(tm, tc);

      // track labels
      svg.appendChild(h("text", { x: left - 10, y: y1 + trackH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: CHR.ink2 }, "compute (" + hwTerm("MXU", "tensor core") + ")"));
      svg.appendChild(h("text", { x: left - 10, y: y2 + trackH / 2 + 4, "text-anchor": "end", "font-size": 12, fill: CHR.ink2 }, "network (" + hwTerm("ICI", "NVLink") + ")"));

      // baseline grid
      svg.appendChild(h("line", { x1: left, y1: y1 - 12, x2: left, y2: y2 + trackH + 14, stroke: CHR.axis, "stroke-width": 1 }));

      // compute bar (reference quantity = near-ink)
      svg.appendChild(h("rect", { x: left, y: y1, width: Math.max(1, xw(tm) - left), height: trackH, rx: 4, fill: "#3a3a38" }));
      svg.appendChild(h("text", { x: xw(tm) + 6, y: y1 + trackH / 2 + 4, "font-size": 11, fill: CHR.ink, "font-weight": 700 }, Core.fmt(tm, "time")));

      // comms bar: hidden part (≤ tm) in series color, exposed part hatched red
      const hiddenT = Math.min(tc, tm);
      const commColor = mode === "weights" ? SER.s1 : SER.s2;
      svg.appendChild(h("rect", { x: left, y: y2, width: Math.max(1, xw(hiddenT) - left), height: trackH, rx: 4, fill: commColor }));
      if (tc > tm) {
        // exposed communication
        const pat = h("pattern", { id: "exposed-hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
          h("rect", { width: 6, height: 6, fill: "rgba(208,59,59,0.18)" }),
          h("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "#d03b3b", "stroke-width": 2 }));
        svg.appendChild(h("defs", {}, pat));
        svg.appendChild(h("rect", { x: xw(tm), y: y2, width: Math.max(1, xw(tc) - xw(tm)), height: trackH, fill: "url(#exposed-hatch)", stroke: "#d03b3b", "stroke-width": 1, rx: 2 }));
        svg.appendChild(h("text", { x: (xw(tm) + xw(tc)) / 2, y: y2 + trackH + 16, "text-anchor": "middle", "font-size": 11, fill: "#8f2222", "font-weight": 600 },
          "exposed — chips sit idle"));
      } else {
        svg.appendChild(h("text", { x: (xw(tc) + xw(tm)) / 2, y: y2 + trackH + 16, "text-anchor": "middle", "font-size": 11, fill: "#075607" },
          "communication hidden under compute ✓"));
      }
      svg.appendChild(h("text", { x: xw(tc) + 6, y: y2 + trackH / 2 + 4, "font-size": 11, fill: CHR.ink, "font-weight": 700 }, Core.fmt(tc, "time")));

      // step-time marker
      svg.appendChild(h("line", { x1: xw(stepT), y1: y1 - 12, x2: xw(stepT), y2: y2 + trackH + 4, stroke: CHR.ink, "stroke-width": 1, "stroke-dasharray": "3 3" }));
      svg.appendChild(h("text", { x: xw(stepT), y: y1 - 18, "text-anchor": "middle", "font-size": 11, fill: CHR.ink, "font-weight": 700 },
        "layer takes " + Core.fmt(stepT, "time")));

      svgWrap.innerHTML = "";
      svgWrap.appendChild(svg);

      readout.textContent = "Moving: " + moved + " · sharing " + who + " · overlap means you pay max(compute, comms), not the sum.";
    }

    return { update };
  });

  /* ============================================================
     roofline-curve
     Classic roofline, but against the NETWORK: x = per-chip batch
     B/X (your arithmetic intensity vs ICI), y = usable fraction of
     peak FLOPs, log-log. Ridge at (E/k)·alpha/MX. Draggable operating dot.
     Orange overlay: TP utilization (flat in B).
     ============================================================ */
  Widgets.register("roofline-curve", function (el, opts) {
    el.innerHTML = "";
    const W = 720, H = 320, m = { l: 64, r: 20, t: 18, b: 46 };
    const X0 = 10, X1 = 1e5; // per-chip batch domain
    const Y0 = 0.01, Y1 = 1.35; // utilization domain (log)

    const title = div("w-title", "");
    const legend = div("legend");
    function key(color, label, dashed) {
      const lg = div("lg");
      const k = div("key-line");
      k.style.borderTopColor = color;
      if (dashed) k.style.borderTopStyle = "dashed";
      lg.appendChild(k);
      lg.appendChild(document.createTextNode(label));
      return lg;
    }
    legend.appendChild(key(SER.s1, "weight-moving comms (DP / FSDP): utilization grows with batch"));
    legend.appendChild(key(SER.s2, "activation-moving comms (TP): flat — batch cancels out"));
    const dotKey = div("lg");
    const dk = document.createElement("span");
    dk.style.cssText = "width:10px;height:10px;border-radius:50%;background:" + SER.s1 + ";border:2px solid #fcfcfb;box-shadow:0 0 0 1px " + SER.s1 + ";display:inline-block;";
    dotKey.appendChild(dk);
    dotKey.appendChild(document.createTextNode("you are here (drag it — it drags B for the whole page)"));
    legend.appendChild(dotKey);

    const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "roofline chart of usable compute fraction versus per-chip batch size" });
    svg.style.width = "100%";
    svg.style.touchAction = "none";
    const readout = div("w-readout");
    readout.style.marginTop = "0.35rem";
    el.appendChild(title);
    el.appendChild(legend);
    el.appendChild(svg);
    el.appendChild(readout);

    const px = (v) => m.l + ((Math.log10(v) - Math.log10(X0)) / (Math.log10(X1) - Math.log10(X0))) * (W - m.l - m.r);
    const py = (u) => H - m.b - ((Math.log10(u) - Math.log10(Y0)) / (Math.log10(Y1) - Math.log10(Y0))) * (H - m.t - m.b);
    const fromPx = (x) => Math.pow(10, Math.log10(X0) + ((x - m.l) / (W - m.l - m.r)) * (Math.log10(X1) - Math.log10(X0)));
    const clampDom = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    // static structure: grid group, washes, curves, annotations, dot
    const gGrid = h("g");
    const gWash = h("g");
    const gCurves = h("g");
    const gAnno = h("g");
    const dot = h("circle", { r: 7, fill: SER.s1, stroke: "#fcfcfb", "stroke-width": 2, cursor: "ew-resize" });
    const dotHit = h("circle", { r: 18, fill: "transparent", cursor: "ew-resize" });
    const dotFlag = h("text", { "font-size": 11, "font-weight": 700, fill: CHR.ink, "text-anchor": "middle" });
    svg.appendChild(gGrid);
    svg.appendChild(gWash);
    svg.appendChild(gCurves);
    svg.appendChild(gAnno);
    svg.appendChild(dot);
    svg.appendChild(dotFlag);
    svg.appendChild(dotHit);

    // grid & axes (fixed domain → draw once)
    for (let e = 1; e <= 5; e++) {
      const v = Math.pow(10, e);
      gGrid.appendChild(h("line", { x1: px(v), y1: m.t, x2: px(v), y2: H - m.b, stroke: CHR.grid, "stroke-width": 1 }));
      gGrid.appendChild(h("text", { x: px(v), y: H - m.b + 16, "text-anchor": "middle", "font-size": 11, fill: CHR.muted }, Core.fmt(v, "si")));
    }
    for (const u of [0.01, 0.1, 1]) {
      gGrid.appendChild(h("line", { x1: m.l, y1: py(u), x2: W - m.r, y2: py(u), stroke: CHR.grid, "stroke-width": 1 }));
      gGrid.appendChild(h("text", { x: m.l - 8, y: py(u) + 4, "text-anchor": "end", "font-size": 11, fill: CHR.muted }, (u * 100) + "%"));
    }
    gGrid.appendChild(h("line", { x1: m.l, y1: H - m.b, x2: W - m.r, y2: H - m.b, stroke: CHR.axis, "stroke-width": 1 }));
    const xAxisLabel = h("text", { x: (m.l + W - m.r) / 2, y: H - 8, "text-anchor": "middle", "font-size": 11.5, fill: CHR.ink2 });
    gGrid.appendChild(xAxisLabel);
    gGrid.appendChild(h("text", { x: 14, y: (m.t + H - m.b) / 2, "font-size": 11.5, fill: CHR.ink2,
      "text-anchor": "middle", transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }, "fraction of peak FLOPs"));

    // ---- drag handling ----
    let draggingXfix = null;
    function moveTo(clientX) {
      const rect = svg.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * W;
      const b = clampDom(fromPx(sx), X0, X1);
      const S = Core.get();
      const Xfix = draggingXfix != null ? draggingXfix : S.DP;
      // snap B to 1-2-5 grid
      const exp = Math.floor(Math.log10(b * Xfix));
      const base = Math.pow(10, exp);
      const mant = (b * Xfix) / base;
      const nice = mant < 1.5 ? 1 : mant < 3.5 ? 2 : mant < 7.5 ? 5 : 10;
      Core.set({ B: nice * base });
    }
    dotHit.addEventListener("pointerdown", (ev) => {
      draggingXfix = Core.get().DP;
      dotHit.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    dotHit.addEventListener("pointermove", (ev) => { if (draggingXfix != null) moveTo(ev.clientX); });
    dotHit.addEventListener("pointerup", () => { draggingXfix = null; });
    dotHit.addEventListener("pointercancel", () => { draggingXfix = null; });

    // ---- crosshair + tooltip (both series at the hovered per-chip batch) ----
    const hair = h("line", { y1: m.t, y2: H - m.b, stroke: CHR.axis, "stroke-width": 1, "stroke-dasharray": "2 3", visibility: "hidden" });
    svg.insertBefore(hair, dot);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.style.display = "none";
    document.body.appendChild(tip);
    function tipRow(color, label, value) {
      const row = document.createElement("div");
      row.className = "tip-row";
      const key = document.createElement("span");
      key.className = "tip-key";
      key.style.borderTopColor = color;
      const lab = document.createElement("span");
      lab.textContent = label;
      const val = document.createElement("span");
      val.className = "tip-val";
      val.textContent = value;
      row.appendChild(key); row.appendChild(lab); row.appendChild(val);
      return row;
    }
    function hideTip() { tip.style.display = "none"; hair.setAttribute("visibility", "hidden"); }
    svg.addEventListener("pointermove", (ev) => {
      if (draggingXfix != null) { hideTip(); return; }
      const rect = svg.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * W;
      if (sx < m.l || sx > W - m.r) { hideTip(); return; }
      const b = fromPx(sx);
      const S = Core.get();
      const bstar = (S.E / S.k) * (S.C / S.Wici) / S.MDP;
      const uW = Math.min(1, b / bstar);
      const uTP = Math.min(1, (S.k * S.F * S.MTP) / (S.TP * (S.C / S.Wici)));
      hair.setAttribute("x1", sx); hair.setAttribute("x2", sx);
      hair.setAttribute("visibility", "visible");
      tip.textContent = "";
      const xLine = document.createElement("div");
      xLine.className = "tip-x";
      xLine.textContent = Core.fmt(b, "int") + " tokens per chip";
      tip.appendChild(xLine);
      tip.appendChild(tipRow(SER.s1, "weight-moving (DP/FSDP)", Core.fmt(uW, "pct") + " of peak"));
      tip.appendChild(tipRow(SER.s2, "activation-moving (TP)", Core.fmt(uTP, "pct") + " of peak"));
      tip.style.display = "block";
      const tw = tip.offsetWidth || 190;
      tip.style.left = Math.min(window.innerWidth - tw - 10, ev.clientX + 14) + "px";
      tip.style.top = (ev.clientY + 14) + "px";
    });
    svg.addEventListener("pointerleave", hideTip);
    window.addEventListener("scroll", hideTip, { passive: true, capture: true });

    function render(S) {
      xAxisLabel.textContent = "tokens per chip per step  (B ÷ " + axLabel("X") + ")";
      // ridge point for weight-moving schemes: weights are E·F wide, math only k·F
      const bstar = (S.E / S.k) * (S.C / S.Wici) / S.MDP;
      const uTP = Math.min(1, (S.k * S.F * S.MTP) / (S.TP * (S.C / S.Wici)));  // TP utilization, flat in b
      const bNow = S.B / S.DP;

      // washes: bandwidth-bound region left of ridge
      gWash.innerHTML = "";
      const rx = clampDom(px(Math.min(bstar, X1)), m.l, W - m.r);
      gWash.appendChild(h("rect", { x: m.l, y: m.t, width: Math.max(0, rx - m.l), height: H - m.t - m.b, fill: "rgba(208,59,59,0.06)" }));
      gWash.appendChild(h("rect", { x: rx, y: m.t, width: Math.max(0, W - m.r - rx), height: H - m.t - m.b, fill: "rgba(12,163,12,0.05)" }));

      // curves
      gCurves.innerHTML = "";
      // weight-moving: u = min(1, b/bstar) → straight slope-1 segment then roof
      const pts = [];
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const b = Math.pow(10, Math.log10(X0) + (i / steps) * (Math.log10(X1) - Math.log10(X0)));
        const u = Math.max(Y0, Math.min(1, b / bstar));
        pts.push((i ? "L" : "M") + px(b).toFixed(1) + " " + py(u).toFixed(1));
      }
      gCurves.appendChild(h("path", { d: pts.join(" "), fill: "none", stroke: SER.s1, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      // TP flat line
      const uTPc = Math.max(Y0, uTP);
      gCurves.appendChild(h("line", { x1: m.l, y1: py(uTPc), x2: W - m.r, y2: py(uTPc), stroke: SER.s2, "stroke-width": 2, "stroke-linecap": "round" }));

      // annotations
      gAnno.innerHTML = "";
      if (bstar > X0 && bstar < X1) {
        gAnno.appendChild(h("line", { x1: px(bstar), y1: py(1), x2: px(bstar), y2: H - m.b, stroke: CHR.muted, "stroke-width": 1, "stroke-dasharray": "2 3" }));
        gAnno.appendChild(h("text", { x: px(bstar), y: m.t + 10, "text-anchor": "middle", "font-size": 11, fill: CHR.ink2, "font-weight": 600 },
          (S.E > 1 ? "ridge: (E/k)·C ÷ (W·M) = " : "ridge: C ÷ (W·M) = ") + Core.fmt(bstar, "int")));
      }
      gAnno.appendChild(h("text", { x: W - m.r - 4, y: py(uTPc) - 6, "text-anchor": "end", "font-size": 11, fill: CHR.ink2 },
        "TP at " + axLabel("Y") + "=" + Core.fmt(S.TP, "int") + (uTP >= 1 ? " (fully hidden)" : "")));
      const zx = clampDom(px(Math.sqrt(Math.max(X0, Math.min(bstar, X1)) * X0)), m.l + 40, W - m.r);
      gAnno.appendChild(h("text", { x: zx, y: H - m.b - 10, "text-anchor": "middle", "font-size": 10.5, fill: "#8f2222" }, "network-starved"));

      // operating dot
      const bClamped = clampDom(bNow, X0, X1);
      const uNow = Math.max(Y0, Math.min(1, bClamped / bstar));
      dot.setAttribute("cx", px(bClamped));
      dot.setAttribute("cy", py(uNow));
      dotHit.setAttribute("cx", px(bClamped));
      dotHit.setAttribute("cy", py(uNow));
      dotFlag.textContent = Core.fmt(bNow, "int") + " tok/chip → " + Core.fmt(Math.min(1, bNow / bstar), "pct") + " of peak";
      const halfW = dotFlag.textContent.length * 3.1;
      dotFlag.setAttribute("x", clampDom(px(bClamped), m.l + halfW, W - m.r - halfW));
      dotFlag.setAttribute("y", py(uNow) - 14);

      title.textContent = "The network roofline — per-chip batch is your arithmetic intensity against " + hwTerm("ICI", "NVLink");
      readout.textContent =
        "Ridge point " + Core.fmt(bstar, "int") + " tokens/chip (C=" + Core.fmt(S.C, "flops") +
        " ÷ W=" + Core.fmt(S.Wici * S.MDP, "bw") + " over " + S.MDP + (S.MDP > 1 ? " axes" : " axis") +
        (S.E > 1 ? ", ×E/k = " + Core.fmt(S.E / S.k, "sig3") + " because MoE moves E·F-wide weights against k·F-wide math" : "") +
        "). Right of it, weight-moving comms hide under compute; left of it, the network starves the " + hwTerm("MXU", "tensor cores") + ".";
    }

    return { update: render };
  });
})();
