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

## Sweep #3 — separate axis variables + table consolidation (commits 434405e, cc559cf)
- ✓ CHAT ITEM "separate variables for each axis; consider dropping X/Y" — done for good: DP, TP, EP, PP (+ MDP/MTP) are now the actual state keys everywhere (expressions, URL hashes, tokens); the X/Y toggle, the `nota` key, and the article-settings dashboard are deleted. Old URLs still work (hash aliases X→DP, Y→TP, Z→PP, MX→MDP, MY→MTP). N stays = DP·TP (the chapter's mixed budget); EP/PP are scheme-scoped, not a 4D mesh. The letters that still mean themselves survive verbatim: the notation table's third-mesh-axis Z (live value now "—"), M_Z in the multi-axis note, the appendix's matrix X/Y.
- ✓ "not sure Mesh should be in the top bar" — removed from the top bar entirely (your second option): DP/TP/EP/PP remain one shared global state, but each is adjusted by the in-text scrubs where its section uses it. Flag if you'd rather have the adaptive-per-section display instead.
- ✓ "all the models together in the table / drop 275B giant" — preset-button row deleted; dense dropdown trio (LLaMA-3 70B, LLaMA-2 13B, Gemma 7B) now leads the model table with a "(chapter default)" tag; LLaMA-3 8B and the 275B giant are gone (they were exercise-agnostic leftovers from the first draft's preset row — nothing referenced them).
- ✓ "≈ on Kimi K3 should have a hover" — both ≈ cells (F and act. k·F) explain the latent-vs-routed width choice on hover.
- ✓ "equations' variables color-ified/tooltip-ified" — done at runtime for every .shape einsum (bare B/D/F/L/T/E/k letters and B_DP-style subscripts become the same colored hover tokens used elsewhere; 719 tokens on the page). The .eq equations were already tokenized.
- ✓ "selected model's row turns into the green scrubs" — the row whose shape matches the page state swaps its printed numbers for live D/F/L/E/k scrubs (and a computed act. k·F); loading DeepSeek-V3 moves the live row there, scrubbing any value moves it away (custom shape = no live row). Sorting uses the printed values.
