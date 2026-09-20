# Interactive roofline chapter

`roofline.html` is a separate interactive adaptation of
[All About Rooflines](https://jax-ml.github.io/scaling-book/roofline/), Part 1 of
the JAX Scaling Book. It retains the original article's structure and uses
the parallelizing article's shared styles and live-number controls, with its own
small state/model implementation so the training chapter's network conventions
and defaults remain independent. No external scripts, fonts, or runtime requests.

The source snapshot is `source/roofline.md`, retrieved from
https://raw.githubusercontent.com/jax-ml/scaling-book/main/roofline.md on
2026-09-19 (America/New_York). Copyright and MIT notice are retained in
`LICENSE-scaling-book.txt` and linked on both pages.

## Editorial treatment

The chapter's argument, equations, dot-product example, matrix multiplication
example and two-chip network example are retained in the appropriate reading.
Four source exercises are retained only in their matching HBM configurations: Questions
1–3 on TPU v5e and the H100 spec-sheet question (renumbered 4) on H100 SXM.
Both require compute and bandwidth multipliers of 1. The source’s per-token
INT8 weight-matrix question and all network/hardware adaptations of the exercises
are removed. Each retained question specifies its own precision; it does not
change with the global precision selector. The original summary is reproduced verbatim (also in the
HTML description). Source prose is restored for the computation, communication,
overlap, arithmetic-intensity, dot-product, roofline, matmul, and HBM exercise
passages. Small local changes select the bandwidth boundary and hardware, replace
fixed numbers with live values, and generalize precision. Control tutorials and
interaction prompts have been removed.

Following the parallelizing article, ✦ adaptation labels entirely new paragraphs
or larger blocks: the linear-map/notation section, precision extensions, new
expandable explanations and hardware section. Small local
edits for the split views are deliberately not marked, per the user’s direction.
Interactive figures and captions are covered by the header disclosure. New
footnote prose is also labeled, including its copy in the bottom footnote list.
No per-sentence Δ markers or dotted underlines are added for these local edits.

The teaching text speaks in the chapter's own voice. Attribution and editorial
history stay in the credits and these notes. The original chapter's vocabulary
and notation take precedence over alternative standard terms: computation and
communication, T_math and T_comms, T_lower and T_upper, and the hardware's peak
or critical arithmetic intensity. Qualifications to the timing bounds appear in
an expandable explanation. Intensity(Computation) and Intensity(Accelerator) follow the original
essay’s written-out notation. Network communication uses matrices of
partial sums and a separately selected communication data type. D and F are input
and output hidden sizes; multiplication contracts over D. The linear-map view of
latent spaces is retained. Weight reuse across a batch is distinguished from the
increased arithmetic per activation byte provided by larger hidden dimensions.
The source snapshots and quoted vendor specifications are unchanged.

Two independent selectors produce four readings without four copies of the
chapter. Shared algebra appears once. Boundary-specific paragraphs change the
byte count and assumptions; hardware-specific paragraphs explain MXU/Tensor Core
terminology and ICI/NVLink topology. HBM mode includes the dot product and reuse
examples. Network mode keeps the original two-chip matmul throughout.

Conceptual questions have expandable explanations, including max versus sum, the
roofline's bend, batch reuse, cancellation of B in the network model, and the
different effects of weight and communication quantization. The retained TPU
answers use fixed v5e rates with live B/D/F dimensions; Question 3 fixes D/F to
4096 and 1024 and varies B. The H100 answer uses its original BF16 specification.

The HBM matmul takeaway uses the exact crossover for the selected D and F,
including input and output traffic. If the compute ceiling is unreachable, it
says the matmul stays HBM-bound at every batch size. The original small-batch
approximation remains in the derivation and is explicitly qualified.

The article shares the parallelizing page's warm paper background, serif prose
and headings, blue links, bordered takeaways, figure panels, and expandable
answers through `css/style.css`. The original's author block, contents navigation,
numbered equations, figure captions, and numbered footnotes remain in this edition.
Secondary caveats have click/keyboard-accessible footnotes and an endnote list;
definitions needed for the next calculation remain in the main text. Equation
links retain stable IDs as their displayed numbers follow the active reading.
Fonts come from the system rather than an external font service.

HBM views label the Blackwell choices GB200 and GB300, without the NVL72 rack
designation. Network views retain NVL72 to identify the interconnect configuration.
The sourced system names below document where the per-GPU specifications come from.
Vera Rubin is labeled Rubin in HBM mode and Vera Rubin NVL72 in network mode;
both labels explicitly mark the preset as preliminary.

The main roofline restores the original's red/yellow/green regimes below the
faster roof: bandwidth-bound at both rates, compute-bound only at the faster
rate, and compute-bound at both rates. BW₁ is the selected bandwidth and BW₂
defaults to twice that rate. In the network view, “Pin BW₂ to current BW” saves an absolute bandwidth; it survives hardware, path, and multiplier changes and is included in shared URLs. “Restore 2× BW₁” resumes automatic comparison. Both roofs share the current compute ceiling. Region shading handles either ordering of the bandwidths. Filled and outlined points compare the same live operation
at both rates. The original's two fixed example algorithms are replaced by a
point calculated from the B/D/F controls. The main roofline supports hover
inspection but does not scrub dimensions: an intensity does not uniquely specify
a matrix shape. The secondary curve is dashed to distinguish it without relying
on color. The question 3 plot retains a logarithmic batch axis and batch scrubbing,
since that axis directly specifies B, to accommodate the extended batch range.

The main roofline's vertical scale is fixed at 10⁶–10¹⁹ operations/s per chip
across hardware, precision, dimensions, and resource multipliers. It includes
the lowest plotted rate (3.125M operations/s at intensity 0.1 on v5e DCN with
the minimum bandwidth multiplier) and highest compute ceiling (1750P FLOP/s
with Rubin FP8 and the maximum compute multiplier), with headroom.

Reading order follows the original computation, communication, and overlap
argument, defining C, W, Q and the times there. Before the added timeline, define
the matmul dimensions B/D/F, matrices X/Y/Z, and bytes per stored element
(a/w/o) or communicated element (s) in the labeled linear-map addition. Define overlap and bottleneck labels before
the timeline. Define Intensity(Computation) and Intensity(Accelerator) before the roofline. The dot-product
length N and tile dimensions are defined within their respective examples.
The B/D/F controls repeat beside both figures and share one state.
Dragging updates at most once per animation frame, with a final update on release.
Batch changes reuse existing timeline bars and plot markers; unchanged axes,
curves, text, dropdown options, and hardware rows remain in place. Axes and curves
are recalculated when their rates, domains, or display size change. This avoids
rebuilding the document and charts on every pointer movement.
The sticky top bar contains every scrubbable parameter, including the dot-product
length in HBM mode, plus the precision, network-path, and communication-data-type
selectors. Inline controls, including the precision dropdown beside the matmul,
remain synchronized with the bar. Its rows wrap on
narrow screens; on short screens the bar can scroll within half the viewport.
The D/F labels identify input/output hidden sizes. The definitions relate them
to a Transformer's model hidden size and MLP intermediate size for an expansion,
and explain that the projection back reverses these roles.
Both figures show the matmul's live D×F parameter count (and its per-chip share
in network mode). The timeline repeats the compute/transfer formulas by the
time readouts, with an expandable numerical breakdown of operations and bytes.

