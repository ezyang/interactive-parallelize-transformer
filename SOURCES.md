# SOURCES.md — hardware citations for the interactive parallelism article

Ground truth for every hardware number the page uses (spec AND measured).
Retrieval date for all entries: 2026-08-17 unless noted.

Conventions:
- C = peak DENSE bf16 matmul FLOP/s per chip. NVIDIA datasheets headline
  *sparsity* numbers ("with sparsity"); every NVIDIA dense figure below is the
  datasheet number halved, and each entry says which was quoted.
- W_link = TPU per-axis ICI bandwidth (bidirectional) / GPU per-GPU NVLink
  egress (full-duplex, i.e. NVIDIA's "bidirectional" headline halved).
- W_scale-out = TPU per-chip DCN egress / GPU per-GPU share of node NICs.
- "the book" = "How to Scale Your Model", Austin et al., Google DeepMind,
  https://jax-ml.github.io/scaling-book/ — local copies in /source/*.md;
  it is itself a citable source and several measured claims exist only there.

## TPU v5p
Current preset: C=4.59e14, Wici=1.8e11, Wdcn=6.25e9, HBM=9.6e10, podSize=8960.

- C (dense bf16) — **4.59e14 FLOP/s** — "Peak compute per chip (BF16) (TFLOPs): 459" — https://docs.cloud.google.com/tpu/docs/v5p — 2026-08-17. Corroborated by the book's table: "TPU v5p … FLOPs/s/chip (bf16) 4.59e14" (source/tpus.md, spec table).
- W_link (ICI, per axis, bidirectional) — **1.8e11 B/s** — book: "9.0e10 [one-way] / 1.8e11 [bidi]" per link (source/tpus.md interconnect table) and "`9e10` bytes/s (90 GB/s) of ICI bandwidth per axis" (source/tpus.md §Networking) — https://jax-ml.github.io/scaling-book/tpus/ — 2026-08-17. Google's page instead lists the per-chip total: "Bidirectional inter-chip interconnect (ICI) bandwidth per chip (GBps): 1200" (https://docs.cloud.google.com/tpu/docs/v5p, 2026-08-17), i.e. 100 GB/s per direction per link across 6 links — the book footnote explicitly flags this: "The page above lists 100 GB/s … ICI links have slightly different bandwidths depending on the operation being performed." RECOMMEND the book's 1.8e11 (operationally realistic; matches preset).
- W_scale-out (DCN egress per chip) — **6.25e9 B/s** — "Data center network (DCN) bandwidth per chip (Gbps): 50" (= 6.25 GB/s) — https://docs.cloud.google.com/tpu/docs/v5p — 2026-08-17. Book agrees: "`6.25e9` bytes/s (6.25 GB/s) of DCN (egress) bandwidth per TPU" (source/tpus.md).
- HBM capacity — Google: **95 GiB** ("HBM capacity per chip (GiB): 95", https://docs.cloud.google.com/tpu/docs/v5p, 2026-08-17) vs book: **96 GB** ("TPU v5p … HBM capacity/chip 96GB", source/tpus.md spec table). 95 GiB = 1.02e11 bytes; 96 GB = 9.6e10 bytes. RECOMMEND keeping 96 GB (9.6e10): it is the figure the chapter's own arithmetic uses, and Google's 95 GiB (~102e9 B) likely reflects the same physical stack quoted in different units/reservation; the two differ by ~6% and the conservative smaller byte count is the safer default for memory-fit checks.
- HBM generation — commonly reported **HBM2e**, but ESTIMATE: neither Google's docs page nor Wikipedia names the generation (Wikipedia lists only "95 GB HBM, 2765 GB/s", https://en.wikipedia.org/wiki/Tensor_Processing_Unit, retrieved 2026-08-17). Label it plain "HBM" unless a naming source is found.
- podSize — **8960** — "There are 8960 chips in a v5p Pod." — https://docs.cloud.google.com/tpu/docs/v5p — 2026-08-17.

## TPU v5e
Current preset: C=1.97e14, Wici=9e10, Wdcn=3.125e9, HBM=1.6e10, podSize=256.

- C (dense bf16) — **1.97e14 FLOP/s** — "Peak compute per chip (bf16): 197 TFLOPs" — https://docs.cloud.google.com/tpu/docs/v5e — 2026-08-17. Book table agrees: "TPU v5e … 1.97e14".
- W_link (ICI, per axis, bidirectional) — **9e10 B/s** — book: "TPU v5e … 4.5e10 [one-way] / 9.0e10 [bidi]" per link (source/tpus.md interconnect table) — https://jax-ml.github.io/scaling-book/tpus/ — 2026-08-17. Google lists the per-chip total: "Bidirectional inter-chip interconnect (ICI) bandwidth (per chip): 400 GBps; ICI ports per chip: 4" (https://docs.cloud.google.com/tpu/docs/v5e, 2026-08-17) = 100 GB/s bidi per port, vs the book's 90 GB/s bidi per link — same 10% vendor-vs-operational gap as v5p. RECOMMEND book's 9e10 (matches preset).
- W_scale-out (DCN egress per chip) — **3.125e9 B/s** — Google: "Per-host NIC configuration: 2 x 100 Gbps NIC; Chips per host: 8" → 200 Gb/s ÷ 8 chips = 25 Gb/s = 3.125 GB/s per chip (also "Data center network bandwidth per Pod: 6.4 Tbps" ÷ 256 chips = 25 Gb/s) — https://docs.cloud.google.com/tpu/docs/v5e — 2026-08-17. Book footnote agrees: "v5e has 3.125e9 bytes/s" (source/tpus.md).
- HBM capacity — **16 GB** — "HBM capacity per chip: 16 GB" — https://docs.cloud.google.com/tpu/docs/v5e — 2026-08-17. Book agrees ("16GB").
- HBM generation — commonly reported **HBM2**, but ESTIMATE: neither Google's docs page nor Wikipedia names the generation (Wikipedia lists only "16 GB HBM, 819 GB/s", https://en.wikipedia.org/wiki/Tensor_Processing_Unit, retrieved 2026-08-17). Label it plain "HBM" unless a naming source is found. (Side note: Wikipedia/book say 819 GB/s HBM BW; Google's page says "800 GiBps" — same number in different units.)
- podSize — **256** — "TPU Pod size: 256 chips" — https://docs.cloud.google.com/tpu/docs/v5e — 2026-08-17.

## H100 SXM (8-GPU node)
Current preset: C=9.9e14, Wici=4.5e11, Wdcn=5e10, HBM=8e10, podSize=8.

- C (dense bf16) — **9.9e14 FLOP/s** — NVIDIA H100 SXM spec table: "BFLOAT16 Tensor Core: 1,979 teraFLOPS" with footnote "With sparsity" — https://www.nvidia.com/en-us/data-center/h100/ — 2026-08-17. Dense = 1979/2 = **989.5 TFLOP/s** (the sparsity halving is ours; NVIDIA prints no dense number on this page). Book agrees: "H100 … FLOPs/s/chip (bf16) 9.9e14" and "[990 bf16 TFLOPs/s]" (source/gpus.md).
- W_link (NVLink egress per GPU, full-duplex per direction) — **4.5e11 B/s** — NVIDIA: "NVIDIA NVLink: 900GB/s" (bidirectional total; same page, 2026-08-17); per-direction = 450 GB/s. Book: "`18 * 25=450GB/s` of full-duplex bandwidth from each GPU" (source/gpus.md, NVLink 4 = 18 links × 25 GB/s/direction) — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17.
- W_scale-out (IB share per GPU) — **5e10 B/s** — DGX H100 user guide: "4 x OSFP ports for 8 x NVIDIA ConnectX-7 Single Port InfiniBand Cards … InfiniBand (default): Up to 400Gbps" → 8 NICs ÷ 8 GPUs = 400 Gb/s = 50 GB/s per GPU — https://docs.nvidia.com/dgx/dgxh100-user-guide/introduction-to-dgxh100.html — 2026-08-17. Book agrees: "8 400Gbps CX7 NICs (one per GPU)", "each node has 400GB/s of egress bandwidth into the IB network" (source/gpus.md).
- HBM capacity — **80 GB HBM3** — spec table: "GPU Memory: 80GB", "Memory Bandwidth: 3.35TB/s" — https://www.nvidia.com/en-us/data-center/h100/ — 2026-08-17. (The page names HBM3 explicitly only for the NVL variant; the H100 SXM datasheet and Hopper whitepaper specify 80 GB HBM3.) Book agrees: "H100 … 80GB" (source/gpus.md memory table).
- podSize (NVLink domain) — **8** — "Sets of 8 GPUs called nodes … for H100, we have 4 NVSwitches per node" (source/gpus.md) — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17.

## B200 (8-GPU node)
Current preset: C=2.25e15, Wici=9e11, Wdcn=5e10, HBM=1.8e11, podSize=8.

- C (dense bf16) — **2.25e15 FLOP/s** — HGX B200 spec table (per 8-GPU system): "FP16/BF16 Tensor Core: 36 PFLOPS" with footnote "Specification in Sparse. Dense is ½ sparse spec shown." — https://www.nvidia.com/en-us/data-center/hgx/ — 2026-08-17. Per GPU dense = 36/8/2 = **2.25 PFLOP/s**. Cross-check: DGX B200 "FP8 Tensor Core: 72 PFLOPS" (sparse) → 4.5 PF dense FP8/GPU = 2× bf16 ✓ (https://www.nvidia.com/en-us/data-center/dgx-b200/, 2026-08-17). Book: "B200 … 2.3e15" (rounded; source/gpus.md).
- W_link (NVLink 5 egress per GPU) — **9e11 B/s** — "NVLink GPU-to-GPU Bandwidth: 1.8 TB/s" (bidirectional; per-direction 900 GB/s) — https://www.nvidia.com/en-us/data-center/hgx/ — 2026-08-17. Book: "NVLink 5 with twice the overall NVLink bandwidth (900GB/s)" (source/gpus.md Appendix A).
- W_scale-out (IB share per GPU) — **5e10 B/s** — DGX B200: "4x OSFP ports serving 8x single-port NVIDIA ConnectX-7 VPI … Up to 400 Gb/s NVIDIA InfiniBand/Ethernet" → 400 Gb/s = 50 GB/s per GPU — https://www.nvidia.com/en-us/data-center/dgx-b200/ — 2026-08-17.
- HBM capacity — **180 GB HBM3e** (per GPU) — DGX B200: "1,440 GB total, 64 TB/s HBM3e bandwidth" → 1440/8 = 180 GB, 8 TB/s per GPU — https://www.nvidia.com/en-us/data-center/dgx-b200/ — 2026-08-17. The book (and the original announcement, still echoed on Wikipedia's "B200 SXM 192GB" row, https://en.wikipedia.org/wiki/Blackwell_(microarchitecture), 2026-08-17) says **192 GB**. RECOMMEND 180 GB (1.8e11): it is what NVIDIA's shipping-system datasheets state today.
- podSize (NVLink domain) — **8** — "B200 still has 8-GPU nodes, just like H100s" (source/gpus.md Appendix A) — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17.

## GB200 NVL72
Current preset: C=2.5e15, Wici=9e11, Wdcn=5e10, HBM=1.86e11, podSize=72.

- C (dense bf16) — **2.5e15 FLOP/s** — GB200 NVL72 spec table (per 72-GPU rack): "FP16/BF16 Tensor Core: 360 PFLOPS" with footnote "Specification in sparse. Dense is one-half sparse spec shown." — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17. Per GPU dense = 360/72/2 = **2.5 PFLOP/s**. Note this is higher than the 8-GPU HGX B200 figure (2.25) because the GB200's B200 GPUs run at a higher power limit (liquid-cooled ~1200 W vs ~1000 W). Preset ✓.
- W_link (NVLink 5 egress per GPU) — **9e11 B/s** — "fifth-generation NVLink … provides 1.8 TB/s of GPU-to-GPU interconnect" (bidirectional; per-direction 900 GB/s); rack total "130 TB/s" — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17. Book: "GB200 NVL72 … combine 72 GPUs in a single NVLink domain with full 900GB/s of GPU to GPU bandwidth" (source/gpus.md).
- W_scale-out (IB share per GPU) — **5e10 B/s** — DGX GB200 SuperPod reference design uses one ConnectX-7 400 Gb/s per GPU (book: GB200 SuperPods get "proportionally higher (9x) IB fat tree bandwidth" vs an 8-GPU node, i.e. 72 × 400 Gb/s per rack; source/gpus.md, https://jax-ml.github.io/scaling-book/gpus/, 2026-08-17). NVIDIA's NVL72 page names Quantum-X800/Spectrum-X but prints no per-GPU NIC figure — treat 400 Gb/s (5e10 B/s) as the H100-generation-carryover reference design.
- HBM capacity — **186 GB HBM3e** (per GPU) — spec table: rack "13.4 TB HBM3E | 576 TB/s", Superchip (2 GPUs) "372 GB HBM3E | 16 TB/s" → 186 GB, 8 TB/s per GPU — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17. Preset ✓ (1.86e11).
- podSize (NVLink domain) — **72** — "GB200 NVL72 … 72 Blackwell GPUs" — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17.

## GB300 NVL72
Current preset: C=2.5e15, Wici=9e11, Wdcn=1e11, HBM=2.88e11, podSize=72.

- C (dense bf16) — **2.5e15 FLOP/s** — GB300 NVL72 spec table (per 72-GPU rack): "FP16/BF16: 360 PFLOPS" under "All Tensor Core specifications are with sparsity unless otherwise noted" — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17. Per GPU dense = 360/72/2 = **2.5 PFLOP/s** — same bf16 as GB200 (Blackwell Ultra's uplift is in NVFP4: "1440 PFLOPS sparse | 1080 PFLOPS dense" vs GB200's 1440|720). Preset ✓.
- W_link (NVLink 5 egress per GPU) — **9e11 B/s** — same fifth-gen NVLink as GB200: rack "NVLink Bandwidth: 130 TB/s", 1.8 TB/s GPU-to-GPU bidirectional → 900 GB/s per direction — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17.
- W_scale-out (per GPU) — **1e11 B/s** — "hosts two ConnectX-8 devices, providing 800 gigabits per second (Gb/s) of network connectivity for each GPU" → 800 Gb/s = 100 GB/s per GPU — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17. Preset ✓.
- HBM capacity — **288 GB HBM3e** (per GPU preset) — NVIDIA's rack spec rounds "GPU Memory | Bandwidth" to "20 TB | Up to 576 TB/s"; 288 GB × 72 = 20.736 TB raw, consistent with that rounded rack total — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17. Preset ✓ (2.88e11).
- podSize (NVLink domain) — **72** — "GB300 NVL72 … 72 Blackwell Ultra GPUs" — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17.

## H800 SXM (8-GPU node; "H800 (DeepSeek)" preset)
Current preset: C=9.9e14, Wici=2e11, Wdcn=5e10, HBM=8e10, podSize=8.

- C (dense bf16) — **9.9e14 FLOP/s** — "BF16: 989.43 TFLOPS, with sparsity: 1978.86 TFLOPS" — https://www.waredb.com/processor/nvidia-h800 — 2026-08-17 (NVIDIA no longer hosts a public H800 datasheet; the H800 kept H100 SXM's tensor-core throughput and cut NVLink + FP64). Book uses the same: "990e12" for H800 (source/gpus.md §rooflines). DeepSeek-V3 confirms the part: "trained on a cluster equipped with 2048 NVIDIA H800 GPUs" — https://arxiv.org/abs/2412.19437 — 2026-08-17.
- W_link (NVLink egress per GPU) — spec **2e11 B/s** (400 GB/s bidirectional → 200 GB/s per direction) — "the H800 supports NVLink at 400 GB/s of bidirectional bandwidth … Reduced NVLink bandwidth (400 vs 900 GB/s) compared to H100" — https://getdeploying.com/gpus/nvidia-h800 — 2026-08-17 (secondary source; no vendor page exists). MEASURED: "NVLink offers a bandwidth of 160 GB/s, roughly 3.2 times that of IB (50 GB/s)" — DeepSeek-V3 technical report, https://arxiv.org/abs/2412.19437 — 2026-08-17 (DeepSeek quotes the practically usable per-direction figure). The book instead says "lower 300GB/s of bandwidth (instead of 450GB/s on H100)" (source/gpus.md §rooflines), which matches neither the 200 GB/s spec-per-direction nor DeepSeek's 160 GB/s. The preset uses the 2e11 spec with effIci=0.80, reproducing DeepSeek's 1.6e11 measured value.
- W_scale-out (IB share per GPU) — **5e10 B/s** — "IB (50 GB/s)" per GPU (400 Gb/s NIC) — DeepSeek-V3 technical report, https://arxiv.org/abs/2412.19437 — 2026-08-17. Preset ✓.
- HBM capacity — **80 GB HBM3** — "80 GB … HBM3 5120-bit … 3361 GB/s" — https://www.waredb.com/processor/nvidia-h800 — 2026-08-17. Preset ✓ (8e10).
- podSize (NVLink domain) — **8** — "Each node in the H800 cluster contains 8 GPUs connected by NVLink and NVSwitch within nodes" — https://arxiv.org/abs/2412.19437 — 2026-08-17. Preset ✓.

## Measured performance (basis for "measured" mode)

### Sustained dense-matmul throughput vs peak
- H100 (realistic LLM GEMM shapes) — **~720 TFLOP/s bf16 = 0.73 of peak** — "the H100 and H200 achieves roughly 720 TFLOP/s against their marketed 989.5 TFLOP/s"; FP8: "~1,280 TFLOP/s out of the marketed 1979 TFLOP/s"; "Real World Performance on public stable released software is nowhere close to its on paper marketed TFLOP/s." — SemiAnalysis, "MI300X vs H100 vs H200 Benchmark Part 1: Training", https://newsletter.semianalysis.com/p/mi300x-vs-h100-vs-h200-benchmark-part-1-training — 2026-08-17.
- H100 (best-case shape sweep, MAMF) — **794.5 TFLOPS = 80.3% of 989** — Stas Bekman, ml-engineering "Maximum Achievable Matmul FLOPS" table (torch 2.7.0+cu126; "if the accelerator is overheated it'd usually throttle its performance down") — https://github.com/stas00/ml-engineering/blob/master/compute/accelerator/README.md — 2026-08-17.
- B200 — best-shape **1745.0 TFLOPS bf16 = 77.6% of 2250** (same MAMF table, torch 2.7.1+cu128); realistic-shape cuBLAS **1448–1562 TFLOP/s ≈ 0.64–0.69 of 2250** on Llama-7B FFN GEMMs (up/down projections, seq 2048/4096), best square-GEMM "1,672 TFLOP/s on B200 (at N=8192)" = 0.74 — "Evaluating CUDA Tile for AI Workloads on Hopper and Blackwell GPUs", https://arxiv.org/abs/2604.23466 (Tables III–IV) — 2026-08-17.
- GB200 — best-shape **1822.0 TFLOPS bf16 = 72.9% of 2500** — same MAMF table (torch 2.10 nightly + cu130) — https://github.com/stas00/ml-engineering/blob/master/compute/accelerator/README.md — 2026-08-17.
- GB300/B300 — best-shape **1769.0 TFLOPS bf16** ("same as B200, newer torch/cuda"; = 0.71 of the 2.5e15 GB300 rack-spec per-GPU peak) — same MAMF table — 2026-08-17. No GB300-specific GEMM benchmark found; this is the closest public number.
- H800 — no public pure-GEMM benchmark found. Derived: DeepSeek-V3 "training … on each trillion tokens requires only 180K H800 GPU hours" (https://arxiv.org/abs/2412.19437, 2026-08-17) ⇒ ≈37e9 activated params × 6 FLOPs/token × 1e12 tokens / (180e3×3600 s) ≈ 3.4e14 FLOP/s/GPU ≈ 35% of bf16 peak end-to-end (FP8 training) — consistent with H100-class sustained fractions after comms/overheads.
- End-to-end GPU MFU at scale (corroboration that deployed GPUs run well below datasheet dense) — Llama 3 405B: "overall BF16 Model FLOPs Utilization … of 38-43%" (430/400/380 TFLOPs/GPU on 8,192/16,384 H100s at "700W TDP") — https://arxiv.org/abs/2407.21783 — 2026-08-17.
- End-to-end TPU MFU at scale (the TPU-side contrast) — MaxText reference runs: TPU v5p "32B | v5p-128 | 3.28e+02 [TFLOP/chip/s] | 71.47% [MFU]" … "1160B | v5p-12288 | 3.04e+02 | 66.23%"; TPU v5e "32B … 132 TFLOP/sec/chip, 66.86% MFU" (1x v5e-256) — https://github.com/AI-Hypercomputer/maxtext/blob/bdc4d8d6d4ab767d2c3ee52dbb465278111f2be9/README.md — 2026-08-17 (pinned commit; table since moved out of README). NOTE these are end-to-end MFU *including* all comms — i.e. TPU end-to-end (66–71%) matches or beats the H100's *pure-GEMM* sustained fraction (73%), which is the concrete form of the claim "TPUs sustain closer to peak while GPUs are power/thermal-limited below datasheet dense numbers." No public TPU pure-GEMM microbenchmark was found; TPU pure-matmul sustained fraction is therefore bounded below by these MFUs but not directly citable.

### Achieved collective bandwidth vs claimed
- H100 NVLink AllReduce — **~370 GB/s effective vs 450 claimed (0.82), and only at ~10 GB messages** — the book: "we do achieve close to 370GB/s, less than 450GB/s but reasonably close, although only around 10GB/device" and takeaway "although NVIDIA claims bandwidths of about 450GB/s over an H100 NVLink, it is difficult in practice to exceed 370 GB/s" (source/gpus.md, figure gpu-all-reduce-bw.png, "AllReduce throughput for an 8xH100 node with SHARP disabled") — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17.
- H100 NVLink at realistic message sizes — "LLaMA-3 70B's MLPs … 58MB … can achieve only around 150GB/s compared to the peak 450GB/s. By comparison, TPUs achieve peak bandwidth at much lower message sizes (see Appendix B)" — source/gpus.md — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17. The book's Appendix B plots the TPU counterpart measurements: figures tpu-all-reduce-bw.png ("AllReduce bandwidth on a TPU v5p 4x4x4 cluster (along one axis)") and tpu-all-gather-bw.png (TPU v5e 8x16).
- SHARP (in-network reduction) — "in practice we see about a 30% increase in bandwidth with SHARP enabled, compared to the predicted 75%. This gets us up merely to about 480GB/s effective collective bandwidth" (source/gpus.md, figure sharp-all-reduce-cost.png, "from NCCL 2.27.5") — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17.
- H800 NVLink — **160 GB/s usable vs 200 GB/s spec per direction (0.80)** — "NVLink offers a bandwidth of 160 GB/s, roughly 3.2 times that of IB (50 GB/s)" — DeepSeek-V3, https://arxiv.org/abs/2412.19437 — 2026-08-17.
- GB200 NVL72 nccl-tests — vendor/operator validation target, not an independent benchmark: "expected bus bandwidth for all-reduce with 256-MB messages is typically around 900 GB/s per GPU (bidirectional)" on a healthy rack (NVLS/SHARP-class in-network reduction enabled; busbw metric) — https://www.leviathansystems.co/articles/nccl-bandwidth-validation — 2026-08-17. Cross-rack partitioned GB200 measurements exist (NVIDIA/nccl issue #1801: NVL8 ring ~393.7 GB/s busbw over IB) — https://github.com/NVIDIA/nccl/issues/1801 — 2026-08-17. **No independent public nccl-tests for a full single 8xB200 node or single NVL72 rack with message-size sweeps was found; B200/GB200/GB300 in-node collective efficiency is therefore ESTIMATED below.**
- GB300 NVL72 — **nothing citable found** (systems too new; DGX GB300 docs carry no busbw figures as of 2026-08-17).
- TPU DCN / GPU IB achieved efficiency — **no clean public measurement found for either** (TPU multislice posts claim scaling efficiency, not achieved GB/s; IB validation guides give pass thresholds, e.g. "a result under 80% of the expected value should trigger fabric investigation", Leviathan, URL above). Marked ESTIMATE below.

## Cross-check: sources vs current preset values

shell-top.html #hw-preset options (plus the H800 t-preset in sections/07-pods.html / index.html):

| Preset · field | Current value | Sourced value | Verdict |
|---|---|---|---|
| v5p · C | 4.59e14 | 4.59e14 (Google "459 TFLOPs") | OK |
| v5p · Wici | 1.8e11 | book 1.8e11/axis bidi; Google page implies 2e11/axis ("1200 GBps" per chip ÷ 3 axes) | OK — keep book value (book footnote explains the gap) |
| v5p · Wdcn | 6.25e9 | 6.25e9 (Google "50 Gbps per chip") | OK |
| v5p · HBM | 9.6e10 | Google "95 GiB" (=1.02e11); book "96GB" (=9.6e10) | OK — keep 9.6e10 (book; conservative), note vendor says 95 GiB |
| v5p · podSize | 8960 | 8960 | OK |
| v5e · C | 1.97e14 | 1.97e14 ("197 TFLOPs") | OK |
| v5e · Wici | 9e10 | book 9e10/link bidi; Google "400 GBps per chip / 4 ports" implies 1e11 | OK — keep book value |
| v5e · Wdcn | 3.125e9 | 3.125e9 (2×100 Gbps NIC ÷ 8 chips) | OK |
| v5e · HBM | 1.6e10 | 16 GB | OK |
| v5e · podSize | 256 | 256 | OK |
| H100 · C | 9.9e14 | 989.5e12 dense (1,979 TF sparsity ÷ 2) | OK |
| H100 · Wici | 4.5e11 | 450 GB/s per direction (900 GB/s bidi) | OK |
| H100 · Wdcn | 5e10 | 400 Gb/s CX-7 per GPU | OK |
| H100 · HBM | 8e10 | 80 GB HBM3 | OK |
| H100 · podSize | 8 | 8 | OK |
| B200 · C | 2.25e15 | 2.25e15 (HGX B200: 36 PF sparse ÷ 8 ÷ 2) | OK |
| B200 · Wici | 9e11 | 900 GB/s per direction (1.8 TB/s bidi) | OK |
| B200 · Wdcn | 5e10 | 400 Gb/s CX-7 per GPU (DGX B200) | OK |
| B200 · HBM | 1.8e11 | 1.8e11 (DGX B200 "1,440 GB total" ÷ 8 = 180 GB HBM3e; 192 GB was the announcement figure) | OK |
| B200 · podSize | 8 | 8 | OK |
| GB200 · C | 2.5e15 | 2.5e15 (NVL72: 360 PF sparse ÷ 72 ÷ 2; higher power limit than HGX B200) | OK |
| GB200 · Wici | 9e11 | 900 GB/s per direction | OK |
| GB200 · Wdcn | 5e10 | 400 Gb/s CX-7 per GPU (reference design; NVL72 page silent) | OK (mark ≈) |
| GB200 · HBM | 1.86e11 | 1.86e11 (Superchip "372 GB HBM3E" ÷ 2 = 186 GB) | OK |
| GB200 · podSize | 72 | 72 | OK |
| GB300 · C | 2.5e15 | 2.5e15 (360 PF sparse ÷ 72 ÷ 2) | OK |
| GB300 · Wici | 9e11 | 900 GB/s per direction | OK |
| GB300 · Wdcn | 1e11 | 800 Gb/s CX-8 per GPU | OK |
| GB300 · HBM | 2.88e11 | 288 GB nominal (72 × 288 GB = 20.736 TB; rack page rounds to "20 TB") | OK |
| GB300 · podSize | 72 | 72 | OK |
| H800 · C | 9.9e14 | 989.43 TFLOPS dense | OK |
| H800 · Wici | 2e11 | spec 2e11 (400 GB/s bidi ÷ 2); measured 1.6e11 (DeepSeek), represented by effIci=0.80 | OK |
| H800 · Wdcn | 5e10 | "IB (50 GB/s)" (DeepSeek) | OK |
| H800 · HBM | 8e10 | 80 GB HBM3 | OK |
| H800 · podSize | 8 | 8 | OK |

## Proposed efficiency factors (effC / effIci / effDcn ∈ (0,1])

Conservative defaults for measured mode. "eff" multiplies the (reconciled) spec value.

| Preset | effC | basis | effIci | basis | effDcn | basis |
|---|---|---|---|---|---|---|
| TPU v5p | 0.72 | ESTIMATE (lower bound): MaxText *end-to-end* 328 TFLOP/s/chip = 0.715 of 459 incl. all comms (pinned README above); pure-matmul sustained is strictly higher but unpublished | 0.95 | ESTIMATE: preset already uses the book's de-rated 90 GB/s (Google's page says 100); book Appx B measures TPU AllReduce reaching peak "at much lower message sizes" than GPUs | 0.90 | ESTIMATE: no public measurement; vendor NIC-share figure minus typical ~10% transport overhead |
| TPU v5e | 0.67 | ESTIMATE (lower bound): MaxText end-to-end 132 TFLOP/s/chip = 0.670 of 197 incl. comms | 0.95 | ESTIMATE: same as v5p (book Appx B tpu-all-gather-bw.png is measured on v5e 8x16) | 0.90 | ESTIMATE: as v5p |
| H100 | 0.73 | MEASURED: SemiAnalysis 720/989.5 bf16 GEMM (realistic shapes); best-shape ceiling 0.80 (stas00 MAMF) | 0.82 | MEASURED: book 370/450 GB/s AllReduce, 8xH100, SHARP off (and only at ~10 GB messages) | 0.85 | ESTIMATE: no public per-GPU IB AR measurement; healthy-fabric validation thresholds sit at 80–90% of line rate |
| B200 | 0.69 | MEASURED: cuBLAS 1448–1562/2250 on LLM-shaped GEMMs (arxiv 2604.23466); best-shape 0.776 (stas00) | 0.82 | ESTIMATE: inherits H100's measured NCCL/NVLink ratio; no independent 8xB200 nccl-tests found | 0.85 | ESTIMATE: as H100 (same CX-7 fabric) |
| GB200 NVL72 | 0.70 | ESTIMATE: stas00 best-shape 1822/2500 = 0.729; realistic shapes typically ~7 pts lower (H100 pattern) | 0.82 | ESTIMATE: inherits H100 ratio; operator validation target (~900 GB/s busbw at 256 MB w/ NVLS, Leviathan) suggests it may be higher at large messages | 0.85 | ESTIMATE: as H100 |
| GB300 NVL72 | 0.70 | ESTIMATE: B300 best-shape 1769 TFLOPS (stas00) = 0.71 of the 2.5e15 rack-spec peak; no GB300-specific data | 0.82 | ESTIMATE: inherits H100 ratio; nothing citable for GB300 | 0.85 | ESTIMATE: CX-8 fabric too new for public measurements |
| H800 | 0.73 | ESTIMATE: identical Hopper silicon to H100 (same 989 TFLOPS dense); DeepSeek end-to-end throughput consistent | 0.80 | MEASURED: DeepSeek 160 GB/s usable / 200 GB/s spec per direction (assumes Wici reconciled to 2e11; keep 0.53 only if 3e11 retained) | 0.85 | ESTIMATE: DeepSeek quote "IB (50 GB/s)" is nominal; no achieved fraction published |
