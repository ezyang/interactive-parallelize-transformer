# EDITS-LOG — sweep outcomes (single writer: Fable)

One line per processed inbox item: ✓ done (commit) · ✗ skipped (why) · ? question.
Items already quoted here won't be re-processed on later sweeps.

---


## Sweep — axis-rename session
- ? "model table too wide / footnote flush with border" — QUEUED: sections/01-intro.html is owned by the running notation agent; fixing immediately after it lands.
- ✓ "recursive tooltip: pin blue, hover green shows nothing" — diagnosed as occlusion (the 400px pinned card covers neighbors at some window widths; mechanism itself verified working). Fix: pinned cards are now DRAGGABLE by their label row (manual offset preserved while the card tracks its anchor). core.js + css.
- ✓ "top-bar variable tooltips don't pin on click" — the colored letter tokens (D, F, E, k, C, W, …) are now click-to-pin everywhere, with live-refreshing value lines; green scrub numbers can't pin by design (click starts a scrub) — their letters carry the pinnable card instead.
- ? "BIG ONE: hardware-neutral/switched terminology + global hardware slider" — design response in chat (interacts with the measured-numbers epic; needs one scoping exchange).
- ? "are the AllGather/ReduceScatter pills pulling their weight" — taste call, options offered in chat.

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
