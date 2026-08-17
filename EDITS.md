# EDITS — editorial inbox (single writer: the human editor)

Fable never writes to this file. Append items below; delete old ones whenever
(or never — Fable dedupes against EDITS-LOG.md). Conventions that speed things up:
- Quote the exact current text when pointing at prose:
  `replace: "old text" with: "new text"`
- Anchor by section file or id when it's ambiguous: `04-tp: ...`
- Mark judgment calls with `(discuss)` and Fable will raise them in chat
  instead of guessing.

---

- When i toggle spec/measured in topbar it moves, it shouldn't; I suggest we
  don't show the arrow (theoretical -> measured), or always show it

- The reset button is still clearing everything, rather than preserving the
  model,hardware,spec/measured choice.  That button should be for scrubs;
  the dropdown stuff is easy to change as needed

- I feel maybe we should update history when the URL changes?

- This text " — the E/k factor because a MoE moves all E experts' weights
  while its FLOPs only touch k" doesn't linebreak for some reason and it's causing
  a horizontal scrollbar

- nit: I feel we can make the right margin a little wider, give more space for
  text

- nit: When I highlight over text with marginalia it should highlight, right
  now it only highlights when I hover ◦

- The spec -> measured numbers seem oddly setup. It claims the measured number
  is just C. Which is ... true but the green highlight is lying; I want to be
  scrubbing the actual value.  Maybe you fixed it?

- Let's hide the Z variable when you're doing GPU, the TPU mesh text should
  get disappeared when we're doing GPUs.  It might be better to stick to X, Y, Z
  for TPU by default, I'm not sure.

- nit: For the k entries on the table, maybe we should say 8+1 instead of 9 to
  make the regular/shared split clearer?  It should still sort in the normal way.

- nit: the tooltips in the hardware table don't persist if clicked. ALL
  tooltips should persist if you click. (A refactor in order?)

- The sources in the hardware table don't seem sufficient.  I'm expecting
  links. I'm expecting methodology when we're doing novel synthesis of research.