The browser audit also corrected percentage entry (50 means 50%), preserved odd
input widths in the unsharded HBM example, exposed the active precision beside
the figures, and made loading an exercise navigate to its updated roofline.
Copy and input-validation feedback stay visible wherever the reader has scrolled.
Workload controls are clamped to B=1–65,536, D=128–32,768, and F=128–131,072.
The timeline uses a fixed 10 µs window for GPU and network readings, and 1 ms
for TPU HBM, with explicit manual choices
from 10 µs to 1 s and an Auto (fit) option. Auto rounds the modeled finish time
up to a 1/2/5 time window with at least 15% headroom; fixed windows never rescale
on dimension, hardware, or overlap edits. Clipped intervals get continuation
arrows and retain their full numeric times. Linear/Log buttons select the axis
transform independently of the window. Log uses log(1 + time / 1 ns) to retain
zero and sub-nanosecond tasks on a continuous shared axis. All interval endpoints,
including delayed starts and the HBM parameter/activation split, use that same
transform; the figure explains that log widths are not proportional to duration.
Both view settings are included in shared URLs.

Corrections/qualifications to the source:

- “Upper bound” is a serial endpoint of the ideal two-resource model, not an
  upper bound on observed execution with latency, overhead, or inefficient
  kernels. Perfect overlap requires a legal schedule.
