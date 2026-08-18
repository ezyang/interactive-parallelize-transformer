# EDITS-LOG — sweep outcomes (single writer: Fable)

> **INBOX: clear** as of 2026-08-17, commit 71ec0d1 · EDITS.md md5 `3221ed9d5c1e3da82a4ad92531f29200`
> (open judgment call from chat, unanswered: "stick to X, Y, Z for TPU by default?" — Fable recommends no)
> (If `md5 -q EDITS.md` no longer matches, the difference is unswept.)

One line per processed inbox item: ✓ done (commit) · ✗ skipped (why) · ? question.
Items already quoted here won't be re-processed on later sweeps.
Fable updates the INBOX stamp above at the end of every sweep and states it in chat.

---


## Sweep — axis-rename session
- ? "model table too wide / footnote flush with border" — QUEUED: sections/01-intro.html is owned by the running notation agent; fixing immediately after it lands.
- ✓ "recursive tooltip: pin blue, hover green shows nothing" — diagnosed as occlusion (the 400px pinned card covers neighbors at some window widths; mechanism itself verified working). Fix: pinned cards are now DRAGGABLE by their label row (manual offset preserved while the card tracks its anchor). core.js + css.
- ✓ "top-bar variable tooltips don't pin on click" — the colored letter tokens (D, F, E, k, C, W, …) are now click-to-pin everywhere, with live-refreshing value lines; green scrub numbers can't pin by design (click starts a scrub) — their letters carry the pinnable card instead.
- ✓ (was ?) "BIG ONE: hardware-neutral/switched terminology + global hardware slider" — DONE as hardware epic stage ④ (commit e94d0e3): the existing top-bar hardware select IS the global switch; under a GPU preset the chapter's vocabulary swaps in place (TPU→GPU, ICI→NVLink, DCN→InfiniBand, pod→node, MXU→tensor core; 42 term tokens + widget captions); TPU presets restore the chapter's exact words; comparative TPU-vs-GPU sentences and the pods section's deliberate contrast never swap. Disclosed in the header conventions.
- ✓ (was ?) "are the AllGather/ReduceScatter pills pulling their weight" — de-chromed to colored text only (no boxes), per chat.

