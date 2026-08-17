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
