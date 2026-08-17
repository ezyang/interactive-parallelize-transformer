/* ============================================================
   diagrams.js — sharding diagrams for the overview + per-scheme
   sections. Widgets: "layer-diagram", "scheme-explorer", "shard-grid".
   ============================================================ */
(function () {
  "use strict";
  const SER = Core.SERIES, CHR = Core.CHROME;
  const SVGNS = "http://www.w3.org/2000/svg";

  // dimension token colors (stable hexes per SPEC palette)
  const DIM = { B: "#4a3aa7", D: "#1c5cab", F: "#9a4a00", X: "#00695f", Y: "#ad2f2f" };
  const SLOTS = [SER.s1, SER.s2, SER.s3, SER.s4, SER.s5, SER.s6, SER.s7, SER.s8];
  const ELLIPSIS_GRAY = "#b9b8b0"; // beyond-8-chips affordance

  // translucent fill for a shard owned by chip i (solid stroke, soft fill)
  function shardFill(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + (alpha == null ? 0.28 : alpha) + ")";
  }

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
     layer-diagram
     The simplified transformer layer, left to right:
     In[B,D] → W_in[D,F] → W_out[F,D] → Out[B,D].
     Box edges ∝ log2 of the live dims; edge labels live; hovering
     a label fires Core.dimHover; hovered dim's extents glow.
     ============================================================ */
  Widgets.register("layer-diagram", function (el, opts) {
    el.innerHTML = "";
    const svgWrap = div("");
    el.appendChild(svgWrap);

    // weight tints, matched to the original figure
    const TINT_WIN = "#cf6a60";   // up-projection (red in the chapter figure)
    const TINT_WOUT = "#9fbf77";  // down-projection (green in the chapter figure)
    const TINT_ACT = "#efeeea";   // activations (dashed gray boxes)

    let hoveredDim = null;        // current dimHover target
    let dimGroups = {};           // dim letter → [svg <g>s to glow], rebuilt each render

    Core.onDimHover(function (dim) {
      hoveredDim = dim;
      applyGlow();
    });
    function applyGlow() {
      for (const d in dimGroups) {
        for (const g of dimGroups[d]) {
          g.setAttribute("opacity", hoveredDim && hoveredDim !== d ? 0.35 : 1);
          g.querySelectorAll("[data-glow]").forEach((n) => {
            n.setAttribute("stroke-width", hoveredDim === d ? 3 : 1.5);
          });
          g.querySelectorAll("text").forEach((t) => {
            t.setAttribute("font-weight", hoveredDim === d ? 700 : 600);
          });
        }
      }
    }

    // double-headed extent arrow + label; orientation "h" or "v"
    function extent(dim, x1, y1, x2, y2, label, orient) {
      const c = DIM[dim];
      const g = h("g", { "aria-label": label, cursor: "default" });
      const ah = 4; // arrowhead half-size
      g.appendChild(h("line", { x1, y1, x2, y2, stroke: c, "stroke-width": 1.5, "data-glow": 1 }));
      if (orient === "h") {
        g.appendChild(h("path", { d: `M${x1 + ah} ${y1 - ah}L${x1} ${y1}L${x1 + ah} ${y1 + ah}`, fill: "none", stroke: c, "stroke-width": 1.5, "data-glow": 1 }));
        g.appendChild(h("path", { d: `M${x2 - ah} ${y2 - ah}L${x2} ${y2}L${x2 - ah} ${y2 + ah}`, fill: "none", stroke: c, "stroke-width": 1.5, "data-glow": 1 }));
        g.appendChild(h("text", { x: (x1 + x2) / 2, y: y1 + 14, "text-anchor": "middle", "font-size": 11, fill: c, "font-weight": 600 }, label));
        g.appendChild(h("rect", { x: Math.min(x1, x2) - 6, y: y1 - 12, width: Math.abs(x2 - x1) + 12, height: 30, fill: "transparent" }));
      } else {
        g.appendChild(h("path", { d: `M${x1 - ah} ${y1 + ah}L${x1} ${y1}L${x1 + ah} ${y1 + ah}`, fill: "none", stroke: c, "stroke-width": 1.5, "data-glow": 1 }));
        g.appendChild(h("path", { d: `M${x2 - ah} ${y2 - ah}L${x2} ${y2}L${x2 + ah} ${y2 - ah}`, fill: "none", stroke: c, "stroke-width": 1.5, "data-glow": 1 }));
        const my = (y1 + y2) / 2;
        g.appendChild(h("text", { x: x1 - 10, y: my, "text-anchor": "middle", "font-size": 11, fill: c, "font-weight": 600, transform: `rotate(-90 ${x1 - 10} ${my})` }, label));
        g.appendChild(h("rect", { x: x1 - 22, y: Math.min(y1, y2) - 6, width: 34, height: Math.abs(y2 - y1) + 12, fill: "transparent" }));
      }
      g.addEventListener("mouseenter", () => Core.dimHover(dim));
      g.addEventListener("mouseleave", () => Core.dimHover(null));
      (dimGroups[dim] = dimGroups[dim] || []).push(g);
      return g;
    }

    function render(S) {
      dimGroups = {};
      const lb = Math.max(4, Math.log2(S.B));
      const ld = Math.max(4, Math.log2(S.D));
      const lf = Math.max(4, Math.log2(S.F));
      // FIXED px per log2 unit: u = 5 keeps even the extreme reachable values in
      // frame (B ≤ 1e9 → 150px; F ≤ 262k → 90px), so the scale is comparable
      // across state changes and the figure never resizes the page.
      const u = 5;
      const bH = lb * u, dPx = ld * u, fPx = lf * u;
      const top = 14, gapArrow = 84; // clear channel: rotated label + flow arrow never meet
      const W = 760;
      const H = top + 150 + 44;      // frozen frame height (max box 150px + bottom labels)
      const mid = top + 150 / 2;

      const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": "simplified transformer layer: In times W_in times W_out produces Out; box edges scale with the live dimensions B, D and F" });
      svg.style.width = "100%";

      // horizontal layout: In(w=dPx) → W_in(w=fPx) → W_out(w=dPx) → Out(w=dPx)
      const widths = [dPx, fPx, dPx, dPx];
      const totalBox = widths.reduce((a, b) => a + b, 0) + 3 * gapArrow;
      let x = 40 + Math.max(0, (W - 80 - totalBox) / 2);

      const boxes = [
        { name: "In", shape: ["B", "D"], w: dPx, hh: bH, fill: TINT_ACT, dashed: true },
        { name: "W_in", sub: "in", shape: ["D", "F"], w: fPx, hh: dPx, fill: TINT_WIN },
        { name: "W_out", sub: "out", shape: ["F", "D"], w: dPx, hh: fPx, fill: TINT_WOUT },
        { name: "Out", shape: ["B", "D"], w: dPx, hh: bH, fill: TINT_ACT, dashed: true },
      ];
      const labelOf = {
        B: "B = " + Core.fmt(S.B, "si") + " tokens",
        D: "D = " + Core.fmt(S.D, "int"),
        F: "F = " + Core.fmt(S.F, "int"),
      };

      boxes.forEach(function (b, i) {
        const y = mid - b.hh / 2;
        svg.appendChild(h("rect", {
          x, y, width: b.w, height: b.hh, rx: 8,
          fill: b.fill, stroke: b.dashed ? CHR.muted : CHR.ink2,
          "stroke-width": 1.2, "stroke-dasharray": b.dashed ? "5 4" : null,
        }));
        // name + shape INSIDE the box (fallback above when the box is too short)
        const inside = b.hh >= 40;
        const nameY = inside ? mid - 3 : y - 18;
        const shapeY = inside ? mid + 13 : y - 5;
        const t = h("text", { x: x + b.w / 2, y: nameY, "text-anchor": "middle", "font-size": 13, fill: CHR.ink, "font-weight": 700 });
        t.appendChild(document.createTextNode(b.sub ? "W" : b.name));
        if (b.sub) t.appendChild(h("tspan", { "font-size": 9.5, dy: 2.5 }, b.sub));
        svg.appendChild(t);
        svg.appendChild(h("text", { x: x + b.w / 2, y: shapeY, "text-anchor": "middle", "font-size": 10.5, fill: CHR.ink2 },
          "[" + b.shape[0] + ", " + b.shape[1] + "]"));
        // extents: vertical = first dim (label rotated well left), horizontal = second dim (below)
        svg.appendChild(extent(b.shape[0], x - 14, y, x - 14, y + b.hh, labelOf[b.shape[0]], "v"));
        svg.appendChild(extent(b.shape[1], x, y + b.hh + 12, x + b.w, y + b.hh + 12, labelOf[b.shape[1]], "h"));

        x += b.w;
        if (i < boxes.length - 1) {
          // flow arrow: starts after this box, ends before the next box's
          // rotated-label zone (which begins ~36px left of the box edge)
          const ax = x + 8, ax2 = x + gapArrow - 42;
          svg.appendChild(h("line", { x1: ax, y1: mid, x2: ax2 - 5, y2: mid, stroke: CHR.ink2, "stroke-width": 1.5 }));
          svg.appendChild(h("path", { d: `M${ax2 - 6} ${mid - 4}L${ax2} ${mid}L${ax2 - 6} ${mid + 4}`, fill: "none", stroke: CHR.ink2, "stroke-width": 1.5 }));
          x += gapArrow;
        }
      });

      svgWrap.innerHTML = "";
      svgWrap.appendChild(svg);
      applyGlow();
    }

    return { update: render };
  });

  /* ============================================================
     Shared sharding model.
     Each scheme assigns, per array, an axis (X/Y/null) to each of
     its two dimensions. Arrays are In[B,D], W_in[D,F], W_out[F,D],
     Out[B,D]; bf16 so bytes = 2 · rows · cols.
     ============================================================ */
  const SCHEMES = {
    dp: {
      title: "Data Parallelism",
      axes: { X: true, Y: false },
      arrays: [
        { name: "In", dims: [["B", "X"], ["D", null]] },
        { name: "W", sub: "in", dims: [["D", null], ["F", null]], weight: true, repl: "X" },
        { name: "W", sub: "out", dims: [["F", null], ["D", null]], weight: true, repl: "X" },
        { name: "Out", dims: [["B", "X"], ["D", null]] },
      ],
      comms: {
        fwd: [],
        bwd: [
          { op: "ar", txt: "AllReduce(dW_in)", ax: "X" },
          { op: "ar", txt: "AllReduce(dW_out)", ax: "X" },
        ],
      },
      splitNote: "X splits the batch dimension B; weights are replicated on every chip",
    },
    fsdp: {
      title: "FSDP (ZeRO-3)",
      axes: { X: true, Y: false },
      arrays: [
        { name: "In", dims: [["B", "X"], ["D", null]] },
        { name: "W", sub: "in", dims: [["D", "X"], ["F", null]], weight: true },
        { name: "W", sub: "out", dims: [["F", null], ["D", "X"]], weight: true },
        { name: "Out", dims: [["B", "X"], ["D", null]] },
      ],
      comms: {
        fwd: [
          { op: "ag", txt: "AllGather(W_in)", ax: "X" },
          { op: "ag", txt: "AllGather(W_out)", ax: "X" },
        ],
        bwd: [
          { op: "ag", txt: "AllGather(W_in)", ax: "X" },
          { op: "ag", txt: "AllGather(W_out)", ax: "X" },
          { op: "rs", txt: "ReduceScatter(dW_in)", ax: "X" },
          { op: "rs", txt: "ReduceScatter(dW_out)", ax: "X" },
        ],
      },
      splitNote: "X splits B in the activations, D in the weights (and the optimizer state)",
    },
    tp: {
      title: "Tensor Parallelism",
      axes: { X: false, Y: true },
      arrays: [
        { name: "In", dims: [["B", null], ["D", "Y"]] },
        { name: "W", sub: "in", dims: [["D", null], ["F", "Y"]], weight: true },
        { name: "W", sub: "out", dims: [["F", "Y"], ["D", null]], weight: true },
        { name: "Out", dims: [["B", null], ["D", "Y"]] },
      ],
      comms: {
        fwd: [
          { op: "ag", txt: "AllGather(In)", ax: "Y" },
          { op: "rs", txt: "ReduceScatter(Out)", ax: "Y" },
        ],
        bwd: [
          { op: "ag", txt: "AllGather(dOut)", ax: "Y" },
          { op: "ag", txt: "AllGather(In)", ax: "Y" },
          { op: "rs", txt: "ReduceScatter(dIn)", ax: "Y" },
        ],
      },
      splitNote: "Y splits D in the activations and F in the weights — comms move activations, not weights",
    },
    mixed: {
      title: "FSDP + Tensor Parallelism",
      axes: { X: true, Y: true },
      arrays: [
        { name: "In", dims: [["B", "X"], ["D", "Y"]] },
        { name: "W", sub: "in", dims: [["D", "X"], ["F", "Y"]], weight: true },
        { name: "W", sub: "out", dims: [["F", "Y"], ["D", "X"]], weight: true },
        { name: "Out", dims: [["B", "X"], ["D", "Y"]] },
      ],
      comms: {
        fwd: [
          { op: "ag", txt: "AllGather(In)", ax: "Y" },
          { op: "ag", txt: "AllGather(W_in)", ax: "X" },
          { op: "ag", txt: "AllGather(W_out)", ax: "X" },
          { op: "rs", txt: "ReduceScatter(Out)", ax: "Y" },
        ],
        bwd: [
          { op: "ag", txt: "AllGather(dOut)", ax: "Y" },
          { op: "ag", txt: "AllGather(W_in, W_out)", ax: "X" },
          { op: "rs", txt: "ReduceScatter(dW_in, dW_out)", ax: "X" },
          { op: "rs", txt: "ReduceScatter(dIn)", ax: "Y" },
        ],
      },
      splitNote: "X (FSDP) splits B and the weights' D; Y (TP) splits activations' D and the weights' F — no array is duplicated anywhere",
    },
  };

  function dimVal(S, letter) { return letter === "B" ? S.B : letter === "D" ? S.D : S.F; }
  function axShards(S, ax) { return ax === "X" ? S.X : ax === "Y" ? S.Y : 1; }

  // live local shape + bytes for one array of a scheme
  function localInfo(S, arr) {
    const parts = arr.dims.map(function (d) {
      const v = dimVal(S, d[0]) / axShards(S, d[1]);
      return { label: d[1] ? d[0] + "/" + d[1] : d[0], value: v };
    });
    return {
      shapeSym: "[" + parts.map((p) => p.label).join(", ") + "]",
      shapeNum: "[" + parts.map((p) => Core.fmt(p.value, "si")).join(", ") + "]",
      bytes: 2 * parts[0].value * parts[1].value,
    };
  }

  // representative chip counts along each mesh axis for a scheme.
  // gxCap trims the X side when both axes are shown (scheme-explorer
  // uses a 2×2 mesh for mixed; shard-grid uses min(X,4)×min(Y,2)).
  function repMesh(scheme, S, gxCap) {
    const def = SCHEMES[scheme];
    const capX = def.axes.X && def.axes.Y && gxCap ? gxCap : 4;
    const gx = def.axes.X ? Math.min(capX, Math.max(1, Math.round(S.X))) : 1;
    const gy = def.axes.Y ? Math.min(def.axes.X ? 2 : 4, Math.max(1, Math.round(S.Y))) : 1;
    const realChips = (def.axes.X ? S.X : 1) * (def.axes.Y ? S.Y : 1);
    return { gx, gy, chips: gx * gy, realChips };
  }

  /* Draw one array as a subdivided rectangle inside an <svg>.
     cfg: { x, y, w, hh, arr, S, scheme, mesh:{gx,gy}, cellAttrs } — returns group.
     Ownership: chip index = xi·gy + yi (row-major over the X×Y rep mesh). */
  function drawArray(cfg) {
    const { x, y, w, hh, arr, S, mesh } = cfg;
    const g = h("g", { "aria-label": (arr.sub ? "W_" + arr.sub : arr.name) + " array sharding" });
    const ax0 = arr.dims[0][1], ax1 = arr.dims[1][1];
    const p0 = ax0 === "X" ? mesh.gx : ax0 === "Y" ? mesh.gy : 1; // row bands
    const p1 = ax1 === "X" ? mesh.gx : ax1 === "Y" ? mesh.gy : 1; // col bands
    const gap = 3;
    const cw = (w - gap * (p1 - 1)) / p1, ch = (hh - gap * (p0 - 1)) / p0;

    for (let r = 0; r < p0; r++) {
      for (let c = 0; c < p1; c++) {
        const xi = ax0 === "X" ? r : ax1 === "X" ? c : 0;
        const yi = ax0 === "Y" ? r : ax1 === "Y" ? c : 0;
        const chip = xi * mesh.gy + yi;
        const solo = p0 === 1 && p1 === 1;
        const color = solo ? null : SLOTS[chip % 8];
        const rect = h("rect", {
          x: x + c * (cw + gap), y: y + r * (ch + gap),
          width: Math.max(1, cw), height: Math.max(1, ch), rx: 3,
          fill: solo ? "#efeeea" : shardFill(color, 0.3),
          stroke: solo ? CHR.axis : color, "stroke-width": 1.2,
          "data-chip": solo ? null : chip,
        });
        g.appendChild(rect);
        // chip tag if the cell is big enough
        if (!solo && cw > 34 && ch > 13) {
          g.appendChild(h("text", {
            x: x + c * (cw + gap) + cw / 2, y: y + r * (ch + gap) + ch / 2 + 3.5,
            "text-anchor": "middle", "font-size": 10, fill: CHR.ink2,
            "data-chiptext": chip, "pointer-events": "none",
          }, String(chip)));
        }
      }
    }

    // ellipsis affordance where real shards exceed drawn shards
    const more0 = ax0 && axShards(S, ax0) > (ax0 === "X" ? mesh.gx : mesh.gy);
    const more1 = ax1 && axShards(S, ax1) > (ax1 === "X" ? mesh.gx : mesh.gy);
    if (more0) g.appendChild(h("text", { x: x + w + 4, y: y + hh - 2, "font-size": 10, fill: CHR.muted }, "⋮ ×" + Core.fmt(axShards(S, ax0), "si")));
    if (more1) g.appendChild(h("text", { x: x + w - 2, y: y + hh + 11, "text-anchor": "end", "font-size": 10, fill: CHR.muted }, "⋯ ×" + Core.fmt(axShards(S, ax1), "si")));

    // replication watermark
    if (arr.repl) {
      g.appendChild(h("text", {
        x: x + w / 2, y: y + hh / 2 + 4, "text-anchor": "middle",
        "font-size": 11, fill: CHR.muted, "font-style": "italic", "pointer-events": "none",
      }, "replicated ×" + Core.fmt(axShards(S, arr.repl), "si")));
    }
    return g;
  }

  // array title text node, e.g. W_in [D_X, F]
  function arrayTitle(x, y, arr) {
    const t = h("text", { x, y, "text-anchor": "middle", "font-size": 12, fill: CHR.ink, "font-weight": 700 });
    t.appendChild(document.createTextNode(arr.name));
    if (arr.sub) t.appendChild(h("tspan", { "font-size": 9, dy: 2 }, arr.sub));
    t.appendChild(h("tspan", { dy: arr.sub ? -2 : 0, "font-weight": 400, "font-size": 11, fill: CHR.ink2 },
      " [" + arr.dims[0][0] + ", " + arr.dims[1][0] + "]"));
    return t;
  }

  // HTML sharding-syntax line with axis-colored subscripts
  function syntaxLine(scheme) {
    const def = SCHEMES[scheme];
    const wrap = document.createElement("div");
    wrap.className = "w-readout";
    wrap.setAttribute("aria-label", "sharding syntax for " + def.title);
    function shapeSpan(arr, contractSub) {
      const s = document.createElement("span");
      s.className = "shape";
      let label = arr.sub ? "W" : arr.name;
      s.appendChild(document.createTextNode(label));
      if (arr.sub) {
        const sb = document.createElement("sub");
        sb.textContent = arr.sub;
        s.appendChild(sb);
      }
      s.appendChild(document.createTextNode("["));
      arr.dims.forEach(function (d, i) {
        if (i) s.appendChild(document.createTextNode(", "));
        s.appendChild(document.createTextNode(d[0]));
        if (d[1]) {
          const sub = document.createElement("sub");
          const tok = document.createElement("i");
          tok.className = "v v-" + d[1];
          tok.textContent = d[1];
          tok.addEventListener("mouseenter", () => Core.dimHover(d[1]));
          tok.addEventListener("mouseleave", () => Core.dimHover(null));
          sub.appendChild(tok);
          s.appendChild(sub);
        }
      });
      s.appendChild(document.createTextNode("]"));
      return s;
    }
    const A = def.arrays;
    wrap.appendChild(shapeSpan(A[0]));
    wrap.appendChild(dotSub("D"));
    wrap.appendChild(shapeSpan(A[1]));
    wrap.appendChild(dotSub("F"));
    wrap.appendChild(shapeSpan(A[2]));
    const arrow = document.createElement("span");
    arrow.textContent = " → ";
    wrap.appendChild(arrow);
    wrap.appendChild(shapeSpan(A[3]));
    return wrap;
  }
  function dotSub(letter) {
    const s = document.createElement("span");
    s.appendChild(document.createTextNode(" ·"));
    const sub = document.createElement("sub");
    sub.textContent = letter;
    s.appendChild(sub);
    s.appendChild(document.createTextNode(" "));
    return s;
  }

  // comms pill element
  function opPill(c) {
    const s = document.createElement("span");
    s.className = "op op-" + c.op;
    s.textContent = c.txt + " over " + c.ax;
    return s;
  }

  /* ============================================================
     scheme-explorer — the overview centerpiece.
     Tabs (DP / FSDP / TP / FSDP+TP); per scheme: syntax line,
     the four arrays shard-colored by chip, live local shapes +
     bytes, and the comms ops incurred forward vs backward.
     ============================================================ */
  Widgets.register("scheme-explorer", function (el, opts) {
    el.innerHTML = "";
    let active = "dp";
    let hoverChip = null;

    const TABS = [["dp", "Data Parallelism"], ["fsdp", "FSDP"], ["tp", "Tensor Parallelism"], ["mixed", "FSDP + TP"]];
    const tabs = div("tabs");
    const tabBtns = {};
    for (const [key, label] of TABS) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-label", "show " + label);
      b.addEventListener("click", function () { active = key; render(Core.get()); });
      tabBtns[key] = b;
      tabs.appendChild(b);
    }

    const synWrap = div("");
    const svgWrap = div("");
    const meshNote = div("w-readout");
    const commsWrap = div("");
    el.appendChild(tabs);
    el.appendChild(synWrap);
    el.appendChild(svgWrap);
    el.appendChild(meshNote);
    el.appendChild(commsWrap);

    function setCellHighlight(on) {
      svgWrap.querySelectorAll("[data-chip]").forEach(function (n) {
        const mine = hoverChip != null && Number(n.getAttribute("data-chip")) === hoverChip;
        n.setAttribute("opacity", hoverChip == null || mine ? 1 : 0.22);
        n.setAttribute("stroke-width", mine ? 2.4 : 1.2);
      });
    }

    function render(S) {
      for (const k in tabBtns) tabBtns[k].setAttribute("aria-pressed", k === active);
      const def = SCHEMES[active];
      const mesh = repMesh(active, S, 2); // 4-chip mesh; 2×2 when mixed

      // (a) syntax line
      synWrap.innerHTML = "";
      synWrap.appendChild(syntaxLine(active));

      // (b)+(c) the four arrays, edges ∝ log2 of live dims
      const lb = Math.max(4, Math.log2(S.B)), ld = Math.max(4, Math.log2(S.D)), lf = Math.max(4, Math.log2(S.F));
      const u = Math.min(6, 120 / lb, 88 / Math.max(ld, lf));
      const sizes = [ // [w, h] per array, matching dims [rows, cols] → h, w
        [ld * u, lb * u], [lf * u, ld * u], [ld * u, lf * u], [ld * u, lb * u],
      ];
      const maxH = Math.max(lb * u, ld * u, lf * u);
      const top = 24, capH = 46, gapX = 58;
      const W = 860;
      const totalW = sizes.reduce((a, s) => a + s[0], 0) + 3 * gapX;
      let x = 30 + Math.max(0, (W - 60 - totalW) / 2);
      const H = top + maxH + capH + 14;
      const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": def.title + ": sharding of In, W_in, W_out and Out across a representative chip mesh" });
      svg.style.width = "100%";

      def.arrays.forEach(function (arr, i) {
        const [w, hh] = sizes[i];
        const y = top + (maxH - hh) / 2;
        svg.appendChild(arrayTitle(x + w / 2, y - 8, arr));
        svg.appendChild(drawArray({ x, y, w, hh, arr, S, mesh }));
        // (c) live local shape + bytes
        const li = localInfo(S, arr);
        const capY = top + maxH + 16;
        svg.appendChild(h("text", { x: x + w / 2, y: capY, "text-anchor": "middle", "font-size": 11, fill: CHR.ink2 },
          "local " + li.shapeSym + " = " + li.shapeNum));
        svg.appendChild(h("text", { x: x + w / 2, y: capY + 14, "text-anchor": "middle", "font-size": 11, fill: CHR.muted },
          Core.fmt(li.bytes, "bytes") + " / chip"));
        x += w;
        if (i < def.arrays.length - 1) {
          const mid = top + maxH / 2;
          const ax = x + 10, ax2 = x + gapX - 10;
          svg.appendChild(h("line", { x1: ax, y1: mid, x2: ax2 - 5, y2: mid, stroke: CHR.axis, "stroke-width": 1.5 }));
          svg.appendChild(h("path", { d: `M${ax2 - 6} ${mid - 4}L${ax2} ${mid}L${ax2 - 6} ${mid + 4}`, fill: "none", stroke: CHR.axis, "stroke-width": 1.5 }));
          x += gapX;
        }
      });
      svgWrap.innerHTML = "";
      svgWrap.appendChild(svg);

      // mesh legend: chip swatches (hover ⇄ highlight shards) + which axis splits what
      meshNote.innerHTML = "";
      const legend = div("legend");
      const lead = document.createElement("span");
      lead.textContent = (mesh.chips === 4 && mesh.gy === 2 ? "representative 2×2 mesh:" : "representative " + mesh.chips + "-chip mesh:");
      legend.appendChild(lead);
      for (let i = 0; i < mesh.chips; i++) {
        const lg = div("lg");
        lg.style.padding = "5px 2px"; // ≥24px hover target
        const sq = document.createElement("span");
        sq.className = "key-rect";
        sq.style.background = shardFill(SLOTS[i % 8], 0.35);
        sq.style.border = "1.5px solid " + SLOTS[i % 8];
        sq.style.cursor = "default";
        lg.appendChild(sq);
        lg.appendChild(document.createTextNode("chip " + i));
        lg.setAttribute("aria-label", "chip " + i);
        lg.addEventListener("mouseenter", function () { hoverChip = i; setCellHighlight(); });
        lg.addEventListener("mouseleave", function () { hoverChip = null; setCellHighlight(); });
        legend.appendChild(lg);
      }
      const noteTxt = document.createElement("span");
      noteTxt.style.color = "var(--muted)";
      noteTxt.textContent = "— " + def.splitNote +
        (def.axes.X ? " · X = " + Core.fmt(S.X, "si") : "") +
        (def.axes.Y ? " · Y = " + Core.fmt(S.Y, "si") : "");
      legend.appendChild(noteTxt);
      meshNote.appendChild(legend);

      // (d) comms incurred, forward vs backward
      commsWrap.innerHTML = "";
      const rows = [["forward", def.comms.fwd], ["backward", def.comms.bwd]];
      for (const [label, list] of rows) {
        const row = div("w-row");
        row.style.margin = "0.35rem 0";
        const lab = document.createElement("span");
        lab.style.cssText = "font-size:0.8rem;color:var(--ink-2);font-weight:600;min-width:5.2rem;";
        lab.textContent = label + ":";
        row.appendChild(lab);
        if (!list.length) {
          const none = document.createElement("span");
          none.style.cssText = "font-size:0.8rem;color:#075607;";
          none.textContent = "no communication at all — the luxury of pure data parallelism";
          row.appendChild(none);
        } else {
          for (const c of list) row.appendChild(opPill(c));
        }
        commsWrap.appendChild(row);
      }

      setCellHighlight();
    }

    return { update: render };
  });

  /* ============================================================
     shard-grid — the per-section sharding figure.
     opts {"scheme": "dp"|"fsdp"|"tp"|"mixed"}.
     In and W_in (plus W_out for tp/mixed) as large rectangles
     subdivided among chips; chip strip below; hover chip ⇄
     highlight its shards; live captions with local shapes/bytes.
     ============================================================ */
  Widgets.register("shard-grid", function (el, opts) {
    el.innerHTML = "";
    const scheme = SCHEMES[opts.scheme] ? opts.scheme : "dp";
    const def = SCHEMES[scheme];
    // which arrays to draw big
    const drawn = def.arrays.filter(function (a) {
      if (a.name === "In") return true;
      if (a.sub === "in") return true;
      if (a.sub === "out") return scheme === "tp" || scheme === "mixed";
      return false;
    });

    let hoverChip = null;

    const svgWrap = div("");
    const strip = div("w-row");
    strip.style.margin = "0.5rem 0 0.3rem";
    strip.setAttribute("aria-label", "chip strip: hover a chip to highlight the shards it owns");
    const caption = div("w-readout");
    caption.style.fontSize = "0.8rem";
    el.appendChild(svgWrap);
    el.appendChild(strip);
    el.appendChild(caption);

    function chipName(i) { return "chip " + i; }

    function setHighlight() {
      svgWrap.querySelectorAll("[data-chip]").forEach(function (n) {
        const mine = hoverChip != null && Number(n.getAttribute("data-chip")) === hoverChip;
        n.setAttribute("opacity", hoverChip == null || mine ? 1 : 0.18);
        n.setAttribute("stroke-width", mine ? 2.6 : 1.2);
      });
      strip.querySelectorAll("[data-stripchip]").forEach(function (n) {
        const i = Number(n.getAttribute("data-stripchip"));
        n.style.outline = i === hoverChip ? "2px solid " + CHR.ink : "none";
        n.style.opacity = hoverChip == null || i === hoverChip ? 1 : 0.35;
      });
      renderCaption(Core.get());
    }

    function renderCaption(S) {
      const bits = drawn.map(function (arr) {
        const li = localInfo(S, arr);
        const nm = arr.sub ? "W_" + arr.sub : arr.name;
        return nm + " " + li.shapeSym + " = " + li.shapeNum + " (" + Core.fmt(li.bytes, "bytes") + ")";
      });
      const mesh = repMesh(scheme, S);
      const who = hoverChip != null ? chipName(hoverChip) + " holds" : "every chip holds";
      caption.textContent = who + ": " + bits.join(" · ") +
        (mesh.realChips > mesh.chips ? " — drawing " + mesh.chips + " representative chips of " + Core.fmt(mesh.realChips, "si") : "");
    }

    // small double-headed extent label for the big rectangles
    function bigExtent(svg, letter, x1, y1, x2, y2, label, orient) {
      const c = DIM[letter] || CHR.muted;
      const ah = 4;
      svg.appendChild(h("line", { x1, y1, x2, y2, stroke: c, "stroke-width": 1.3 }));
      if (orient === "h") {
        svg.appendChild(h("path", { d: `M${x1 + ah} ${y1 - ah}L${x1} ${y1}L${x1 + ah} ${y1 + ah}`, fill: "none", stroke: c, "stroke-width": 1.3 }));
        svg.appendChild(h("path", { d: `M${x2 - ah} ${y2 - ah}L${x2} ${y2}L${x2 - ah} ${y2 + ah}`, fill: "none", stroke: c, "stroke-width": 1.3 }));
        svg.appendChild(h("text", { x: (x1 + x2) / 2, y: y1 + 14, "text-anchor": "middle", "font-size": 11, fill: c, "font-weight": 600 }, label));
      } else {
        svg.appendChild(h("path", { d: `M${x1 - ah} ${y1 + ah}L${x1} ${y1}L${x1 + ah} ${y1 + ah}`, fill: "none", stroke: c, "stroke-width": 1.3 }));
        svg.appendChild(h("path", { d: `M${x2 - ah} ${y2 - ah}L${x2} ${y2}L${x2 + ah} ${y2 - ah}`, fill: "none", stroke: c, "stroke-width": 1.3 }));
        const my = (y1 + y2) / 2;
        svg.appendChild(h("text", { x: x1 - 9, y: my, "text-anchor": "middle", "font-size": 11, fill: c, "font-weight": 600, transform: `rotate(-90 ${x1 - 9} ${my})` }, label));
      }
    }

    function render(S) {
      const mesh = repMesh(scheme, S);
      const lb = Math.max(4, Math.log2(S.B)), ld = Math.max(4, Math.log2(S.D)), lf = Math.max(4, Math.log2(S.F));
      const u = Math.min(9, 170 / lb, 125 / Math.max(ld, lf));
      // per-array [w, h]: rows dim → height, cols dim → width
      const dimPx = { B: lb * u, D: ld * u, F: lf * u };
      const sizes = drawn.map((a) => [dimPx[a.dims[1][0]], dimPx[a.dims[0][0]]]);
      const maxH = Math.max.apply(null, sizes.map((s) => s[1]));
      const top = 26, gapX = 86, W = 860;
      const totalW = sizes.reduce((a, s) => a + s[0], 0) + (drawn.length - 1) * gapX;
      let x = 48 + Math.max(0, (W - 96 - totalW) / 2);
      const H = top + maxH + 44;
      const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
        "aria-label": def.title + " sharding of " + drawn.map((a) => (a.sub ? "W_" + a.sub : a.name)).join(", ") });
      svg.style.width = "100%";

      drawn.forEach(function (arr, i) {
        const [w, hh] = sizes[i];
        const y = top + (maxH - hh) / 2;
        svg.appendChild(arrayTitle(x + w / 2, y - 10, arr));
        const g = drawArray({ x, y, w, hh, arr, S, mesh });
        // wire hover on shard cells → chip strip
        g.querySelectorAll("[data-chip]").forEach(function (cell) {
          cell.addEventListener("mouseenter", function () { hoverChip = Number(cell.getAttribute("data-chip")); setHighlight(); });
          cell.addEventListener("mouseleave", function () { hoverChip = null; setHighlight(); });
        });
        svg.appendChild(g);
        // live extent labels: rows dim on the left, cols dim underneath
        const d0 = arr.dims[0], d1 = arr.dims[1];
        const lab = (d) => d[0] + " = " + Core.fmt(dimVal(S, d[0]), d[0] === "B" ? "si" : "int") + (d[1] ? " (split over " + d[1] + ")" : "");
        bigExtent(svg, d0[0], x - 12, y, x - 12, y + hh, lab(d0), "v");
        bigExtent(svg, d1[0], x, y + hh + 12, x + w, y + hh + 12, lab(d1), "h");
        x += w + gapX;
      });

      svgWrap.innerHTML = "";
      svgWrap.appendChild(svg);

      // chip strip (HTML for ≥24px hover targets)
      strip.innerHTML = "";
      const lead = document.createElement("span");
      lead.style.cssText = "font-size:0.8rem;color:var(--ink-2);font-weight:600;";
      lead.textContent = "chips:";
      strip.appendChild(lead);
      for (let i = 0; i < Math.min(8, mesh.chips); i++) {
        const sq = document.createElement("span");
        sq.setAttribute("data-stripchip", i);
        sq.setAttribute("aria-label", chipName(i));
        sq.style.cssText = "display:inline-flex;align-items:center;justify-content:center;" +
          "width:26px;height:26px;border-radius:6px;font-size:11px;color:" + CHR.ink2 + ";" +
          "background:" + shardFill(SLOTS[i % 8], 0.3) + ";border:1.5px solid " + SLOTS[i % 8] + ";cursor:default;";
        sq.textContent = String(i);
        sq.addEventListener("mouseenter", function () { hoverChip = i; setHighlight(); });
        sq.addEventListener("mouseleave", function () { hoverChip = null; setHighlight(); });
        strip.appendChild(sq);
      }
      if (mesh.realChips > mesh.chips) {
        const more = document.createElement("span");
        more.setAttribute("aria-label", "and more chips, " + Core.fmt(mesh.realChips, "si") + " in total");
        more.style.cssText = "display:inline-flex;align-items:center;justify-content:center;height:26px;" +
          "padding:0 8px;border-radius:6px;font-size:11px;color:" + CHR.muted + ";" +
          "background:#efeeea;border:1.5px solid " + ELLIPSIS_GRAY + ";cursor:default;";
        more.textContent = "… ×" + Core.fmt(mesh.realChips, "si");
        strip.appendChild(more);
      }
      const meshTxt = document.createElement("span");
      meshTxt.style.cssText = "font-size:0.78rem;color:var(--muted);";
      meshTxt.textContent = def.axes.X && def.axes.Y
        ? "mesh X×Y = " + Core.fmt(S.X, "si") + "×" + Core.fmt(S.Y, "si") + " = " + Core.fmt(S.X * S.Y, "si") + " chips"
        : def.axes.X ? "X = " + Core.fmt(S.X, "si") + " chips" : "Y = " + Core.fmt(S.Y, "si") + " chips";
      strip.appendChild(meshTxt);

      setHighlight();
    }

    return { update: render };
  });
})();