## Sweep #2 — disclosure v3 + Z rename
- ✓ "model table too wide + footnote flush" — horizontal-scroll wrapper + margins (was queued; landed pre-sweep).
- ✓ "four schemes text should fold in EP" + NEW POLICY — implemented disclosure v3: woven-in additions carry a dotted underline (.add class, one howto convention line); splice edits beside a marked addition that quotation practice would allow go unmarked. Sentence now reads "five common parallelism schemes … expert parallelism (dotted) …".
- ✓ "state the model at the notation table" — inline model dropdown (mirrors the top bar, two-way synced) above the notation table.
- ✓ "margin notes center-aligned to cite point" — layouter centers each note on its anchor line; collisions still shunt downward.
- ✓ "delete the EP scope sentence, short Ed note" — deleted; replaced with the proposed (Ed: This edition is expanded to discuss expert parallelism, unlike the original.)
- ✓ "hovering the sentence highlights the margin note" — reverse tether via rAF hit-testing on cached anchor-sentence rects; works for ◦/✦/Δ alike.
- ✓ deleted the redundant "notation is alive" note (disclosed once in the header suffices).
- ✓ deleted the redundant "Live value column" note.
- ✓ F-convention note rewritten with the mixed dense/MoE-block limitation stated (DeepSeek-V3's dense first layers as the example).
- ✓ "sources as margin notes" — config.json/safetensors provenance moved to an (untagged) margin note; principle noted for future source mentions.
- ✓ "E/k note shouldn't be tagged + belongs at the model row" — untagged (inside the ✦-headlined block) and split into per-row notes on DeepSeek-V3 (counting example) and Kimi K3 (latent-width caveat).
- ✓ "Z renames to PP like DP/TP" — pipeline-stage Z renders PP (chapter mode restores Z); Z_E excluded; the notation table's third-mesh-axis Z de-tokenized (semantically a different Z — judgment call, flag if you disagree).

## Sweep #3 — separate axis variables + table consolidation (commits 434405e, cc559cf)
- ✓ CHAT ITEM "separate variables for each axis; consider dropping X/Y" — done for good: DP, TP, EP, PP (+ MDP/MTP) are now the actual state keys everywhere (expressions, URL hashes, tokens); the X/Y toggle, the `nota` key, and the article-settings dashboard are deleted. Old URLs still work (hash aliases X→DP, Y→TP, Z→PP, MX→MDP, MY→MTP). N stays = DP·TP (the chapter's mixed budget); EP/PP are scheme-scoped, not a 4D mesh. The letters that still mean themselves survive verbatim: the notation table's third-mesh-axis Z (live value now "—"), M_Z in the multi-axis note, the appendix's matrix X/Y.
- ✓ "not sure Mesh should be in the top bar" — removed from the top bar entirely (your second option): DP/TP/EP/PP remain one shared global state, but each is adjusted by the in-text scrubs where its section uses it. Flag if you'd rather have the adaptive-per-section display instead.
- ✓ "all the models together in the table / drop 275B giant" — preset-button row deleted; dense dropdown trio (LLaMA-3 70B, LLaMA-2 13B, Gemma 7B) now leads the model table with a "(chapter default)" tag; LLaMA-3 8B and the 275B giant are gone (they were exercise-agnostic leftovers from the first draft's preset row — nothing referenced them).
- ✓ "≈ on Kimi K3 should have a hover" — both ≈ cells (F and act. k·F) explain the latent-vs-routed width choice on hover.
- ✓ "equations' variables color-ified/tooltip-ified" — done at runtime for every .shape einsum (bare B/D/F/L/T/E/k letters and B_DP-style subscripts become the same colored hover tokens used elsewhere; 719 tokens on the page). The .eq equations were already tokenized.
- ✓ "selected model's row turns into the green scrubs" — the row whose shape matches the page state swaps its printed numbers for live D/F/L/E/k scrubs (and a computed act. k·F); loading DeepSeek-V3 moves the live row there, scrubbing any value moves it away (custom shape = no live row). Sorting uses the printed values.

## Hardware epic — stages ③ + ④ (commits bf0fcbd, e94d0e3)
- ✓ stage ③ "theoretical vs measured throughput/bandwidth" — top-bar spec/measured segmented control; measured mode derates every equation and widget (C × sustained, W × achieved, per-preset cited factors from SOURCES.md); effective readouts appear beside the C/W scrubs; the provenance table's sustained/achieved cells turn into live green factor scrubs on the loaded hardware's row; MFU wall-clock estimates pinned to spec peak (Cspec) so nothing double-counts.
- ✓ stage ④ terminology — see the BIG ONE entry above.

## Sweep #4 — post-hardware-epic editor pass (commits 3f57a5a, d79d3ce, + this)
- ✓ "spec/measured toggle moves" — took your first option: the → effective readouts are gone from the bar (C/W hovers show spec × factor = effective instead); mode/preset picks also no longer light the reset button. Verified pixel-stable across the toggle.
- ✓ "reset should be for scrubs" — reset now restores B, mesh degrees, MFU, and problem variables while keeping model, hardware, and spec/measured; dirty-orange tracks only the scrubs. (MDP/MTP are kept with hardware since GPU presets force them to 1 — flag if you'd rather they reset.)
- ✓ "update history when the URL changes" — settled changes push history entries; back/forward walk through earlier configurations; plain #anchor TOC hashes don't touch state.
- ✓ "E/k clause doesn't linebreak" — it was inside the ridge equation's nowrap span; moved out, no more horizontal scrollbar.
- ✓ "right margin wider" — the layouter was silently clamping notes to 160px against the paper's own margin; they now size to real viewport room, up to 19rem (304px at common widths).
- ✓ "hovering annotated text should highlight" — the sentence-side hover now lights the pair: the margin note AND the sentence itself (it previously lit only the note, and the sentence lit only from the ◦ side).
- ✓ "green highlight is lying in measured mode" — no, you hadn't seen the fix yet, and you were right: now the green C/W scrubs display and edit the EFFECTIVE value (drag/type maps back through the factor; hover shows "measured — spec × factor").
- ✓ "hide Z / TPU mesh text under GPU" — notation-table Z row, the multi-axes note, the three-axes sentence, and the 3-axis preset buttons all hide when gpu=1. (03-fsdp's chapter worked example with "all 3 axes" buttons left visible — it's a chapter calculation, not just mesh vocabulary; flag if you want it hidden too.) The "stick to X, Y, Z for TPU by default" musing → chat.
- ✓ "k as 8+1" — done for all MoE rows (+tooltip: routed top-k + always-on shared); sorts by routed count, same order as totals.
- ✓ "ALL tooltips persist on click" — data-tips are now pinnable everywhere except click-taken elements (preset buttons, sortable headers — sorting and pinning on the same click would fight). Green scrubs stay unpinned by design: their click starts the drag; their colored letter tokens pin instead.
- ✓ "sources: links + methodology" — every hardware-table cell's tooltip now ends with a clickable source ↗ link (pin the card, click the link); the table's ✦ note links SOURCES.md and states the synthesis rules (sparsity→dense halving, bidi→per-direction, NIC-per-GPU division, and what each ≈ estimate inherits from).

## Sweep #5 (commit 71ec0d1)
- ✓ "k in equations not tooltip'ified — refactor?" — yes, refactored: the shape tokenizer became a math tokenizer covering .eq/.eq-i too (598 new tokens incl. the bare E/k ridge fraction), and it upgrades hand-written plain <i class="v">k</i> tokens to colored hoverable ones (26 k's, 20 E's, N/M/P too; P got a meaning card). Deliberately left plain: the third-mesh-axis Z and pipeline's N_MB/N_stages/N_layers (different meanings than the tokens would claim).
- ✓ "MXU and ICI all over the doc on NVIDIA" — the variable names now follow the hardware: W_ici→W_gpu and W_dcn→W_ib subscripts swap page-wide (Δ quotes exempt), the notation table's "ici/dcn" unit labels swap, and widget chrome (timeline track labels + legend, roofline title + readout) says tensor core / NVLink under GPU. Remaining deliberate ICI/TPU mentions: the pipelining section's "GPUs … not densely connected by ICI in the way TPUs are" comparison and 07-pods' TPU-vs-GPU contrast.
- ✓ flair: "tween the two-clocks widget" — bars and the time axis animate (log-space exponential); while dragging the axis only ratchets up (steady scale = the affordance you named), and ~450 ms after quiescing it relaxes so the bars use the space.
- ✓ "'Everything on this page is live' note unnecessary; put the DP slider at the top of the section" — note deleted; a compact dials line right under the Data Parallelism heading now carries the DP and B scrubs (+ per-copy tokens readout).

## Chat item — external bug report (commit f2ecdc2)
- ✓ Twitter report (@Ali_NT99): "Per-chip HBM under FSDP shows wrong numbers" — confirmed and root-caused: the memory meters priced weights at the 2-matmul comms proxy P = 2·D·E·F·L (~½ of a real labeled checkpoint: gated MLPs have 3 matrices, plus attention). Meters now use P_w ≈ 3·D·E·F·L + 2.5·D²·L (within ~5% of published totals for the MoE presets; 70B now reads ~739 GB under pure DP, matching the chapter's true-params arithmetic). Comms physics deliberately keeps the chapter's 2-matmul P (bounds are ratios; chapter numbers reproduce). Both conventions disclosed in the intro's P note, the FSDP figcaption, and the meter tooltips.