- A ridge is a ratio of hardware capacities. It is not a guarantee of achieved
  throughput. This edition does not inherit unsourced efficiency percentages.
  Editable compute/bandwidth multipliers are explicitly assumptions.
- Exact HBM matrix traffic can produce an unreachable compute ceiling at finite
  batch sizes. The document reports that case rather than a bogus crossover.
- The dot product has its own vector/scalar compute ceiling; we do not compare
  it with a Tensor Core/MXU peak to assert utilization.
- INT8 compute, INT8 weights, and INT8 network partials are offered only for TPU
  presets. INT8 arithmetic is labeled OPs and uses 2× BF16 compute. GPU presets
  offer BF16/FP8 compute and BF16/FP32 wire types; legacy GPU INT8 settings fall
  back to BF16. The network example’s operand types follow the selected precision.
- FP8 arithmetic is labeled FLOPs and uses each GPU's native dense FP8 rate.
  The FP8 preset reads one-byte inputs and weights and writes two-byte BF16
  output. Scaling metadata and quantization overhead are omitted. It is offered
  for the GPU presets; switching to a TPU falls back to BF16 with an explanation.
- Quantized storage, compute precision, and network communication data type are
  distinct. BF16 network partials match the source; FP32 doubles the traffic.
- “Local batch” means the B dimension of the modeled multiplication, in tokens.
  This edition does not generalize its threshold to arbitrary sharding layouts.

## Model and units

All capacity/traffic units are decimal bytes. Rates are per accelerator chip.
One multiply-add counts as two operations. Default inputs and output are BF16.

HBM: one unsharded matmul with B tokens, dimensions D and F. Each operand is read
once, and output is written once. With weight width w bytes, input activation
width a bytes, and output width o bytes:

    operations = 2 B D F
    bytes = a B D + w D F + o B F
    intensity = operations / bytes
    Intensity(Accelerator) = compute / HBM_bandwidth
    B_critical = w Intensity(Accelerator) D F / (2 D F - Intensity(Accelerator) (a D + o F))

The last expression has no finite solution if its denominator is nonpositive.
The approximate small-B threshold is w Intensity(Accelerator) / 2. Tiling may require repeated
loads, making this whole-matrix estimate optimistic.
For BF16, INT8, and INT8 weights with BF16 compute, o = a. FP8 uses a = w = 1
and o = 2. The output width affects the exact crossover but not the small-B rule.

Network: the source's two-chip D-sharded matmul. Each chip computes a partial
[B,F] output and sends it to the other chip. Send and receive overlap:

    operations_per_chip = B D F
    bytes_sent_per_chip = s B F
    intensity = D / s
    D_critical = s compute / network_egress

s is communicated bytes per partial-result element. Reduction arithmetic,
message latency, and quantization overhead are omitted. Local compute is assumed
to be supplied fast enough. All math and bytes are per chip; we do not combine
cluster-wide FLOPs with per-chip bandwidth. The GPU aggregate egress rate is an
optimistic available-bandwidth assumption for this pair, not measured pairwise
performance. Larger collectives require a different traffic/topology model.

Both modes use T_math = operations / C, T_comms = bytes / W, ideal throughput
min(C, W × Intensity(Computation)), and schedule time T_math + T_comms - overlap min(T_math,T_comms).
The illustrative timeline starts the shorter task at zero and the longer task
at `(1 - overlap) * min(T_math, T_comms)`. Both therefore start at zero for
perfect overlap; their intersection has exactly the selected fraction of the
shorter duration. In HBM mode, blue is parameter traffic wDF and orange is
activation traffic B(aD+oF). Their stacked widths sum to the HBM transfer time;
the parameter segment stays constant when B changes. Network traffic uses a
single color. Color does not encode overlap. This is an illustration of
resource overlap, not a dependency-accurate
kernel schedule. The overlap control does not alter the ideal roofline.

