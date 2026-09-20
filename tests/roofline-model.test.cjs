const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculate, normalize, defaults, hardware } = require('../js/roofline-model.js');
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('the source TPU v5e HBM ridge and full matmul traffic', () => {
  const r = calculate({ ...defaults, B: 128, D: 4096, F: 4096 });
  close(r.ridge, 197e12 / 820e9);
  assert.equal(r.ops, 4294967296);
  assert.equal(r.bytes, 35651584);
  close(r.intensity, 128 / (1 + 256 / 4096));
  assert.equal(r.bound, 'HBM-bound');
});

test('the exact HBM crossover includes activation reads and output writes', () => {
  for (const precision of ['bf16', 'int8', 'weights8']) {
    const r = calculate({ ...defaults, precision });
    const below = calculate({ ...defaults, precision, B: Math.floor(r.critical) });
    const above = calculate({ ...defaults, precision, B: Math.ceil(r.critical) });
    assert.ok(below.intensity < below.ridge);
    assert.ok(above.intensity >= above.ridge);
    assert.ok(r.critical > r.approximateCritical);
  }
});

test('a shape can never reach the compute roof, even with arbitrarily large B', () => {
  const r = calculate({ ...defaults, family: 'gpu', gpu: 'gb300', D: 256, F: 256, B: 1048576 });
  assert.equal(r.critical, Infinity);
  assert.ok(r.intensity < r.asymptote);
  assert.ok(r.asymptote < r.ridge);
  assert.equal(r.bound, 'HBM-bound');
  // Equality at the limiting intensity is also unreachable at finite batch.
  const equal = calculate({ ...defaults, D: 512, F: 512, computeScale: 256 * 820e9 / 197e12 });
  assert.equal(equal.critical, Infinity);
});

test('the source two-chip example counts BDF work and 2BF sent bytes per chip', () => {
  const r = calculate({ ...defaults, boundary: 'network', B: 128, D: 8192, F: 4096 });
  assert.equal(r.ops, 128 * 8192 * 4096);
  assert.equal(r.bytes, 2 * 128 * 4096);
  assert.equal(r.bandwidth, 45e9);
  assert.equal(r.intensity, 4096);
  close(r.critical, 2 * 197e12 / 45e9);
  assert.equal(calculate({ ...r, D: 8754 }).bound, 'network-bound');
  assert.equal(calculate({ ...r, D: 8756 }).bound, 'compute-bound');
});

test('batch and output width cancel from network intensity, contracted width does not', () => {
  const base = { ...defaults, boundary: 'network' }, a = calculate(base);
  const b = calculate({ ...base, B: 4 * base.B, F: 2 * base.F });
  assert.equal(a.intensity, b.intensity);
  close(b.math, a.math * 8); close(b.transfer, a.transfer * 8);
  close(b.throughput, a.throughput);
  assert.equal(calculate({ ...base, D: 2 * base.D }).intensity, 2 * a.intensity);
});

test('HBM quantization: all-INT8 keeps crossover, weight-only lowers it', () => {
  const bf = calculate(defaults), int8 = calculate({ ...defaults, precision: 'int8' });
  close(int8.critical, bf.critical);
  close(int8.intensity, 2 * bf.intensity);
  close(int8.lower, bf.lower / 2);
  const weights = calculate({ ...defaults, precision: 'weights8' });
  close(weights.critical, bf.critical / 2);
  close(weights.math, bf.math);
});

test('FP8 uses native dense GPU rates, one-byte operands, and BF16 output', () => {
  for (const [gpu, peak] of Object.entries({ h100: 1979e12, b200: 4.5e15, gb200: 5e15, gb300: 5e15, rubin: 17.5e15 })) {
    const r = calculate({ ...defaults, family: 'gpu', gpu, precision: 'fp8', B: 256, D: 8192, F: 4096 });
    assert.equal(r.precision, 'fp8');
    assert.equal(r.C, peak);
    assert.equal(r.reads, 256 * 8192 + 8192 * 4096);
    assert.equal(r.writes, 2 * 256 * 4096);
    assert.equal(r.bytes, r.reads + r.writes);
    assert.equal(r.parameterBytes, 8192 * 4096);
    assert.equal(r.activationBytes, 256 * 8192 + 2 * 256 * 4096);
    assert.equal(calculate({ ...r, computeScale: 0.8 }).C, peak * 0.8);
    const doubled = calculate({ ...r, B: 512 });
    assert.equal(doubled.parameterBytes, r.parameterBytes);
    assert.equal(doubled.activationBytes, 2 * r.activationBytes);
  }
});

