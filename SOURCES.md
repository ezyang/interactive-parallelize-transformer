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

STATUS: skeleton — being filled in.

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
- W_scale-out (IB share per GPU) — **5e10 B/s** — DGX H100/SuperPod reference design: one 400 Gb/s ConnectX-7 per GPU → 400 Gb/s = 50 GB/s per GPU. Book: "8 400Gbps CX7 NICs (one per GPU)" and "each node has 400GB/s of egress bandwidth into the IB network" (source/gpus.md) — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17. NVIDIA DGX H100 page lists the same NIC config (see https://www.nvidia.com/en-us/data-center/dgx-h100/).
- HBM capacity — **80 GB HBM3** — spec table: "GPU Memory: 80GB", "Memory Bandwidth: 3.35TB/s" — https://www.nvidia.com/en-us/data-center/h100/ — 2026-08-17. (The page names HBM3 explicitly only for the NVL variant; the H100 SXM datasheet and Hopper whitepaper specify 80 GB HBM3.) Book agrees: "H100 … 80GB" (source/gpus.md memory table).
- podSize (NVLink domain) — **8** — "Sets of 8 GPUs called nodes … for H100, we have 4 NVSwitches per node" (source/gpus.md) — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17.

## B200 (8-GPU node)
Current preset: C=2.25e15, Wici=9e11, Wdcn=5e10, HBM=1.92e11, podSize=8.

- C (dense bf16) — **2.25e15 FLOP/s** — HGX B200 spec table (per 8-GPU system): "FP16/BF16 Tensor Core: 36 PFLOPS" with footnote "Specification in Sparse. Dense is ½ sparse spec shown." — https://www.nvidia.com/en-us/data-center/hgx/ — 2026-08-17. Per GPU dense = 36/8/2 = **2.25 PFLOP/s**. Cross-check: DGX B200 "FP8 Tensor Core: 72 PFLOPS" (sparse) → 4.5 PF dense FP8/GPU = 2× bf16 ✓ (https://www.nvidia.com/en-us/data-center/dgx-b200/, 2026-08-17). Book: "B200 … 2.3e15" (rounded; source/gpus.md).
- W_link (NVLink 5 egress per GPU) — **9e11 B/s** — "NVLink GPU-to-GPU Bandwidth: 1.8 TB/s" (bidirectional; per-direction 900 GB/s) — https://www.nvidia.com/en-us/data-center/hgx/ — 2026-08-17. Book: "NVLink 5 with twice the overall NVLink bandwidth (900GB/s)" (source/gpus.md Appendix A).
- W_scale-out (IB share per GPU) — **5e10 B/s** — DGX B200: "4x OSFP ports serving 8x single-port NVIDIA ConnectX-7 VPI … Up to 400 Gb/s NVIDIA InfiniBand/Ethernet" → 400 Gb/s = 50 GB/s per GPU — https://www.nvidia.com/en-us/data-center/dgx-b200/ — 2026-08-17.
- HBM capacity — **180 GB HBM3e** (per GPU) — DGX B200: "1,440 GB total, 64 TB/s HBM3e bandwidth" → 1440/8 = 180 GB, 8 TB/s per GPU — https://www.nvidia.com/en-us/data-center/dgx-b200/ — 2026-08-17. The book (and the original announcement, still echoed on Wikipedia's "B200 SXM 192GB" row, https://en.wikipedia.org/wiki/Blackwell_(microarchitecture), 2026-08-17) says **192 GB**. RECOMMEND 180 GB (1.8e11): it is what NVIDIA's shipping-system datasheets state today.
- podSize (NVLink domain) — **8** — "B200 still has 8-GPU nodes, just like H100s" (source/gpus.md Appendix A) — https://jax-ml.github.io/scaling-book/gpus/ — 2026-08-17.

## GB200 NVL72
Current preset: C=2.25e15, Wici=9e11, Wdcn=5e10, HBM=1.92e11, podSize=72.

- C (dense bf16) — **2.5e15 FLOP/s** — GB200 NVL72 spec table (per 72-GPU rack): "FP16/BF16 Tensor Core: 360 PFLOPS" with footnote "Specification in sparse. Dense is one-half sparse spec shown." — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17. Per GPU dense = 360/72/2 = **2.5 PFLOP/s**. Note this is HIGHER than the 8-GPU HGX B200 figure (2.25) — the GB200's B200 GPUs run at a higher power limit (liquid-cooled ~1200 W vs ~1000 W). Preset value 2.25e15 is therefore low; see discrepancies.
- W_link (NVLink 5 egress per GPU) — **9e11 B/s** — "fifth-generation NVLink … provides 1.8 TB/s of GPU-to-GPU interconnect" (bidirectional; per-direction 900 GB/s); rack total "130 TB/s" — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17. Book: "GB200 NVL72 … combine 72 GPUs in a single NVLink domain with full 900GB/s of GPU to GPU bandwidth" (source/gpus.md).
- W_scale-out (IB share per GPU) — **5e10 B/s** — DGX GB200 SuperPod reference design uses one ConnectX-7 400 Gb/s per GPU (book: GB200 SuperPods get "proportionally higher (9x) IB fat tree bandwidth" vs an 8-GPU node, i.e. 72 × 400 Gb/s per rack; source/gpus.md, https://jax-ml.github.io/scaling-book/gpus/, 2026-08-17). NVIDIA's NVL72 page names Quantum-X800/Spectrum-X but prints no per-GPU NIC figure — treat 400 Gb/s (5e10 B/s) as the H100-generation-carryover reference design.
- HBM capacity — **186 GB HBM3e** (per GPU) — spec table: rack "13.4 TB HBM3E | 576 TB/s", Superchip (2 GPUs) "372 GB HBM3E | 16 TB/s" → 186 GB, 8 TB/s per GPU — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17. Preset says 1.92e11 (192 GB) — see discrepancies. RECOMMEND 186 GB (1.86e11).
- podSize (NVLink domain) — **72** — "GB200 NVL72 … 72 Blackwell GPUs" — https://www.nvidia.com/en-us/data-center/gb200-nvl72/ — 2026-08-17.

## GB300 NVL72
Current preset: C=2.5e15, Wici=9e11, Wdcn=1e11, HBM=2.88e11, podSize=72.

- C (dense bf16) — **2.5e15 FLOP/s** — GB300 NVL72 spec table (per 72-GPU rack): "FP16/BF16: 360 PFLOPS" under "All Tensor Core specifications are with sparsity unless otherwise noted" — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17. Per GPU dense = 360/72/2 = **2.5 PFLOP/s** — same bf16 as GB200 (Blackwell Ultra's uplift is in NVFP4: "1440 PFLOPS sparse | 1080 PFLOPS dense" vs GB200's 1440|720). Preset ✓.
- W_link (NVLink 5 egress per GPU) — **9e11 B/s** — same fifth-gen NVLink as GB200: rack "NVLink Bandwidth: 130 TB/s", 1.8 TB/s GPU-to-GPU bidirectional → 900 GB/s per direction — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17.
- W_scale-out (per GPU) — **1e11 B/s** — "hosts two ConnectX-8 devices, providing 800 gigabits per second (Gb/s) of network connectivity for each GPU" → 800 Gb/s = 100 GB/s per GPU — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17. Preset ✓.
- HBM capacity — **288 GB HBM3e** (per GPU) — spec table: "GPU Memory | Bandwidth: 20 TB | Up to 576 TB/s" per rack → 20 TB/72 ≈ 288 GB per GPU (HBM3E) — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17. Preset ✓ (2.88e11).
- podSize (NVLink domain) — **72** — "GB300 NVL72 … 72 Blackwell Ultra GPUs" — https://www.nvidia.com/en-us/data-center/gb300-nvl72/ — 2026-08-17.

## H800 SXM (8-GPU node; "H800 (DeepSeek)" preset)
Current preset (sections/07-pods.html, index.html t-preset buttons): C=9.9e14, Wici=3e11, Wdcn=5e10, HBM=8e10, podSize=8.

- C (dense bf16) — **9.9e14 FLOP/s** — "BF16: 989.43 TFLOPS, with sparsity: 1978.86 TFLOPS" — https://www.waredb.com/processor/nvidia-h800 — 2026-08-17 (NVIDIA no longer hosts a public H800 datasheet; the H800 kept H100 SXM's tensor-core throughput and cut NVLink + FP64). Book uses the same: "990e12" for H800 (source/gpus.md §rooflines). DeepSeek-V3 confirms the part: "trained on a cluster equipped with 2048 NVIDIA H800 GPUs" — https://arxiv.org/abs/2412.19437 — 2026-08-17.
- W_link (NVLink egress per GPU) — spec **2e11 B/s** (400 GB/s bidirectional → 200 GB/s per direction) — "the H800 supports NVLink at 400 GB/s of bidirectional bandwidth … Reduced NVLink bandwidth (400 vs 900 GB/s) compared to H100" — https://getdeploying.com/gpus/nvidia-h800 — 2026-08-17 (secondary source; no vendor page exists). MEASURED: "NVLink offers a bandwidth of 160 GB/s, roughly 3.2 times that of IB (50 GB/s)" — DeepSeek-V3 technical report, https://arxiv.org/abs/2412.19437 — 2026-08-17 (DeepSeek quotes the practically usable per-direction figure). The book instead says "lower 300GB/s of bandwidth (instead of 450GB/s on H100)" (source/gpus.md §rooflines), which matches neither the 200 GB/s spec-per-direction nor DeepSeek's 160 GB/s; the current preset Wici=3e11 follows the book. RECOMMEND spec 2e11 with effIci≈0.8 (160/200) — see discrepancies.
- W_scale-out (IB share per GPU) — **5e10 B/s** — "IB (50 GB/s)" per GPU (400 Gb/s NIC) — DeepSeek-V3 technical report, https://arxiv.org/abs/2412.19437 — 2026-08-17. Preset ✓.
- HBM capacity — **80 GB HBM3** — "80 GB … HBM3 5120-bit … 3361 GB/s" — https://www.waredb.com/processor/nvidia-h800 — 2026-08-17. Preset ✓ (8e10).
- podSize (NVLink domain) — **8** — "Each node in the H800 cluster contains 8 GPUs connected by NVLink and NVSwitch within nodes" — https://arxiv.org/abs/2412.19437 — 2026-08-17. Preset ✓.

## Discrepancies vs current presets
(pending)

## Proposed efficiency factors
(pending)
