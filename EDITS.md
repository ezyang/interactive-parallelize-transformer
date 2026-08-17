# EDITS — editorial inbox (single writer: the human editor)

Fable never writes to this file. Append items below; delete old ones whenever
(or never — Fable dedupes against EDITS-LOG.md). Conventions that speed things up:
- Quote the exact current text when pointing at prose:
  `replace: "old text" with: "new text"`
- Anchor by section file or id when it's ambiguous: `04-tp: ...`
- Mark judgment calls with `(discuss)` and Fable will raise them in chat
  instead of guessing.

---

- The "The chapter's examples are dense LLaMA-era models; the frontier has
  since gone Mixture-of-Experts." table is still too wide and overflowing on my browser.
  Also the footnote "Click a model to load" has too little margin and is flush with
  the border

- The recursive tooltip setup is still not working: when I mouse over the blue
  number, click, and then mouse over the green number, it doesn't work, I don't see
  anything.

- The tooltips for variables up on the top heading bar don't pin when they are clicked.

- BIG ONE: I kind of want the TPU/GPU terminology in the article to be neutral
  (or swap between the two depending on which hardware you selected up top,
  and if I have two sections that vary between TPU versus GPU I want a slider
  that lets you switch between them (this should be a global slider that
  switches between the hardware generation for the entire article; the point
  is the article is best when it consistently does all the same hardware)

- I'm not really sure the colorful AllGather/ReduceScatter rounded boxes are
  pulling their weight.

- "In this section, we'll discuss four common parallelism schemes: (pure) data
  parallelism, fully-sharded data parallelism (FSDP / ZeRO sharding), tensor
  parallelism (also known as model parallelism), and (briefly) pipeline
  parallelism"  -- this text should be updated for having in folded in Expert Parallelism
  into the doc.  I'm thinking of a new way of marking "added" content without
  forcing an Adaptation marginalia. I'm thinking it should be OK to just have
  the new content have a dotted line under it, and it's understood that it is
  new. To make the new text flow we will need to also edit it, and here I
  think if there are changes to text which would be permissible in
  journalistic quotation practices with ... or bracketing, I think I would
  propose we simply not disclose it (as long as there is a disclosure on the
  nearby text that necessitated the re-editing.)  The big thing is that I
  don't want large portions of the doc to turn into Claude-slop, but when we
  incorporate in new text this is OK.

- In "We'll use the following notation to simplify calculations throughout
  this section" we should state what model we're getting it from (replicating
  the model drop down slider from the topbar)

- Let's make the vertical placement of margin notes more flexible: we should
  be OK to place it so the top of the margin isn't forced to be aligned with
  the citation point: we can have the cite point line up with the middle of
  the margin note. This prevents us from overflowing further downstream margin
  notes.

- IMO, we can delete this sentence entirely: "We also do not discuss expert
  parallelism here for MoEs — which expands the design space substantially,
  only the base case of a dense Transformer." and I would suggest this
  Ed note: (Ed: This edition is expanded to discuss expert parallelism, unlike the original.)
