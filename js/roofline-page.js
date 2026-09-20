(function () {
  "use strict";
  const M = window.RooflineModel;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const precisionOptions = new Map($$('[data-select="precision"], [data-select="wire"]')
    .map(el => [el, [...el.options]]));
  let timeWindowExplicit = false, timeWindows = {};
  let state = readURL(), historyTimer, statusTimer;
  const NS = "http://www.w3.org/2000/svg";
  let renderFrame = 0;
  function text(el, value) {
    const next = String(value);
    if (el.textContent === next) return;
    if (el.childNodes.length === 1 && el.firstChild.nodeType === Node.TEXT_NODE) el.firstChild.nodeValue = next;
    else el.textContent = next;
  }
  function attributes(el, values) {
    for (const [key, value] of Object.entries(values)) {
      if (el.getAttribute(key) !== String(value)) el.setAttribute(key, value);
    }
  }
  function flushRender() {
    cancelAnimationFrame(renderFrame); renderFrame = 0;
    render();
  }
  const colors = { blue: "#2a78d6", orange: "#eb6834", ink: "#0b0b0b", grid: "#e1e0d9", muted: "#898781" };
  const names = { B: "Batch B, in tokens", D: "Input hidden size D", F: "Output hidden size F", vectorN: "Dot product vector length N", overlap: "Overlap as a fraction of the shorter duration", computeScale: "Compute rate multiplier", bandwidthScale: "Bandwidth multiplier" };
  const formula = {
    specCompute: "Peak dense BF16 throughput per chip; see hardware sources", trillionTime: "10¹² / current compute rate C (including precision and compute multiplier)",
    C: "Selected precision’s peak operation rate × compute multiplier",
    bandwidth: "Published bandwidth for the selected memory or interconnect × bandwidth multiplier",
    ops: "HBM: 2BDF; network: BDF per chip", reads: "aBD + wDF", writes: "oBF",
    bytes: "HBM: aBD + wDF + oBF; network: sBF per chip",
    math: "Operations per chip / compute rate per chip", transfer: "Bytes per chip / selected bandwidth",
    lower: "max(T_math, T_comms)", serial: "T_math + T_comms",
    runtime: "T_math + T_comms − overlap × min(T_math, T_comms)",
    intensity: "Operations / bytes transferred through HBM or the selected network", ridge: "Peak arithmetic intensity: C / W",
    throughput: "Operations per chip / max(T_math, T_comms)", utilization: "min(1, Intensity(Computation) / Intensity(Accelerator))",
    critical: "HBM: w × Intensity(Accelerator) × DF / [2DF − Intensity(Accelerator) × (aD + oF)]; network: s × Intensity(Accelerator)",
    approximateCritical: "HBM: w × Intensity(Accelerator) / 2; network: s × Intensity(Accelerator)", asymptote: "2DF / (aD + oF)",
    dotIntensity: "(2N − 1) / (4N + 2), BF16 dot product",
    qW: "Stored bytes per weight", qA: "Stored bytes per input activation", qO: "Stored bytes per output", wire: "Bytes per communicated partial sum",
    specFP8: "Published dense FP8 Tensor Core throughput per GPU; ROOFLINE-SOURCES.md#fp8",
    weightElements: "D × F", outputElements: "B × F",
    localWeightElements: "D × F / number of chips", inputBytes: "a × B × D", weightBytes: "w × D × F",
    parameterTransfer: "w × D × F / HBM bandwidth", activationTransfer: "B × (aD + oF) / HBM bandwidth",
    specRidge: "Peak dense BF16 throughput / selected HBM or network bandwidth, with multipliers set to 1",
    specCriticalD: "2 × peak dense BF16 throughput / selected network bandwidth",
    bigThroughput: "Question 3: exact bytes, D = F = 4096, selected hardware and multipliers",
    smallThroughput: "Question 3: exact bytes, D = F = 1024, selected hardware and multipliers",
  };
  function number(n) {
    if (n === Infinity) return "∞";
    if (n === -Infinity) return "−∞";
    if (!Number.isFinite(n)) return "—";
    return Number(n.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  function scaled(n, units) {
    for (const [factor, unit] of units) if (Math.abs(n) >= factor) return number(n / factor) + unit;
    return number(n) + units[units.length - 1][1];
  }
  function fmt(n, kind, op = "FLOP") {
    if (typeof n === "string") return n;
    if (kind === "int") return Math.round(n).toLocaleString("en-US");
    if (kind === "percent") return number(100 * n) + "%";
    if (kind === "factor") return number(n);
    if (kind === "bytes") return scaled(n, [[1e12, " TB"], [1e9, " GB"], [1e6, " MB"], [1e3, " kB"], [1, " B"]]);
    if (kind === "bandwidth") return scaled(n, [[1e12, " TB/s"], [1e9, " GB/s"], [1e6, " MB/s"], [1, " B/s"]]);
    if (kind === "rate") return scaled(n, [[1e15, " P" + op + "/s"], [1e12, " T" + op + "/s"], [1e9, " G" + op + "/s"], [1e6, " M" + op + "/s"], [1, " " + op + "/s"]]);
    if (kind === "compact") return scaled(n, [[1e15, "P"], [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"], [1, ""]]);
    if (kind === "time") {
      if (n === 0) return "0 s";
      for (const [v, u] of [[1, " s"], [1e-3, " ms"], [1e-6, " µs"], [1e-9, " ns"]]) if (n >= v) return number(n / v) + u;
      return number(n * 1e12) + " ps";
    }
    return number(n);
  }
  function criticalSentence(r) {
    return Number.isFinite(r.critical) ? "B must reach " + fmt(Math.ceil(r.critical), "int") + " tokens to reach the compute ceiling" : "the matmul remains HBM-bound at every batch size";
  }
  function announce(message) {
    const status = $("#share-status");
    clearTimeout(statusTimer);
    status.textContent = message; status.hidden = false;
    statusTimer = setTimeout(() => { status.hidden = true; }, 7000);
  }
  function readURL() {
    const params = new URLSearchParams(location.search);
    timeWindows = {};
    for (const scale of ["linear", "log"]) {
      if (params.has(scale + "TimeWindow")) timeWindows[scale] = M.normalize({ timeScale: scale, timeWindow: params.get(scale + "TimeWindow") }).timeWindow;
    }
    const input = Object.fromEntries(params), scale = input.timeScale === "log" ? "log" : "linear";
    if (params.has("timeWindow")) timeWindows[scale] = M.normalize(input).timeWindow;
    timeWindowExplicit = scale in timeWindows;
    if (timeWindowExplicit) input.timeWindow = timeWindows[scale];
    return M.normalize(input);
  }

  function stateURL() {
    const url = new URL(location.href);
    for (const k of Object.keys(M.defaults)) {
      url.searchParams.delete(k);
      if (k === "timeWindow" ? timeWindowExplicit : state[k] !== M.defaults[k]) url.searchParams.set(k, state[k]);
    }
    for (const scale of ["linear", "log"]) {
      url.searchParams.delete(scale + "TimeWindow");
      if (scale !== state.timeScale && scale in timeWindows) url.searchParams.set(scale + "TimeWindow", timeWindows[scale]);
    }
    return url;
  }
  function persist() {
    clearTimeout(historyTimer);
    const url = stateURL();
    if (url.href !== location.href) history.pushState(null, "", url);
  }
  function set(patch, duringDrag = false) {
    const requestedPrecision = patch.precision || state.precision;
    const wasExplicit = timeWindowExplicit;
    const previousWindows = JSON.stringify(timeWindows);
    const scale = patch.timeScale === "linear" || patch.timeScale === "log" ? patch.timeScale : state.timeScale;
    if ("timeWindow" in patch) {
      if (patch.timeWindow == null) timeWindows = {};
      else timeWindows[scale] = M.normalize({ ...state, ...patch, timeScale: scale }).timeWindow;
    }
    timeWindowExplicit = scale in timeWindows;
    const input = { ...state, ...patch };
    if (timeWindowExplicit) input.timeWindow = timeWindows[scale];
    else delete input.timeWindow;
    const next = M.normalize(input);
    if (previousWindows === JSON.stringify(timeWindows) && wasExplicit === timeWindowExplicit && Object.keys(next).every((k) => next[k] === state[k])) return;
    state = next;
    if (duringDrag) {
      if (!renderFrame) renderFrame = requestAnimationFrame(flushRender);
    } else flushRender();
    if (requestedPrecision !== state.precision) announce(requestedPrecision === "fp8"
      ? "FP8 is available for the NVIDIA GPU presets. Switched to BF16."
      : "INT8 compute and weights are available for the TPU presets. Switched to BF16.");
    clearTimeout(historyTimer);
    historyTimer = setTimeout(persist, 300);
  }
  function hardwareLabel(hw) {
    const name = state.boundary === "hbm" ? hw.hbmName || hw.name.replace(/ NVL72$/, "") : hw.name;
    return name + (hw.preliminary ? " (preliminary)" : "");
  }
  window.addEventListener("popstate", () => { clearTimeout(historyTimer); state = readURL(); flushRender(); });
  function context() {
    const r = M.calculate(state);
    const exerciseState = { ...M.defaults, B: state.B, D: state.D, F: state.F };
    const q1 = M.calculate({ ...exerciseState, precision: "int8" });
    const q2 = M.calculate({ ...exerciseState, precision: "weights8" });
    const shapeState = { ...exerciseState, precision: "weights8" };
    const big = M.calculate({ ...shapeState, D: 4096, F: 4096 });
    const small = M.calculate({ ...shapeState, D: 1024, F: 1024 });
    const c = {
      ...r, comparisonMode: r.network && state.networkBW2 !== "auto" ? "pinned" : "2× BW₁",
      mixedRegime: r.comparisonBandwidth >= r.bandwidth ? "Bandwidth-bound at BW₁; compute-bound at BW₂" : "Compute-bound at BW₁; bandwidth-bound at BW₂",
      familyName: state.family === "gpu" ? "NVIDIA GPU" : "TPU", boundaryName: r.network ? "Network" : "HBM",
      hardwareName: hardwareLabel(r.hw), chipName: state.family.toUpperCase(), chipPlural: state.family.toUpperCase() + "s",
      bandwidthBoundName: r.network ? "network-bound" : "HBM-bound",
      countingScope: r.network ? "per chip · two chips" : "one chip",
      fabricName: state.fabric === "link" ? state.family === "gpu" ? "NVLink" : "one ICI link" : state.family === "gpu" ? "the scale-out NIC" : "DCN",
      fastInterconnectName: state.family === "gpu" ? "NVLink" : "ICI",
      specCompute: r.hw.compute, specFP8: r.hw.fp8 || 0, trillionTime: 1e12 / r.C,
      precisionName: { bf16: "BF16 compute and storage", fp8: "FP8 inputs and weights, BF16 output", int8: "INT8 compute and storage", weights8: "INT8 weights, BF16 compute" }[state.precision],
      weightElements: state.D * state.F, outputElements: state.B * state.F,
      localWeightElements: state.D * state.F / r.chips,
      inputBytes: r.qA * state.B * state.D, weightBytes: r.parameterBytes,
      parameterTransfer: r.parameterBytes / r.bandwidth, activationTransfer: r.activationBytes / r.bandwidth,
      overflowNote: state.timeWindow !== "auto" && r.runtime > state.timeWindow ? "The operation finishes after the visible window. Full elapsed time: " + fmt(r.runtime, "time") + "." : "",
      timelineScaleNote: state.timeScale === "log" ? "Log scale: log(1 + time / 1 ns). Bar widths are no longer proportional to duration." : "",
      computeUnit: state.family === "gpu" ? "Tensor Cores" : "MXU",
      opUnit: state.precision === "int8" ? "OP" : "FLOP", criticalSentence: criticalSentence(r),
      inputType: { bf16: "bf16", fp8: "fp8", int8: "int8", weights8: "bf16" }[state.precision],
      weightType: { bf16: "bf16", fp8: "fp8", int8: "int8", weights8: "int8" }[state.precision],
      hbmTakeaway: !Number.isFinite(r.critical)
        ? "For the selected hidden sizes D and F, this matmul remains HBM-bound at every batch size."
        : "For " + (state.precision === "fp8" ? "an FP8 matmul with BF16 output" : state.precision === "int8" ? "an INT8 matmul" : state.precision === "weights8" ? "a BF16 matmul with INT8 weights" : "a BF16 matmul")
        + " to be compute-bound on " + hardwareLabel(r.hw) + ", the full byte count requires a batch size of at least " + fmt(Math.ceil(r.critical), "int") + " tokens for the selected D and F.",
      hbmCrossoverExplanation: Number.isFinite(r.critical)
        ? "Including that traffic raises the required batch size to " + fmt(Math.ceil(r.critical), "int") + " tokens for the selected hidden sizes D and F."
        : "For the selected hidden sizes D and F, each added token brings enough input and output traffic to keep the matmul HBM-bound, even when the weight-transfer cost is spread across a very large batch.",
      dotIntensity: (2 * state.vectorN - 1) / (4 * state.vectorN + 2),
      bigThroughput: big.throughput, smallThroughput: small.throughput,
    };
    c.tableBandwidthName = r.network ? c.fabricName + " · one-way" : "HBM bandwidth";
    for (const [prefix, result] of [["q1", q1], ["q2", q2]]) {
      for (const key of ["C", "reads", "writes", "ops", "bytes", "intensity", "math", "transfer", "lower", "serial", "critical", "approximateCritical"]) c[prefix + key] = result[key];
      c[prefix + "criticalSentence"] = criticalSentence(result);
    }
    return c;
  }
  function exerciseReading() {
    if (state.boundary !== "hbm" || state.computeScale !== 1 || state.bandwidthScale !== 1) return null;
    if (state.family === "tpu" && state.tpu === "v5e") return "tpuProblems";
    if (state.family === "gpu" && state.gpu === "h100") return "gpuProblems";
    return null;
  }
  function visible(condition) {
    if (condition === "problems") return exerciseReading() !== null;
    if (["tpuProblems", "gpuProblems"].includes(condition)) return exerciseReading() === condition;
    if (condition === "integerQuantized") return ["int8", "weights8"].includes(state.precision);
    if (condition === "rubin") return state.family === "gpu" && state.gpu === "rubin";
    return state.boundary === condition || state.family === condition || state.precision === condition;
  }
  function render() {
    const c = context();
    // Read sizes together before changing text or SVG geometry.
    const sizes = ["#timeline", "#roofline-plot", "#shape-plot"].map(id => chartWidth($(id)));
    $$('[data-only]').forEach((el) => { const hidden = !visible(el.dataset.only); if (el.hidden !== hidden) el.hidden = hidden; });
    syncReadingFurniture();
    $$('[data-value]').forEach((el) => {
      const key = el.dataset.value;
      if (c[key] == null || (typeof c[key] === "number" && Number.isNaN(c[key]))) {
        el.textContent = "Unavailable";
        el.title = "This readout could not be loaded. Reload the page to load the current version.";
        console.error("Roofline readout unavailable:", key);
        return;
      }
      const op = key.startsWith("q1") ? "OP" : ["specCompute", "q2C", "bigThroughput", "smallThroughput"].includes(key) ? "FLOP" : c.opUnit;
      text(el, fmt(c[key], el.dataset.format, op));
      if (el.classList.contains("t-out")) {
        const baseKey = key.replace(/^q[12]/, "");
        attributes(el, { title: (key.match(/^q[12]/) ? "Exercise " + key[1] + ": " : "") + (formula[key] || formula[baseKey] || key) });
      }
      if (key === "bound") el.classList.toggle("compute", c.bound === "compute-bound");
    });
    $$('[data-var]').forEach((el) => {
      if (el.isContentEditable) return;
      const value = state[el.dataset.var];
      text(el, fmt(value, el.dataset.format || "int"));
      attributes(el, { "aria-valuenow": value, "aria-valuetext": el.textContent });
      if (el.dataset.var === "D") attributes(el, { "aria-label": names.D + (state.boundary === "network" ? " (even, split between two chips)" : "") });
    });
    $$('[data-choice]').forEach((el) => attributes(el, { "aria-pressed": state[el.dataset.choice] === el.dataset.choiceValue }));
    for (const [select, options] of precisionOptions) {
      if (select.dataset.optionFamily === state.family) continue;
      const supported = options.filter(option => !option.dataset.only || visible(option.dataset.only));
      for (const option of supported) { option.hidden = false; option.disabled = false; }
      select.replaceChildren(...supported);
      select.dataset.optionFamily = state.family;
    }
    $$('[data-select]').forEach((el) => { if (el.value !== String(state[el.dataset.select])) el.value = state[el.dataset.select]; });
    const select = $("#hardware");
    if (select.dataset.family !== state.family) {
      select.replaceChildren(...Object.entries(M.hardware).filter(([, hw]) => hw.family === state.family).map(([id, hw]) => new Option(hardwareLabel(hw), id)));
      select.dataset.family = state.family;
    }
    for (const option of select.options) text(option, hardwareLabel(M.hardware[option.value]));
    if (select.value !== state[state.family]) select.value = state[state.family];
    $("#reset").classList.toggle("dirty", Object.keys(M.defaults).some((k) => !["family", "tpu", "gpu", "boundary", "fabric"].includes(k) && state[k] !== (k === "timeWindow" ? M.defaultTimeWindow(state) : M.defaults[k])));
    $("#restore-bw2").disabled = state.networkBW2 === "auto";
    renderHardware();
    drawTimeline(c, sizes[0]);
    drawRoof(c, sizes[1]);
    drawShapes(c, sizes[2]);
    const title = "All About Rooflines · " + c.familyName + " × " + c.boundaryName;
    if (document.title !== title) document.title = title;
    updateToc();
  }
  let hardwareView;
  function renderHardware() {
    const view = [state.family, state[state.family], state.boundary, state.fabric].join(":");
    if (view === hardwareView) return;
    hardwareView = view;
    const tbody = $("#hardware-rows");
    if (!tbody.children.length) {
      for (const [id, hw] of Object.entries(M.hardware)) {
        const tr = document.createElement("tr");
        tr.dataset.hardware = id;
        const label = document.createElement("th");
        label.scope = "row";
        const btn = document.createElement("button");
        btn.textContent = hardwareLabel(hw);
        btn.addEventListener("click", () => { set({ family: hw.family, [hw.family]: id }); persist(); });
        label.append(btn); tr.append(label);
        for (let i = 0; i < 3; i++) tr.append(document.createElement("td"));
        tbody.append(tr);
      }
    }
    for (const tr of tbody.children) {
      const id = tr.dataset.hardware, hw = M.hardware[id];
      const W = state.boundary === "hbm" ? hw.hbm : hw[state.fabric];
      tr.hidden = hw.family !== state.family;
      tr.classList.toggle("selected", id === state[state.family]);
      tr.querySelector("button").textContent = hardwareLabel(hw);
      tr.querySelector("button").setAttribute("aria-pressed", id === state[state.family]);
      tr.children[1].textContent = fmt(hw.compute, "rate");
      tr.children[2].textContent = fmt(W, "bandwidth");
      tr.children[3].textContent = fmt(hw.compute / W);
      tr.children[1].title = "Dense BF16 per chip — ROOFLINE-SOURCES.md#hardware";
      tr.children[2].title = state.boundary === "hbm" ? "HBM bytes/second; not memory capacity" : hw.family === "tpu" && state.fabric === "link" ? "One ICI link in one direction; not a bidirectional ring" : "Outgoing bytes/second per GPU/chip, not send-plus-receive";
    }
  }
  function svgNode(tag, attrs = {}, text) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    return el;
  }
  function add(svg, tag, attrs, text) { const node = svgNode(tag, attrs, text); svg.append(node); return node; }
  function chartWidth(svg) { return Math.max(300, Math.min(760, svg.clientWidth || 760)); }
  let timeline;
  function drawTimeline(r, viewWidth = chartWidth($("#timeline"))) {
    const svg = $("#timeline");
    if (!timeline) {
      const axis = add(svg, "g", { "data-axis": "timeline" });
      const rows = [25, 79].map(y => {
        const group = add(svg, "g");
        const label = add(group, "text", { y: y + 18, "text-anchor": "end" });
        const bars = Object.fromEntries((y === 25 ? ["compute"] : ["parameters", "activations", "network"]).map(kind => {
          const rect = add(group, "rect", { y, height: 26, rx: 2 });
          return [kind, { rect, title: add(rect, "title") }];
        }));
        const duration = add(group, "text", { y: y + 18 });
        return { y, group, label, bars, duration, value: add(duration, "tspan"), title: add(duration, "title"),
          arrow: svgNode("path", { "stroke-width": 2, fill: "none" }) };
      });
      timeline = { axis, rows, finish: add(svg, "line", { y1: 15, y2: 130, stroke: colors.ink, "stroke-dasharray": "3 3" }),
        caption: add(svg, "text", { y: 188 }) };
    }
    attributes(svg, { viewBox: "0 0 " + viewWidth + " 196" });
    const target = r.runtime * 1.15, magnitude = 10 ** Math.floor(Math.log10(target));
    const span = r.timeWindow === "auto" ? [1, 2, 5, 10].find(n => n * magnitude >= target) * magnitude : r.timeWindow;
    const left = viewWidth < 500 ? 64 : 112, width = viewWidth - left - 115, edge = left + width;
    const logarithmic = r.timeScale === "log";
    // Transform interval endpoints, so stacked segments share an exact boundary.
    const transform = logarithmic ? v => Math.log1p(v / 1e-9) : v => v;
    const x = v => left + width * transform(v) / transform(span);
    attributes(svg, { "data-window": span, "data-scale": r.timeScale });
    const [timeUnit, timeFactor] = span >= 1 ? ["s", 1] : span >= 1e-3 ? ["ms", 1e3] : span >= 1e-6 ? ["µs", 1e6] : span >= 1e-9 ? ["ns", 1e9] : ["ps", 1e12];
    const axisKey = [viewWidth, span, r.timeScale].join(":");
    if (timeline.axisKey !== axisKey) {
      timeline.axisKey = axisKey;
      const axis = timeline.axis; axis.replaceChildren();
      let tickValues;
      if (logarithmic) {
        tickValues = [0];
        const minimumGap = width < 200 ? 44 : 52;
        for (let exp = Math.floor(Math.log10(span)) - 12; 10 ** exp < span; exp++) {
          const value = 10 ** exp;
          if (x(value) - x(tickValues[tickValues.length - 1]) >= minimumGap && edge - x(value) >= minimumGap) tickValues.push(value);
        }
        tickValues.push(span);
        for (const value of tickValues) add(axis, "line", { x1: x(value), x2: x(value), y1: 15, y2: 138, class: "grid" });
      } else {
        const ticks = viewWidth < 500 ? 2 : 4;
        tickValues = Array.from({ length: ticks + 1 }, (_, i) => span * i / ticks);
      }
      add(axis, "line", { x1: edge, y1: 15, x2: edge, y2: 130, stroke: colors.grid });
      add(axis, "line", { x1: left, y1: 138, x2: edge, y2: 138, stroke: colors.grid });
      for (const value of tickValues) add(axis, "text", { x: x(value), y: 160, "text-anchor": "middle" }, logarithmic ? fmt(value, "time") : number(value * timeFactor));
    }
    for (const [index, [label, start, duration, color]] of [["Compute", r.mathStart, r.math, colors.ink], [r.boundaryName, r.transferStart, r.transfer, colors.blue]].entries()) {
      const row = timeline.rows[index], end = start + duration;
      text(row.label, label); attributes(row.label, { x: left - 12 });
      const intervals = index === 0 ? { compute: [start, end, color, ""] } : r.network ? { network: [start, end, color, ""] } : {
        parameters: [start, start + r.parameterTransfer, colors.blue, "Weight reads: wDF = " + fmt(r.parameterBytes, "bytes") + ", " + fmt(r.parameterTransfer, "time") + ". Independent of batch size B."],
        activations: [start + r.parameterTransfer, end, colors.orange, "Input reads and output writes: B(aD + oF) = " + fmt(r.activationBytes, "bytes") + ", " + fmt(r.activationTransfer, "time") + ". Grows with batch size B."]
      };
      for (const [kind, bar] of Object.entries(row.bars)) {
        const [from, to, fill, description] = intervals[kind] || [0, 0, color, ""];
        const visibleStart = Math.min(span, Math.max(0, from)), visibleEnd = Math.min(span, to);
        const shown = visibleEnd > visibleStart;
        attributes(bar.rect, { x: x(visibleStart), width: shown ? x(visibleEnd) - x(visibleStart) : 0, fill, "data-start": from, "data-end": to });
        if (shown) attributes(bar.rect, { "data-segment": kind });
        else bar.rect.removeAttribute("data-segment");
        text(bar.title, description);
      }
      if (end > span) {
        attributes(row.arrow, { d: "M " + (edge - 9) + " " + (row.y + 7) + " L " + (edge - 2) + " " + (row.y + 13) + " L " + (edge - 9) + " " + (row.y + 19), stroke: start >= span ? color : "white" });
        if (!row.arrow.parentNode) row.group.append(row.arrow);
      } else row.arrow.remove();
      attributes(row.duration, { x: edge + 8 });
      text(row.value, (end > span ? "→ " : "") + fmt(duration, "time"));
      text(row.title, "Starts at " + fmt(start, "time") + "; ends at " + fmt(end, "time") + (start >= span ? ". Entirely beyond the visible window." : ""));
    }
    attributes(timeline.finish, { x1: x(Math.min(span, r.runtime)), x2: x(Math.min(span, r.runtime)), visibility: r.runtime <= span ? "visible" : "hidden" });
    attributes(timeline.caption, { x: left });
    text(timeline.caption, (logarithmic ? "Time (log)" : "Time (" + timeUnit + ")") + " · " + (r.runtime > span ? "finish beyond window" : "finish at " + fmt(r.runtime, "time")));
    attributes(svg, { "aria-label": (r.timeWindow === "auto" ? "Automatic " : "Fixed ") + fmt(span, "time") + " window, " + (logarithmic ? "log scale with zero visible" : "linear scale") + ". Compute time " + fmt(r.math, "time") + ", " + r.boundaryName + " communication time " + fmt(r.transfer, "time") + (r.network ? "" : " (weight reads " + fmt(r.parameterTransfer, "time") + "; activation reads and writes " + fmt(r.activationTransfer, "time") + ")") + ", modeled finish " + fmt(r.runtime, "time") + (r.runtime > span ? ", beyond the visible window." : ".") });
  }
  const plots = {};
  function chart(svg, config, viewWidth) {
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 " + viewWidth + " 350");
    const p = { left: viewWidth < 500 ? 57 : 88, right: viewWidth - 24, top: 30, bottom: 290, ...config };
    p.x = (v) => p.left + (Math.log10(v) - p.xmin) / (p.xmax - p.xmin) * (p.right - p.left);
    p.y = (v) => p.bottom - (Math.log10(Math.max(v, 10 ** p.ymin)) - p.ymin) / (p.ymax - p.ymin) * (p.bottom - p.top);
    const tickStep = viewWidth < 500 ? 2 : 1;
    for (let exp = p.xmin; exp <= p.xmax; exp += tickStep) {
      const value = 10 ** exp, x = p.x(value);
      add(svg, "line", { x1: x, x2: x, y1: p.top, y2: p.bottom, class: "grid" });
      add(svg, "text", { x, y: p.bottom + 23, "text-anchor": "middle" }, fmt(value, "compact"));
    }
    for (let exp = Math.ceil(p.ymin); exp <= Math.floor(p.ymax); exp++) {
      const value = 10 ** exp, y = p.y(value);
      add(svg, "line", { x1: p.left, x2: p.right, y1: y, y2: y, class: "grid" });
      add(svg, "text", { x: p.left - 9, y: y + 4, "text-anchor": "end" }, fmt(value, "compact"));
    }
    add(svg, "text", { x: p.left, y: 16, class: "axis-label" }, p.ylabel);
    add(svg, "text", { x: (p.left + p.right) / 2, y: 343, "text-anchor": "middle", class: "axis-label" }, p.xlabel);
    return p;
  }
  function curve(svg, p, fn, color) {
    const points = [];
    for (let i = 0; i <= 240; i++) {
      const value = 10 ** (p.xmin + (p.xmax - p.xmin) * i / 240);
      points.push(p.x(value) + "," + p.y(fn(value)));
    }
    return add(svg, "polyline", { points: points.join(" "), stroke: color, class: "curve" });
  }
  function drawRoof(r, viewWidth = chartWidth($("#roofline-plot"))) {
    const svg = $("#roofline-plot");
    const ridge2 = r.C / r.comparisonBandwidth;
    const lowRidge = Math.min(r.ridge, ridge2), highRidge = Math.max(r.ridge, ridge2);
    const xmax = Math.max(5, Math.ceil(Math.log10(Math.max(highRidge * 4, r.intensity * 2))));
    const key = [viewWidth, xmax, r.C, r.bandwidth, r.comparisonBandwidth, r.opUnit, r.boundaryName].join(":");
    let p = plots.roof;
    // Batch and dimensions move the points. Rebuild axes and roofs only when
    // their domain, hardware rates, or labels actually change.
    if (!p || p.key !== key) {
      p = chart(svg, { xmin: -1, xmax, ymin: 6, ymax: 19, xlabel: r.opUnit + " / " + r.boundaryName + " byte · logarithmic", ylabel: r.opUnit + "/s per chip · logarithmic" }, viewWidth);
      p.key = key;
      const regions = svgNode("g", { "data-roofline-regions": "", "aria-label": "Bandwidth and compute regimes" });
      svg.insertBefore(regions, svg.firstChild);
      for (const [name, from, to, color, description] of [
        ["bandwidth", 10 ** p.xmin, lowRidge, "#f5d3d3", "Bandwidth-bound at both bandwidths"],
        ["mixed", lowRidge, highRidge, "#fff1bd", r.mixedRegime],
        ["compute", highRidge, 10 ** p.xmax, "#dcebd4", "Compute-bound at both bandwidths"],
      ]) {
        const lo = Math.max(10 ** p.xmin, from), hi = Math.min(10 ** p.xmax, to);
        if (hi <= lo) continue;
        const top = i => Math.min(p.bottom, Math.max(p.top, p.y(Math.min(r.C, Math.max(r.bandwidth, r.comparisonBandwidth) * i))));
        const polygon = add(regions, "polygon", { "data-regime": name, fill: color, points: [[p.x(lo), p.bottom], [p.x(lo), top(lo)], [p.x(hi), top(hi)], [p.x(hi), p.bottom]].map(point => point.join(",")).join(" ") });
        add(polygon, "title", {}, description);
      }
      add(svg, "line", { x1: p.left, x2: p.right, y1: p.y(r.C), y2: p.y(r.C), stroke: colors.ink, "stroke-dasharray": "5 5", "stroke-width": 2 });
      curve(svg, p, i => Math.min(r.C, r.bandwidth * i), colors.blue);
      curve(svg, p, i => Math.min(r.C, r.comparisonBandwidth * i), colors.orange).setAttribute("stroke-dasharray", "6 4");
      add(svg, "line", { x1: p.x(r.ridge), x2: p.x(r.ridge), y1: p.y(r.C), y2: p.bottom, stroke: colors.muted, "stroke-dasharray": "3 4" });
      add(svg, "line", { x1: p.x(ridge2), x2: p.x(ridge2), y1: p.y(r.C), y2: p.bottom, stroke: colors.orange, opacity: 0.45, "stroke-dasharray": "3 4" });
      const intensityLabel = add(svg, "text", { x: p.right, y: p.y(r.C) - 24, "text-anchor": "end" });
      add(intensityLabel, "tspan", { x: p.right }, "Intensity(Accelerator)");
      add(intensityLabel, "tspan", { x: p.right, dy: 14 }, "= " + number(r.ridge));
      p.guide = add(svg, "line", { stroke: colors.blue, opacity: 0.4 });
      p.comparison = add(svg, "line", { stroke: colors.orange, "stroke-width": 2, "stroke-dasharray": "4 3" });
      p.fasterPoint = add(svg, "circle", { r: 8, fill: "white", stroke: colors.orange, "stroke-width": 2, "data-bandwidth-point": "2" });
      p.point = add(svg, "circle", { r: 6, fill: colors.blue, stroke: "white", "stroke-width": 2, "data-bandwidth-point": "1" });
      p.inspect = add(svg, "g");
      plots.roof = p;
      svg.setAttribute("role", "img");
    }
    const x = p.x(r.intensity), y = p.y(r.throughput), faster = Math.min(r.C, r.comparisonBandwidth * r.intensity);
    attributes(p.guide, { x1: x, x2: x, y1: y, y2: p.bottom });
    attributes(p.comparison, { x1: x, x2: x, y1: y, y2: p.y(faster) });
    attributes(p.fasterPoint, { cx: x, cy: p.y(faster) });
    attributes(p.point, { cx: x, cy: y });
    attributes(svg, { "aria-label": "Roofline for the selected B, D, and F. Intensity " + number(r.intensity) + " " + r.opUnit + "/byte; " + r.bound + ". Selected bandwidth: " + fmt(r.throughput, "rate", r.opUnit) + "; BW₂: " + fmt(faster, "rate", r.opUnit) + "." });
    p.readout = "Current matmul: " + number(r.intensity) + " " + r.opUnit + "/byte · BW₁: " + fmt(r.throughput, "rate", r.opUnit) + " · BW₂: " + fmt(faster, "rate", r.opUnit);
    text($("#roofline-inspect"), p.readout);
  }
  function drawShapes(r, viewWidth = chartWidth($("#shape-plot"))) {
    const svg = $("#shape-plot"), C = M.hardware.v5e.compute;
    const key = String(viewWidth);
    let p = plots.shapes;
    if (!p || p.key !== key) {
      const base = { ...M.defaults, precision: "weights8" };
      const fn = (B, dim) => M.calculate({ ...base, B, D: dim, F: dim }).throughput;
      p = chart(svg, { xmin: 0, xmax: Math.log10(M.limits.B[1]), ymin: Math.floor(Math.log10(Math.min(fn(1, 1024), fn(1, 4096)) / 2)), ymax: Math.log10(C * 2), xlabel: "Batch B · tokens · logarithmic", ylabel: "FLOP/s per chip · logarithmic" }, viewWidth);
      p.key = key; p.fn = fn;
      add(svg, "line", { x1: p.left, x2: p.right, y1: p.y(C), y2: p.y(C), stroke: colors.ink, "stroke-width": 2, "stroke-dasharray": "5 5" });
      curve(svg, p, B => fn(B, 4096), colors.blue);
      curve(svg, p, B => fn(B, 1024), colors.orange);
      p.guide = add(svg, "line", { y1: p.top, y2: p.bottom, stroke: colors.ink, "stroke-dasharray": "3 4" });
      p.points = [colors.blue, colors.orange].map(fill => add(svg, "circle", { r: 5, fill }));
      p.inspect = add(svg, "g"); plots.shapes = p;
      attributes(svg, { role: "slider", tabindex: 0, "aria-label": "Shape comparison; change batch B with arrow keys or drag", "aria-valuemin": 1, "aria-valuemax": M.limits.B[1] });
      p.readout = "Drag to change B, or hover to inspect both shapes.";
    }
    const x = p.x(state.B);
    attributes(p.guide, { x1: x, x2: x });
    for (const [i, dim] of [4096, 1024].entries()) attributes(p.points[i], { cx: x, cy: p.y(p.fn(state.B, dim)) });
    attributes(svg, { "aria-valuenow": state.B });
    text($("#shape-inspect"), p.readout);
  }
  function wirePlot(id, plotKey) {
    const svg = $(id); let dragging = false;
    function pointer(event) {
      const p = plots[plotKey], point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      const x = Math.max(p.left, Math.min(p.right, point.x));
      return { p, x, value: 10 ** (p.xmin + (x - p.left) / (p.right - p.left) * (p.xmax - p.xmin)) };
    }
    function move(event) {
      const { p, x, value } = pointer(event), r = M.calculate(state);
      if (dragging) {
        set({ B: value }, true);
        return;
      }
      p.inspect.replaceChildren();
      add(p.inspect, "line", { x1: x, x2: x, y1: p.top, y2: p.bottom, stroke: colors.muted, "stroke-dasharray": "2 3" });
      if (plotKey === "roof") $("#roofline-inspect").textContent = "Intensity(Computation) = " + number(value) + ": selected BW " + fmt(Math.min(r.C, r.bandwidth * value), "rate", state.precision === "int8" ? "OP" : "FLOP") + " · BW₂ " + fmt(Math.min(r.C, r.comparisonBandwidth * value), "rate", state.precision === "int8" ? "OP" : "FLOP");
      else $("#shape-inspect").textContent = "B = " + fmt(value, "int") + ": 4096 → " + fmt(p.fn(value, 4096), "rate") + " · 1024 → " + fmt(p.fn(value, 1024), "rate");
    }
    // The batch-axis comparison has an unambiguous input; arithmetic intensity
    // does not uniquely determine B/D/F, so the main roofline only inspects.
    if (plotKey === "shapes") {
      svg.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; dragging = true; plots[plotKey].inspect.replaceChildren(); svg.setPointerCapture(e.pointerId); svg.focus({ preventScroll: true }); move(e); });
      svg.addEventListener("keydown", (e) => arrow(e, "B"));
    }
    svg.addEventListener("pointermove", move);
    const end = () => { dragging = false; if (renderFrame) flushRender(); };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) svg.addEventListener(event, end);
    svg.addEventListener("pointerleave", () => {
      if (dragging || !plots[plotKey]) return;
      plots[plotKey].inspect.replaceChildren();
      $(plotKey === "roof" ? "#roofline-inspect" : "#shape-inspect").textContent = plots[plotKey].readout;
    });
  }
  function arrow(e, key) {
    const dir = ["ArrowRight", "ArrowUp"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowDown"].includes(e.key) ? -1 : 0;
    if (!dir && !["Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const step = ["overlap", "computeScale", "bandwidthScale"].includes(key) ? 0.05 : key === "D" && state.boundary === "network" ? 2 : 1;
    const adjusted = ["computeScale", "bandwidthScale"].includes(key) ? Number((state[key] * 1.05 ** (dir * (e.shiftKey ? 10 : 1))).toPrecision(3)) : state[key] + dir * step * (e.shiftKey ? 10 : 1);
    const value = e.key === "Home" ? M.limits[key][0] : e.key === "End" ? M.limits[key][1] : adjusted;
    set({ [key]: value });
  }
  function parseTyped(text, key) {
    if (!text.trim()) return M.defaults[key];
    const m = text.replace(/,/g, "").trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([kKmMgGtT%]?)$/i);
    if (!m) return null;
    const value = Number(m[1]) * ({ k: 1e3, m: 1e6, g: 1e9, t: 1e12, "%": 0.01 }[m[2].toLowerCase()] || 1);
    return key === "overlap" && m[2] !== "%" ? value / 100 : value;
  }
  function wireScrub(el) {
    const key = el.dataset.var, [min, max] = M.limits[key];
    el.tabIndex = 0; el.setAttribute("role", "slider");
    el.setAttribute("aria-label", names[key]); el.setAttribute("aria-valuemin", min); el.setAttribute("aria-valuemax", max);
    el.title = names[key] + ". Range " + fmt(min, el.dataset.format || "int") + "–" + fmt(max, el.dataset.format || "int") + ". Drag left/right; Enter or double-click to type; arrows to adjust; blank restores default.";
    let editing = false, dragging = false, startX, startValue;
    function edit() {
      if (editing) return;
      editing = true; el.classList.add("editing"); el.setAttribute("contenteditable", "plaintext-only");
      el.textContent = key === "overlap" ? fmt(state[key], "percent") : String(state[key]); el.focus();
      const range = document.createRange(); range.selectNodeContents(el);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    function finish(commit) {
      if (!editing) return;
      const value = parseTyped(el.textContent, key);
      editing = false; el.removeAttribute("contenteditable"); el.classList.remove("editing");
      if (commit) {
        if (value != null && Number.isFinite(value)) {
          set({ [key]: value });
          if (state[key] !== value) announce(names[key] + ": adjusted to " + fmt(state[key], el.dataset.format || "int") + (key === "D" && state.boundary === "network" ? ". D must be even for two equal shards." : " to fit the allowed range and whole-number dimensions."));
        } else announce(key === "overlap" ? "Enter a percentage, such as 50 or 50%. The previous value was kept." : "Enter a number, such as 512, 2k, or 1e6. The previous value was kept.");
      }
      render();
    }
    el.addEventListener("dblclick", edit);
    el.addEventListener("blur", () => finish(true));
    el.addEventListener("keydown", (e) => {
      if (editing) {
        if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); finish(e.key === "Enter"); }
      } else if (e.key === "Enter") { e.preventDefault(); edit(); }
      else arrow(e, key);
    });
    el.addEventListener("pointerdown", (e) => {
      if (editing || e.button !== 0) return;
      dragging = true; startX = e.clientX; startValue = state[key];
      el.setPointerCapture(e.pointerId); el.classList.add("dragging"); el.focus({ preventScroll: true }); e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const raw = key === "overlap" ? startValue + dx / 200 : startValue * 10 ** (dx / 160);
      set({ [key]: key === "overlap" ? Math.round(raw * 100) / 100 : ["computeScale", "bandwidthScale"].includes(key) ? Number(raw.toPrecision(3)) : raw }, true);
    });
    const end = () => { dragging = false; el.classList.remove("dragging"); if (renderFrame) flushRender(); };
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(event, end);
    window.addEventListener("blur", end);
  }
  // Number displayed derivations in reading order while keeping shareable IDs stable.
  const equations = $$(".eq").map((el, index) => {
    el.id ||= "equation-" + (index + 1);
    const content = document.createElement("div"); content.className = "eq-content";
    content.append(...el.childNodes);
    const link = document.createElement("a"); link.className = "equation-number"; link.href = "#" + el.id;
    el.append(content, link); el.classList.add("numbered");
    return { el, link };
  });
  const noteRefs = $$("[data-note]");
  let readingVariant;
  function closeNotes() {
    for (const ref of noteRefs) {
      $("#" + ref.getAttribute("aria-controls")).hidden = true;
      ref.setAttribute("aria-expanded", "false");
    }
  }
  function syncReadingFurniture() {
    const variant = state.family + ":" + state.boundary + ":" + state.precision + ":" + exerciseReading();
    if (variant === readingVariant) return;
    readingVariant = variant;
    closeNotes();
    let count = 0;
    for (const { el, link } of equations) {
      if (el.closest("[hidden]")) continue;
      link.textContent = "(" + (++count) + ")";
      link.setAttribute("aria-label", "Link to equation " + count);
    }
    const list = $("#footnote-list"); list.replaceChildren();
    for (const ref of noteRefs.filter(ref => !ref.closest("[hidden]"))) {
      const index = list.children.length + 1, body = $("#" + ref.getAttribute("aria-controls"));
      ref.textContent = index;
      ref.setAttribute("aria-label", "Footnote " + index + ": " + body.querySelector("strong").textContent);
      const item = document.createElement("li"); item.innerHTML = body.innerHTML;
      const back = document.createElement("a"); back.href = "#" + ref.parentElement.id; back.textContent = " ↩";
      back.setAttribute("aria-label", "Back to footnote " + index + " in the text");
      back.addEventListener("click", persist);
      item.append(back); list.append(item);
    }
  }
  function positionNote(ref) {
    const body = $("#" + ref.getAttribute("aria-controls"));
    const anchor = ref.getBoundingClientRect(), box = body.getBoundingClientRect();
    body.style.left = Math.max(12, Math.min(window.innerWidth - box.width - 12, anchor.left - 24)) + "px";
    const top = anchor.bottom + 8 + box.height <= window.innerHeight - 12 ? anchor.bottom + 8 : anchor.top - box.height - 8;
    body.style.top = Math.max(12, top) + "px";
  }
  for (const ref of noteRefs) ref.addEventListener("click", () => {
    const body = $("#" + ref.getAttribute("aria-controls")), wasOpen = !body.hidden;
    closeNotes();
    if (wasOpen) return;
    body.hidden = false; ref.setAttribute("aria-expanded", "true");
    positionNote(ref);
  });
  document.addEventListener("click", e => { if (!e.target.closest(".footnote")) closeNotes(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const ref = noteRefs.find(ref => ref.getAttribute("aria-expanded") === "true");
    closeNotes(); if (ref) ref.focus({ preventScroll: true });
  });
  document.addEventListener("focusin", e => { if (!e.target.closest(".footnote")) closeNotes(); });
  window.addEventListener("scroll", () => {
    const ref = noteRefs.find(ref => ref.getAttribute("aria-expanded") === "true");
    if (!ref) return;
    const anchor = ref.getBoundingClientRect();
    if (anchor.bottom < $(".machine").getBoundingClientRect().bottom || anchor.top > window.innerHeight) closeNotes();
    else positionNote(ref);
  }, { passive: true });
  window.addEventListener("resize", closeNotes, { passive: true });
  $$('[data-var]').forEach(wireScrub);
  $$('[data-choice]').forEach((el) => el.addEventListener("click", () => { set({ [el.dataset.choice]: el.dataset.choiceValue }); persist(); }));
  $$('[data-select]').forEach((el) => el.addEventListener("change", () => { set({ [el.dataset.select]: el.value }); persist(); }));
  $$('[data-patch]').forEach((el) => el.addEventListener("click", () => set(JSON.parse(el.dataset.patch))));
  $$('[data-example]').forEach((el) => el.addEventListener("click", () => {
    set({ precision: el.dataset.example, wire: el.dataset.example === "int8" ? 1 : 2 }); persist();
    if (location.hash !== "#roofline-figure") location.hash = "roofline-figure";
    else $("#roofline-figure").scrollIntoView({ block: "start" });
    announce("Example loaded: " + context().precisionName + ". The roofline and all shared calculations have updated.");
  }));
  $("#hardware").addEventListener("change", (e) => { set({ [state.family]: e.target.value }); persist(); });
  $("#pin-bw2").addEventListener("click", () => { set({ networkBW2: M.calculate(state).bandwidth }); persist(); });
  $("#restore-bw2").addEventListener("click", () => { set({ networkBW2: "auto" }); persist(); });
  $("#reset").addEventListener("click", () => {
    set({ ...M.defaults, family: state.family, tpu: state.tpu, gpu: state.gpu, boundary: state.boundary, fabric: state.fabric, timeWindow: null }); persist();
  });
  $("#share").addEventListener("click", async () => {
    persist();
    try { await navigator.clipboard.writeText(stateURL().href); announce("Link copied, including both selectors and every edited number."); }
    catch { announce("Your configuration is in the address bar. Copy that URL to share it."); }
  });
  function updateToc() {
    const links = $$('nav.toc a').filter(el => !el.hidden), offset = $(".machine").getBoundingClientRect().height + 80;
    let current = links[0];
    for (const link of links) if ($(link.getAttribute("href")).getBoundingClientRect().top <= offset) current = link;
    for (const link of links) {
      link.classList.toggle("active", link === current);
      if (link === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  let scrollFrame;
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = null; updateToc(); });
  }, { passive: true });
  // Preserve pending edits before normal in-page navigation adds a history entry.
  $$('a[href^="#"]').forEach((el) => el.addEventListener("click", persist));
  wirePlot("#roofline-plot", "roof"); wirePlot("#shape-plot", "shapes");
  render();
  const widths = new WeakMap();
  const resize = new ResizeObserver((entries) => {
    let changed = false;
    for (const { target, contentRect } of entries) {
      if (widths.get(target) !== contentRect.width) changed = true;
      widths.set(target, contentRect.width);
    }
    if (!changed) return;
    const c = context(); drawTimeline(c); drawRoof(c); drawShapes(c);
  });
  for (const id of ["#timeline", "#roofline-plot", "#shape-plot"]) resize.observe($(id));
  new ResizeObserver(() => {
    document.body.style.setProperty("--reading-offset", ($(".machine").getBoundingClientRect().height + 24) + "px");
  }).observe($(".machine"));
})();