test('FP8 crossover accounts for the wider output and Rubin’s native rate', () => {
  for (const gpu of ['h100', 'gb200', 'rubin']) {
    const r = calculate({ ...defaults, family: 'gpu', gpu, precision: 'fp8', D: 8192, F: 4096 });
    const below = calculate({ ...r, B: Math.floor(r.critical) });
    const above = calculate({ ...r, B: Math.ceil(r.critical) });
    assert.ok(below.math < below.transfer);
    assert.ok(above.math >= above.transfer);
    close(r.asymptote, 2 * 8192 * 4096 / (8192 + 2 * 4096));
  }
  const rubin = calculate({ ...defaults, family: 'gpu', gpu: 'rubin', precision: 'fp8' });
  close(rubin.approximateCritical, 17.5e15 / 22e12 / 2);
  assert.equal(rubin.rateMultiplier, 4.375);
});

test('FP8 compute preserves the separately selected network communication type', () => {
  for (const gpu of ['h100', 'gb200', 'rubin']) {
    const bf = calculate({ ...defaults, family: 'gpu', gpu, boundary: 'network', wire: 2 });
    const fp8 = calculate({ ...bf, precision: 'fp8' });
    assert.equal(fp8.wire, 2);
    assert.equal(fp8.bytes, bf.bytes);
    assert.equal(fp8.transfer, bf.transfer);
    assert.equal(fp8.intensity, bf.intensity);
    close(fp8.critical / bf.critical, hardware[gpu].fp8 / hardware[gpu].compute);
    assert.equal(calculate({ ...fp8, wire: 4 }).bytes, fp8.bytes * 2);
  }
});

test('FP8 survives supported URLs and falls back to BF16 for TPU presets', () => {
  const gpu = normalize({ family: 'gpu', gpu: 'rubin', precision: 'fp8', B: 512 });
  assert.equal(gpu.precision, 'fp8');
  for (const tpu of ['v5e', 'v5p', 'v6e']) {
    const fallback = calculate({ ...gpu, family: 'tpu', tpu });
    assert.equal(fallback.precision, 'bf16');
    assert.equal(fallback.C, hardware[tpu].compute);
    assert.equal(fallback.B, 512);
  }
});

test('HBM traffic separates reusable parameters from activations that grow with batch', () => {
  for (const precision of ['bf16', 'int8', 'weights8']) {
    const a = calculate({ ...defaults, precision });
    const b = calculate({ ...defaults, precision, B: 2 * defaults.B });
    assert.equal(a.parameterBytes + a.activationBytes, a.bytes);
    assert.equal(b.parameterBytes, a.parameterBytes);
    assert.equal(b.activationBytes, 2 * a.activationBytes);
    close(a.parameterBytes / a.bandwidth + a.activationBytes / a.bandwidth, a.transfer);
  }
});

test('network quantization changes the roof only through compute rate or transmitted bytes', () => {
  const base = { ...defaults, boundary: 'network' }, bf = calculate(base);
  const weights = calculate({ ...base, precision: 'weights8' });
  assert.equal(weights.bytes, bf.bytes);
  assert.equal(weights.critical, bf.critical);
  assert.equal(calculate({ ...base, precision: 'int8' }).critical, 2 * bf.critical);
  assert.equal(calculate({ ...base, precision: 'int8', wire: 1 }).critical, bf.critical);
  assert.equal(calculate({ ...base, wire: 4 }).critical, 2 * bf.critical);
});

test('Blackwell BF16 and HBM roofs match; GB300 scale-out improves', () => {
  const g2 = calculate({ ...defaults, family: 'gpu', gpu: 'gb200' });
  const g3 = calculate({ ...defaults, family: 'gpu', gpu: 'gb300' });
  assert.equal(g2.C, 2.5e15); assert.equal(g3.bandwidth, 8e12);
  assert.equal(g2.ridge, 312.5); assert.equal(g3.ridge, g2.ridge);
  const n2 = calculate({ ...g2, boundary: 'network' }), n3 = calculate({ ...g3, boundary: 'network' });
  assert.equal(n2.bandwidth, 900e9); assert.equal(n2.ridge, n3.ridge);
  assert.equal(calculate({ ...n2, fabric: 'scaleout' }).critical, 100000);
  assert.equal(calculate({ ...n3, fabric: 'scaleout' }).critical, 50000);
  close(calculate({ ...defaults, family: 'gpu', gpu: 'h100' }).ridge, 295.3731343283582);
});

