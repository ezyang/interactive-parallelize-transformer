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

- Let's make margin notes like ◦ also extend over the relevant sentence so
  mousing over the sentence highlights the margin note.

- I don't think we need this adapation note anymore: "The notation is alive:
  the green values below are the page's one shared model — drag them and
  everything recomputes. Hover any colored letter for its meaning." -- we
  already did explained this at the beginning. Once disclosed we don't need to
  redisclose.

- I think this one's unnecessary too: "This column is the
  adaptation's; the chapter's tables have only the first two."

- I feel we have to be more careful writing this footnote: "adaptation F
  convention (everywhere): the width of one expert (= dff when dense). Math
  runs through k·F; weights hold E·F; the chapter's equations are the E = k =
  1 case. (Chapter 12's resolution — hover any F for the live widths.)"  There's
  a few problems. First, it's pretty common to have both an F for dense and
  an F for sparse, and this matters when the model in question has both dense and
  sparse transformer blocks.

- "The shapes below come from each model's published config.json on Hugging
  Face (parameter totals from its safetensors metadata; retrieved August 2026)"
  This is good for a margin note, doesn't have to be inline.  In general
  sources are good as margin notes.

- "E and k count shared experts (DeepSeek-V3: 256+1 routed/shared → E 257, k
  9), so k·F is exact. Column headers explain each field; Kimi K3's latent MoE
  makes its F the roughest (3,072 latent vs 3,584 routed width — we use
  latent)."  This shouldn't be an adapation note; we're already in an adaptation
  section, it's known this is an adapation. It should arguably be a margin note
  against the DeepSeek entry specifically, since it's one model.

- Z needs to rename to PP like we did DP/TP for X/Y

- Instead of "Model shapes to try" and then a separate table, we should just
  have all the models together in the table.  It's all adaptation anyway. Not
  sure the 275B giant is doing much... was that one of the exercises or
  something?  Actually the other two don't even show in the drop down.  I'm
  not really sure it's that helpful?

- For the ≈ approx on the Kimi K3 table entry we should have a hover that
  explains why, IMO.

- I'm not sure Mesh should be in the top bar.  The problem is we don't always
  use all the mesh elements when we're doing examples in a section.  One way
  is for it to be adaptive based on the section you're in, so we only show the
  ones that are actually active for that section.  But another is to just let
  the text specify it where relevant and don't have it in the "global" state.

- I feel the variables in the equations should all be
  color-ified/tooltip-ified like "In[BDP, D] ·D Win[D, F] ·F Wout[F, D] → Out[BDP, D]"

- For the model that's selected, its row should turn into the green variables
  we can scrub.

- nit: Reset resets the model selector and hardware, but actually those should
  stick (and it's the numbers only it should reset)