State is persisted in query parameters, leaving fragment identifiers for section
links. Share links include both axes and all edited numbers. Back/forward restores
state; reset preserves hardware, boundary, and network-path selections.
Linear timelines default to 0–10 µs in both Network readings and GPU × HBM;
TPU × HBM defaults to 0–1 ms. Log timelines default to 0–1 s, the largest fixed window. Each scale
remembers its own explicit window; both selections survive URLs and history.
Until a reader chooses a time window, it follows the selected reading's default.
Explicit windows (including Auto) persist across hardware/boundary switches and
in shared URLs. Reset clears both scales’ window selections. The active window
uses the existing timeWindow URL parameter; an explicit inactive selection uses
linearTimeWindow or logTimeWindow. Existing links retain their active window.

## Hardware

| Preset | Dense BF16 FLOP/s | HBM B/s | Fast network B/s | Scale-out B/s |
|---|---:|---:|---:|---:|
| TPU v5e | 197e12 | 820e9 | 45e9 | 3.125e9 |
| TPU v5p | 459e12 | 2.8e12 | 90e9 | 6.25e9 |
| TPU v6e | 918e12 | 1.6e12 | 90e9 | 12.5e9 |
| H100 SXM | 989.5e12 | 3.35e12 | 450e9 | 50e9 |
| B200 (HGX) | 2.25e15 | 8e12 | 900e9 | 50e9 |
| GB200 NVL72 | 2.5e15 | 8e12 | 900e9 | 50e9 |
| GB300 NVL72 | 2.5e15 | 8e12 | 900e9 | 100e9 |
| Vera Rubin NVL72 (preliminary GPU peak) | 4e15 | 22e12 | 1.8e12 | 200e9 |

**TPU fast network is one ICI link, one direction.** The training page uses
bidirectional ring bandwidth per mesh axis (90/180 GB/s); this two-chip exchange
uses the one-direction figures (45/90 GB/s). The difference is intentional.
**GPU fast network is aggregate outgoing NVLink bandwidth per GPU.** Do not sum
sending and receiving capacity for a one-way byte count. Scale-out is a per-chip
NIC share; GB200's figure describes the 400 Gb/s reference configuration, not
all possible GB200 installations.

### TPU sources