test('Rubin uses dense per-GPU BF16 and one-way networking from the preliminary peak specifications', () => {
  const r = calculate({ ...defaults, family: 'gpu', gpu: 'rubin' });
  assert.equal(r.gpu, 'rubin');
  // The datasheet's 288 PFLOP/s for 72 GPUs is already dense.
  assert.equal(r.C, 288e15 / 72);
  assert.equal(r.bandwidth, 22e12);
  close(r.ridge, 181.8181818181818);
  const link = calculate({ ...r, boundary: 'network' });
  assert.equal(link.bandwidth, 3.6e12 / 2);
  close(link.critical, 4444.444444444444);
  const scaleout = calculate({ ...link, fabric: 'scaleout' });
  assert.equal(scaleout.bandwidth, 1.6e12 / 8);
  assert.equal(scaleout.critical, 40000);
});

test('overlap interpolates schedules while ideal roofline remains fixed', () => {
  for (const boundary of ['hbm', 'network']) {
    const a = calculate({ ...defaults, boundary, overlap: 1 });
    const b = calculate({ ...defaults, boundary, overlap: 0 });
    const half = calculate({ ...defaults, boundary, overlap: 0.5 });
    close(a.runtime, a.lower); close(b.runtime, b.serial);
    close(half.runtime, (a.lower + a.serial) / 2);
    assert.equal(a.throughput, b.throughput);
    assert.ok(a.serial <= 2 * a.lower);
  }
});

test('timeline intervals start together at perfect overlap and match the modeled overlap and finish', () => {
  // Include the compute-bound dimensions reported in the screenshot as well
  // as a transfer-bound workload, for both memory and network boundaries.
  for (const boundary of ['hbm', 'network']) {
    for (const shape of [{ B: 5854, D: 97186, F: 3036 }, { B: 1, D: 512, F: 4096 }]) {
      for (const overlap of [0, 0.25, 0.5, 0.75, 1]) {
        const r = calculate({ ...defaults, family: 'gpu', gpu: 'gb200', boundary, ...shape, overlap });
        const mathEnd = r.mathStart + r.math, transferEnd = r.transferStart + r.transfer;
        const intersection = Math.max(0, Math.min(mathEnd, transferEnd) - Math.max(r.mathStart, r.transferStart));
        close(intersection, overlap * Math.min(r.math, r.transfer));
        close(Math.max(mathEnd, transferEnd), r.runtime);
        assert.equal(Math.min(r.mathStart, r.transferStart), 0);
        if (overlap === 1) {
          assert.equal(r.mathStart, 0);
          assert.equal(r.transferStart, 0);
        }
        if (overlap === 0) assert.equal(intersection, 0);
      }
    }
  }
});

test('URL/input normalization rejects invalid enum values and non-finite numbers', () => {
  const s = normalize({ family: '<script>', boundary: 'HBM', B: Infinity, D: 4097, F: -12, overlap: 2, computeScale: NaN, wire: 3.8 });
  assert.equal(s.family, 'tpu'); assert.equal(s.boundary, 'hbm');
  assert.equal(s.B, defaults.B); assert.equal(s.D, 4097); assert.equal(s.F, 128);
  assert.equal(s.overlap, 1); assert.equal(s.computeScale, 1); assert.equal(s.wire, 4);
  assert.equal(normalize({ B: '', D: null }).B, defaults.B);
  assert.equal(normalize({ D: 4097 }).D, 4097);
  assert.equal(normalize({ D: 4097, boundary: 'network' }).D, 4098);
});

test('practical workload limits and a manually selected timeline window', () => {
  const capped = normalize({ B: 1e9, D: 1e9, F: 1e9 });
  assert.equal(capped.B, 65536); assert.equal(capped.D, 32768); assert.equal(capped.F, 131072);
  for (const boundary of ['hbm', 'network']) {
    const r = calculate({ ...capped, boundary, timeWindow: 0.001 });
    assert.equal(r.timeWindow, 0.001);
    assert.ok(r.runtime > r.timeWindow, 'Large cases should overflow without changing the time window');
  }
  assert.equal(normalize({ timeWindow: 0.1 }).timeWindow, 0.1);
  assert.equal(normalize({ timeWindow: Infinity }).timeWindow, defaults.timeWindow);
});

test('all hardware, boundary, path, and precision combinations obey the roofline identity', () => {
  for (const [id, hw] of Object.entries(hardware)) {
    for (const boundary of ['hbm', 'network']) for (const fabric of ['link', 'scaleout']) for (const precision of hw.family === 'gpu' ? ['bf16', 'fp8'] : ['bf16', 'int8', 'weights8']) {
      const r = calculate({ ...defaults, family: hw.family, [hw.family]: id, boundary, fabric, precision });
      for (const key of ['C', 'bandwidth', 'math', 'transfer', 'intensity', 'ridge', 'throughput']) assert.ok(Number.isFinite(r[key]) && r[key] > 0, `${id}/${boundary}/${precision}: ${key}`);
      close(r.throughput, Math.min(r.C, r.bandwidth * r.intensity));
      close(r.math / r.transfer, r.intensity / r.ridge);
      assert.ok(r.utilization > 0 && r.utilization <= 1);
    }
  }
});

