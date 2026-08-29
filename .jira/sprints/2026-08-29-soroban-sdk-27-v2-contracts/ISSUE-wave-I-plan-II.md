---
shape: wave
domain: frontend
wave: I
plan: II
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-05, D-18]
title: "Replace the ASCII diagrams in the concept docs with mermaid"
status: draft
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 1 of 6.

**Domain**: frontend
**Depends on**: nothing; can start now. Runs alongside the soroban-sdk 27 compile step (they touch different files).
**Blocks**: the step that renders contract addresses on the documentation pages, which edits one of the same files.

## Goal

Replace the seven box-drawing ASCII diagrams in [`apps/docs/concepts`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts) with native `mermaid` code fences that render legibly in both the light and dark colour schemes.

## Background

The documentation site is built with [Mintlify](https://www.mintlify.com/docs) and lives in [`apps/docs`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs). Seven diagrams across the concept pages are drawn with box-drawing characters inside untagged code fences: they do not reflow, they are unreadable on narrow screens, and they cannot be edited without redrawing the ASCII. Mintlify renders `mermaid` fences natively, so the fix needs no new dependency.

Decisions already made that this step must respect:

- Diagrams become native `mermaid` fences, not images. A rendered image is a fallback used only where mermaid renders a specific diagram badly, and then as a light/dark `<img>` pair following the existing pattern in [`apps/docs/chains/stellar/overview.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/chains/stellar/overview.mdx) (lines 6-16).
- Every touched page is checked visually in both colour schemes against a locally running docs site.
- Exactly seven blocks are in scope. Code fences that carry a language tag are not diagrams and are not touched, even where their contents include box-drawing characters in comments.

Intentionally out of scope for this step:

- Contract addresses on documentation pages — handled by a later step that needs an address that does not exist yet.
- Stale prose near [`concepts/how-it-works.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/how-it-works.mdx) lines 45-47 referring to an "Authority Contract" that is no longer part of the protocol. Worth noting, not worth editing here.

## Changes

Line numbers are from a survey of the current default branch; the blocks are the only untagged fences containing `┌`, `│` or `──▶`, so re-locate them by content.

- [`apps/docs/concepts/how-it-works.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/how-it-works.mdx) lines 8-16 — issuer → protocol → holder ← verifier with role captions, becoming a `flowchart LR` with four nodes and the same edge labels.
- [`apps/docs/concepts/attestations.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/attestations.mdx) lines 27-31 — the Created → Active → Expired/Revoked lifecycle, becoming a `stateDiagram-v2`.
- [`apps/docs/concepts/authorities.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/authorities.mdx) lines 24-44 — the "permissionless by default" decision tree, becoming a `flowchart TD` with the same nodes and branches.
- [`apps/docs/concepts/delegates.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/delegates.mdx) lines 10-29 — authority → BLS signature → delegate → contract, becoming a `sequenceDiagram` with the messages in the same order; and lines 191-195, the batch-signing fan-out, becoming a `flowchart LR`.
- [`apps/docs/concepts/resolvers.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/resolvers.mdx) lines 25-53 — two panels, one without and one with a resolver hook, becoming two `sequenceDiagram` fences under the existing headings with both call orders preserved.
- [`apps/docs/concepts/schemas.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/schemas.mdx) lines 10-27 — a schema and the attestations referencing it, becoming a `flowchart LR`.
- `apps/docs/images/diagrams/` — created only if a diagram needs the image fallback.

Every label present in the ASCII appears in the mermaid, no new information is added, and the surrounding prose is unchanged.

## Environment

- Docs site: Mintlify, served locally with `pnpm --filter @attestprotocol/docs dev` (the root script comment says port 3001; Mintlify's own default is 3000).
- Mermaid is rendered by Mintlify itself — no library is added to the site.
- Browser automation for the visual pass: `agent-browser`, which is not installed on the development machine; installing it is part of this work.

## Visual evidence

[TODO: attach screenshots of each converted page in light and dark — twelve images, six pages × two schemes. None exist yet; the conversion has not been run.]

## Verification

- [ ] `grep -rc '```mermaid' apps/docs/concepts/*.mdx` totals 7 across the files (8 if the resolvers page is split into two fences; say which in the pull request).
- [ ] `grep -rn '┌\|└\|──▶' apps/docs/concepts/*.mdx` returns only lines inside language-tagged code fences.
- [ ] Each of the six touched pages reloads under the local docs server with no MDX parse error in its console.
- [ ] For every converted diagram, in both light and dark: all node labels are legible, edge labels are readable, no label overflows its node, and text/background contrast is readable. Screenshots of every page in both schemes are attached to this issue, with a per-diagram verdict of "renders correctly", "needed a theme directive", or "needed the image fallback".
- [ ] Where a diagram renders badly only in dark, a mermaid theme init directive was tried first; the image fallback appears only where the directive did not fix it.
- [ ] `apps/docs/images/diagrams/` is either absent or contains nothing but light/dark image pairs that are referenced from a page.

## Rollout

N/A — direct merge. Documentation only, no flag and no migration.

## Risks

- Mermaid's behaviour under Mintlify's light/dark switch is not documented, so a diagram can be legible in one scheme and unreadable in the other. The two-scheme screenshot check is what catches it, and the image fallback is the escape hatch.
- Converting a diagram is an opportunity to accidentally add or drop information. The rule that every ASCII label must appear in the mermaid, checked against the before/after screenshots, is what catches that.