The preserved [TPU chapter](https://jax-ml.github.io/scaling-book/tpus/)
(`source/tpus.md`), section “TPU specs,” explicitly lists
v5e 197e12 / 8.2e11, v5p 4.59e14 / 2.8e12, and v6e 1.6e12 HBM B/s; its network
table lists one-way ICI 4.5e10 / 9e10 / 9e10. Its DCN paragraph gives v5e 3.125e9,
v5p 6.25e9, v6e 12.5e9 B/s. Public chapter:
https://jax-ml.github.io/scaling-book/tpus/ (local snapshot from 2026-08-17).
The book rounds v6e compute to 920 TFLOP/s; we use the vendor's 918 TFLOP/s.

Primary references: https://cloud.google.com/tpu/docs/v5e and
https://cloud.google.com/tpu/docs/v5p, quoted in `SOURCES.md` (2026-08-17).
https://cloud.google.com/tpu/docs/v6e, checked 2026-09-19, says “918 TFLOPs.”
The ICI values deliberately follow the book's operation-specific rates, rather
than dividing aggregate vendor port totals. The book explains the discrepancy.

### NVIDIA sources

These inherit the exact quoted vendor figures and retrieval dates in
`SOURCES.md` (2026-08-17), with HBM bandwidth added from those same source tables.
GB300 BF16, HBM bandwidth, NVLink, and per-GPU NIC figures were also rechecked on
the current NVIDIA page on 2026-09-19.

- [H100](https://www.nvidia.com/en-us/data-center/h100/): “1,979 TFLOPS” BF16
  with sparsity → 989.5 TFLOP/s dense; “Memory Bandwidth: 3.35TB/s”; NVLink
  900 GB/s bidirectional → 450 GB/s outgoing.
  [DGX H100 guide](https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html):
  eight ConnectX-7 400 Gb/s NICs for eight GPUs → 50 GB/s per GPU.
- [HGX B200](https://www.nvidia.com/en-us/data-center/hgx/): “FP16/BF16 Tensor
  Core: 36 PFLOPS” across eight GPUs, “Dense is ½ sparse spec shown” →
  2.25 PFLOP/s dense per GPU. “NVLink GPU-to-GPU Bandwidth: 1.8 TB/s” →
  900 GB/s outgoing. [DGX B200](https://www.nvidia.com/en-us/data-center/dgx-b200/):
  “64 TB/s HBM3e bandwidth” / 8 = 8 TB/s per GPU; eight 400 Gb/s CX-7 ports
  → 50 GB/s per GPU.
- [GB200 NVL72](https://www.nvidia.com/en-us/data-center/gb200-nvl72/):
  rack “FP16/BF16 Tensor Core: 360 PFLOPS,” “Dense is one-half sparse spec
  shown” → 360 / 72 / 2 = 2.5 PFLOP/s dense per GPU. Rack HBM bandwidth
  “576 TB/s” → 8 TB/s per GPU; “1.8 TB/s of GPU-to-GPU interconnect” →
  900 GB/s outgoing. The book's GPU chapter, Appendix A, gives 3.6 TB/s
  rack egress for 72 GPUs in the 400 Gb/s reference design → 50 GB/s/GPU.
- [GB300 NVL72](https://www.nvidia.com/en-us/data-center/gb300-nvl72/):
  “FP16/BF16 Tensor Core: 360 PFLOPS,” with “All Tensor Core specifications
  are with sparsity unless otherwise noted” → 2.5 PFLOP/s dense per GPU.
  “GPU Memory | Bandwidth: 20 TB | Up to 576 TB/s” → up to 8 TB/s per GPU.
  “NVLink Bandwidth: 130 TB/s” rounded for 72 GPUs, same fifth-generation
  NVLink (1.8 TB/s bidirectional per GPU) → 900 GB/s outgoing.
  ConnectX-8 “providing 800 gigabits per second (Gb/s) of network connectivity
  for each GPU” → 100 GB/s per GPU.

GB300's unchanged BF16/HBM/NVLink roof relative to GB200 is deliberate. Increased
memory capacity and NVFP4 performance are different quantities. The scale-out
network roof does change with the per-GPU NIC rate.

### FP8

The FP8 option was added on **2026-09-20**. It uses dense Tensor Core FLOP/s per
GPU, independently of the INT8 exercise's assumed 2× BF16 rate:

| GPU | Dense FP8 FLOP/s | Specification and conversion |
| --- | ---: | --- |
| H100 SXM | 1.979e15 | [H100](https://www.nvidia.com/en-us/data-center/h100/): 3,958 TFLOPS sparse / 2. The saved GPU chapter and `SOURCES.md` also give the 2× BF16 ratio. |
| B200 (HGX) | 4.5e15 | [DGX B200](https://www.nvidia.com/en-us/data-center/dgx-b200/): 72 PFLOPS sparse / 8 GPUs / 2; quoted in `SOURCES.md`. |
| GB200 | 5e15 | [GB200 NVL72](https://www.nvidia.com/en-us/data-center/gb200-nvl72/): 720 PFLOPS sparse / 72 GPUs / 2. |
| GB300 | 5e15 | [GB300 NVL72](https://www.nvidia.com/en-us/data-center/gb300-nvl72/): “FP8/FP6 Tensor Core 720 PFLOPS”; the table's sparsity footnote gives 720 / 72 / 2. |
| Rubin (preliminary) | 17.5e15 | [Vera Rubin datasheet](https://dam-cdn.nvd.orangelogic.com/AssetLink/56p68o47y6f1yucpubl0ump1c0aif422.pdf), page 9: “FP8/FP6 Training² 17.5 PFLOPS”; footnote 2 says “Dense specification.” No sparsity division. |

The saved GB300 webpage and June 22, 2026 Rubin datasheet were inspected for this
addition. Rubin's dense FP8 rate is **4.375× BF16**, so a generic 2× multiplier
would understate its compute ceiling. Its small-batch HBM threshold with one-byte
weights is about **398 tokens**, using the same preliminary 22 TB/s HBM preset.

The FP8 storage assumption is `fp8[B,D] × fp8[D,F] → bf16[B,F]`, with
higher-precision accumulation. E4M3/E5M2 both use one byte per value; scaling
metadata, conversions, and additional quantization traffic are outside the
roofline estimate. Native peak rates do not imply that all kernels or scaling
recipes achieve them. Network communication stays in its separately selected
data type, and the retained TPU INT8 exercises use the original v5e assumptions.

### Vera Rubin

Checked **2026-09-19**. The `rubin` preset uses the **preliminary GPU peak**
specifications in NVIDIA's [Vera Rubin datasheet](https://dam-cdn.nvd.orangelogic.com/AssetLink/56p68o47y6f1yucpubl0ump1c0aif422.pdf),
linked from the [Vera Rubin product page](https://www.nvidia.com/en-us/data-center/vera-rubin-nvl72/).
The PDF metadata dates this revision to 2026-06-22. Page 9, “Individual GPU
Specifications,” gives:

- “FP16/BF16²: 4 PFLOPS,” with footnote 2 “Dense specification.” Use **4e15
  FLOP/s** directly, without a sparsity division. The 288 PFLOP/s rack value is
  consistent: 288 / 72 = 4. Vera CPU performance is not added to the GPU roof.
- “GPU Memory | Bandwidth: 288 GB HBM4 | 22 TB/s.” Use **22e12 B/s**; capacity
  does not enter this roofline.
- “NVLink Bandwidth: 3.6 TB/s,” sixth generation. As for earlier NVLink
  generations, divide the bidirectional GPU interconnect rate by two for
  outgoing bytes: **1.8e12 B/s**.
- Footnote 1: “Preliminary information. All values are up to and subject to
  change.” This qualification is visible in the selector, figures, and table.

NVIDIA's [Rubin GPU architecture article](https://developer.nvidia.com/blog/inside-nvidia-rubin-gpu-architecture-powering-the-era-of-agentic-ai/)
also specifies up to 22 TB/s HBM4 and 3,600 GB/s NVLink 6. Its
[platform architecture article](https://developer.nvidia.com/blog/inside-the-nvidia-rubin-platform-six-new-chips-one-ai-supercomputer/),
“ConnectX-9: Pushing the limits of AI scale-out bandwidth,” states “1.6Tb/s of
network bandwidth per Rubin GPU.” Convert bits to bytes: 1.6e12 / 8 =
**200e9 B/s outgoing**. This is a per-GPU NIC rate; no additional factor of two
is applied. It agrees with the datasheet's 28.8 TB/s aggregate rack networking
when counted bidirectionally over 72 GPUs.

**Official-source discrepancy:** the live product webpage checked on the same
date lists 19.2 TB/s HBM4, 3 TB/s NVLink, and 0.45 TB/s *bidirectional* scale-out
per GPU. Those would imply 19.2e12 HBM B/s, 1.5e12 outgoing NVLink B/s, and
225e9 outgoing scale-out B/s. Its BF16 value still agrees at 4 PFLOP/s dense.
We do not claim these bandwidth tables are identical or infer which profile
explains the difference. This preset consistently follows the linked individual
GPU peak datasheet plus the explicit ConnectX-9 rate, and exposes the discrepancy
beside the selected hardware's explanation. The initial BF16 HBM ridge is
4e15 / 22e12 ≈ **181.8 FLOP/byte**; the two-chip BF16 critical D is approximately
4,444 over NVLink or 40,000 over scale-out.

The same datasheet gives **250 TOP/s dense INT8**, far below 2× BF16.
GPU INT8 options have been removed rather than presenting hypothetical rates.

## Verification

`node --test tests/roofline-model.test.cjs` checks published baseline ratios,
exact versus approximate thresholds, quantization, legacy GPU INT8 fallback, the
two-chip send/receive convention, overlap endpoints, parameter versus activation
traffic, workload limits, invalid input handling, and all
hardware/boundary/precision combinations.

`node tests/roofline-browser.cjs` checks notation order, shared controls in all
four readings, pointer/keyboard editing, fixed and automatic timeline windows,
linear/log scales and saved view settings, HBM segment sizes and colors as batch
and overlap change, overflow and manual time windows,
roofline regimes and bandwidth comparison, equation numbering and links,
footnote keyboard/touch behavior, matching exercise visibility, unreachable
HBM takeaways, precision-aware network notation, exercise navigation, and mobile layout.
It requires Playwright; see README.md.

Compute and bandwidth multipliers span 0.01–100×. Pointer dragging is logarithmic (160 pixels per decade), with three significant digits; arrow keys change them by 5% per step. Overlap remains linear.
