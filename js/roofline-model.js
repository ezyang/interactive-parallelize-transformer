/* The roofline chapter's two-resource model. SI bytes; dense operations.
   Network: the original two-chip contraction, counted PER CHIP, with one
   full-duplex exchange of partial outputs. See ROOFLINE-SOURCES.md. */
(function (root) {
  "use strict";
  const hardware = {
    v5e: { family: "tpu", name: "TPU v5e", compute: 197e12, hbm: 820e9, link: 45e9, scaleout: 3.125e9 },
    v5p: { family: "tpu", name: "TPU v5p", compute: 459e12, hbm: 2.8e12, link: 90e9, scaleout: 6.25e9 },
    v6e: { family: "tpu", name: "TPU v6e", compute: 918e12, hbm: 1.6e12, link: 90e9, scaleout: 12.5e9 },
    h100: { family: "gpu", name: "H100 SXM", compute: 989.5e12, fp8: 1979e12, hbm: 3.35e12, link: 450e9, scaleout: 50e9 },
    b200: { family: "gpu", name: "B200 (HGX)", compute: 2.25e15, fp8: 4.5e15, hbm: 8e12, link: 900e9, scaleout: 50e9 },
    gb200: { family: "gpu", name: "GB200 NVL72", compute: 2.5e15, fp8: 5e15, hbm: 8e12, link: 900e9, scaleout: 50e9 },
    gb300: { family: "gpu", name: "GB300 NVL72", compute: 2.5e15, fp8: 5e15, hbm: 8e12, link: 900e9, scaleout: 100e9 },
    // NVIDIA's linked Vera Rubin datasheet, individual GPU peak specs, checked
    // 2026-09-19. BF16 is explicitly dense; NVLink is converted to one-way.
    // The product webpage lists a different profile; see ROOFLINE-SOURCES.md.
    rubin: { family: "gpu", name: "Vera Rubin NVL72", hbmName: "Rubin", preliminary: true, compute: 4e15, fp8: 17.5e15, hbm: 22e12, link: 1.8e12, scaleout: 200e9 },
  };
  const defaults = {
    family: "tpu", tpu: "v5e", gpu: "gb200", boundary: "hbm", fabric: "link",
    B: 128, D: 4096, F: 4096, precision: "bf16", wire: 2,
    networkBW2: "auto", computeScale: 1, bandwidthScale: 1, overlap: 1, vectorN: 65536, timeWindow: 0.001, timeScale: "linear",
  };
  const limits = {
    B: [1, 65536], D: [128, 32768], F: [128, 131072], wire: [1, 4],
    computeScale: [0.01, 100], bandwidthScale: [0.01, 100], overlap: [0, 1], vectorN: [1, 1e9],
    timeWindow: [0.00001, 1],
  };
  const choices = {
    family: ["tpu", "gpu"], boundary: ["hbm", "network"], fabric: ["link", "scaleout"],
    precision: ["bf16", "fp8", "int8", "weights8"], tpu: ["v5e", "v5p", "v6e"],
    gpu: ["h100", "b200", "gb200", "gb300", "rubin"],
    timeScale: ["linear", "log"],
  };
  function defaultTimeWindow(s) {
    if (s.timeScale === "log") return limits.timeWindow[1];
    return (s.family === "gpu" || s.boundary === "network") ? 0.00001 : defaults.timeWindow;
  }
  function normalize(input) {
    const s = { ...defaults };
    for (const [k, values] of Object.entries(choices)) if (values.includes(input[k])) s[k] = input[k];
    if (Number.isFinite(Number(input.networkBW2)) && Number(input.networkBW2) > 0) s.networkBW2 = Math.min(1e18, Math.max(1, Number(input.networkBW2)));
    s.timeWindow = defaultTimeWindow(s);
    if ((s.precision === "fp8" && !hardware[s[s.family]].fp8) ||
        (s.family === "gpu" && ["int8", "weights8"].includes(s.precision))) s.precision = "bf16";
    for (const [k, [min, max]] of Object.entries(limits)) {
      if (input[k] == null || input[k] === "") continue;
      const v = Number(input[k]);
      if (Number.isFinite(v)) s[k] = Math.min(max, Math.max(min, v));
    }
    for (const k of ["B", "D", "F", "vectorN"]) s[k] = Math.round(s[k]);
    if (s.boundary === "network") s.D = Math.round(s.D / 2) * 2; // split evenly between two chips
    s.wire = [1, 2, 4].reduce((a, b) => Math.abs(b - s.wire) < Math.abs(a - s.wire) ? b : a);
    if (s.family === "gpu" && s.wire === 1) s.wire = 2;
    s.timeWindow = input.timeWindow === "auto" ? "auto" : [0.00001, 0.0001, 0.001, 0.01, 0.1, 1].reduce((a, b) => Math.abs(Math.log10(b / s.timeWindow)) < Math.abs(Math.log10(a / s.timeWindow)) ? b : a);
    return s;
  }
  function calculate(input) {
    const s = normalize(input), hw = hardware[s[s.family]];
    const network = s.boundary === "network";
    const qW = s.precision === "bf16" ? 2 : 1;
    const qA = ["int8", "fp8"].includes(s.precision) ? 1 : 2;
    // FP8 Tensor Core inputs are one byte, but this preset writes BF16 output.
    const qO = s.precision === "fp8" ? 2 : qA;
    // INT8 is the chapter's explicit 2×-rate exercise assumption, not a
    // claim about the native INT8 throughput of every selected accelerator.
    const rateMultiplier = s.precision === "fp8" ? hw.fp8 / hw.compute : s.precision === "int8" ? 2 : 1;
    const C = hw.compute * s.computeScale * rateMultiplier;
    const bandwidth = (network ? hw[s.fabric] : hw.hbm) * s.bandwidthScale;
    const comparisonBandwidth = network && s.networkBW2 !== "auto" ? s.networkBW2 : 2 * bandwidth;
    const chips = network ? 2 : 1;
    const ops = 2 * s.B * s.D * s.F / chips;
    const reads = qA * s.B * s.D + qW * s.D * s.F;
    const writes = qO * s.B * s.F;
    const parameterBytes = qW * s.D * s.F;
    const activationBytes = qA * s.B * s.D + writes;
    const bytes = network ? s.wire * s.B * s.F : reads + writes;
    const math = ops / C, transfer = bytes / bandwidth;
    const lower = Math.max(math, transfer), serial = math + transfer;
    const runtime = serial - s.overlap * Math.min(math, transfer);
    // Illustrative schedule: start the shorter task first and delay the
    // longer task by the unoverlapped fraction of the shorter duration.
    // This preserves the exact overlap fraction while aligning both starts
    // at perfect overlap, regardless of which resource is the bottleneck.
    const delay = (1 - s.overlap) * Math.min(math, transfer);
    const mathStart = math >= transfer ? delay : 0;
    const transferStart = math >= transfer ? 0 : delay;
    const intensity = ops / bytes, ridge = C / bandwidth;
    const denominator = 2 * s.D * s.F - ridge * (qA * s.D + qO * s.F);
    const critical = network ? s.wire * ridge : denominator > 0 ? ridge * qW * s.D * s.F / denominator : Infinity;
    const asymptote = 2 * s.D * s.F / (qA * s.D + qO * s.F);
    return { ...s, hw, network, qW, qA, qO, rateMultiplier, chips, C, bandwidth, comparisonBandwidth,
      ops, reads, writes, bytes, parameterBytes, activationBytes, math, transfer, lower, serial, runtime, mathStart, transferStart,
      intensity, ridge, critical, asymptote,
      approximateCritical: ridge * (network ? s.wire : qW / 2),
      throughput: Math.min(C, bandwidth * intensity), utilization: Math.min(1, intensity / ridge),
      scheduledThroughput: ops / runtime,
      bound: Math.abs(math - transfer) <= 1e-10 * lower ? "balanced" : math > transfer ? "compute-bound" : network ? "network-bound" : "HBM-bound",
    };
  }
  const api = { hardware, defaults, limits, defaultTimeWindow, normalize, calculate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RooflineModel = api;
})(typeof window === "undefined" ? globalThis : window);