test('timeline view choices survive URL normalization without changing the calculation', () => {
  const original = calculate(defaults);
  for (const timeWindow of ['auto', '0.00001', '1']) for (const timeScale of ['linear', 'log']) {
    const restored = normalize({ timeWindow, timeScale });
    assert.equal(restored.timeWindow, timeWindow === 'auto' ? 'auto' : Number(timeWindow));
    assert.equal(restored.timeScale, timeScale);
    const r = calculate(restored);
    for (const key of ['math', 'transfer', 'runtime', 'mathStart', 'transferStart', 'throughput']) assert.equal(r[key], original[key]);
  }
  assert.equal(normalize({ timeWindow: 'invalid' }).timeWindow, defaults.timeWindow);
  assert.equal(normalize({ timeScale: 'invalid' }).timeScale, 'linear');
});

test('GPU and network views default to 10 microseconds while explicit time windows take precedence', () => {
  for (const family of ['tpu', 'gpu']) for (const boundary of ['hbm', 'network']) {
    const input = { family, boundary };
    const expected = (family === 'gpu' || boundary === 'network') ? 0.00001 : 0.001;
    assert.equal(normalize(input).timeWindow, expected);
    assert.equal(normalize({ ...input, timeWindow: 'invalid' }).timeWindow, expected);
    for (const timeWindow of ['auto', 0.00001, 0.001, 0.1]) {
      assert.equal(normalize({ ...input, timeWindow }).timeWindow, timeWindow);
    }
  }
});


test('network comparison pins an absolute bandwidth independently of the live hardware', () => {
  const initial = calculate({ family: 'gpu', boundary: 'network' });
  assert.equal(initial.comparisonBandwidth, 2 * initial.bandwidth);
  const pinned = { ...initial, networkBW2: initial.bandwidth };
  for (const change of [{ bandwidthScale: 10 }, { gpu: 'rubin' }, { fabric: 'scaleout' }, { family: 'tpu' }]) {
    assert.equal(calculate({ ...pinned, ...change }).comparisonBandwidth, initial.bandwidth);
  }
  const hbm = calculate({ ...pinned, boundary: 'hbm' });
  assert.equal(hbm.comparisonBandwidth, 2 * hbm.bandwidth);
  assert.equal(calculate({ ...pinned, networkBW2: 'auto' }).comparisonBandwidth, 2 * initial.bandwidth);
  for (const invalid of [0, -1, Infinity, 'garbage', null]) assert.equal(normalize({ networkBW2: invalid }).networkBW2, 'auto');
});

test('resource multipliers support four decades while remaining bounded', () => {
  assert.equal(normalize({ computeScale: 10 }).computeScale, 10);
  assert.equal(normalize({ bandwidthScale: 50 }).bandwidthScale, 50);
  assert.equal(normalize({ computeScale: 1e9 }).computeScale, 100);
  assert.equal(normalize({ bandwidthScale: 0 }).bandwidthScale, 0.01);
});


test('log defaults to the largest fixed window independently of the linear window', () => {
  for (const family of ['tpu', 'gpu']) for (const boundary of ['hbm', 'network']) {
    assert.equal(normalize({ family, boundary, timeScale: 'log' }).timeWindow, 1);
    assert.equal(normalize({ family, boundary, timeScale: 'log', timeWindow: 'invalid' }).timeWindow, 1);
    assert.equal(normalize({ family, boundary, timeScale: 'log', timeWindow: 0.1 }).timeWindow, 0.1);
  }
});


test('GPU configurations reject legacy INT8 compute, weights, and wire values', () => {
  for (const [gpu, hw] of Object.entries(hardware).filter(([, hw]) => hw.family === 'gpu')) {
    for (const precision of ['int8', 'weights8']) for (const boundary of ['hbm', 'network']) {
      const r = calculate({ family: 'gpu', gpu, precision, boundary, wire: 1 });
      assert.equal(r.precision, 'bf16');
      assert.equal(r.C, hw.compute);
      assert.equal(r.wire, 2);
    }
  }
  for (const precision of ['int8', 'weights8']) {
    const s = normalize({ family: 'tpu', precision, wire: 1 });
    assert.equal(s.precision, precision);
    assert.equal(s.wire, 1);
  }
});
