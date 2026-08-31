---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
plan: II
wave: I
goal: Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
worktree: false
branch: jira/2026-08-29-soroban-sdk-27-v2-contracts
issue: none
depends_on: []
parallel_with: [I]
files_modified:
  - apps/docs/concepts/attestations.mdx
  - apps/docs/concepts/authorities.mdx
  - apps/docs/concepts/delegates.mdx
  - apps/docs/concepts/how-it-works.mdx
  - apps/docs/concepts/resolvers.mdx
  - apps/docs/concepts/schemas.mdx
  - apps/docs/images/diagrams/
covers:
  - D-05
  - D-06
  - D-18
  - "RESEARCH: 7 box-drawing diagram blocks, not ~18"
  - "RESEARCH: Mermaid dark mode under Mintlify needs visual QA"
  - "GOAL: docs diagrams as native mermaid"
---

# Plan II: Docs diagrams to mermaid with visual QA

**Sprint goal:** Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
**Worktree:** false — sequential waves share `node_modules`, `target/` and `dist/` build caches on one checkout, and Plans VI/VII need the deployed registry state of that same checkout.
**This plan delivers:** the 7 ASCII box-drawing diagrams in `apps/docs/concepts/*.mdx` replaced by native mermaid fences, verified visually in light and dark with agent-browser, with a screenshot fallback only where mermaid renders badly. Runs in parallel with Plan I (disjoint files); it is the "wave 5 diagrams" half of D-06.

## Tasks

### I. Install agent-browser and confirm `mintlify dev` renders

- **Files:** none
- **Read first:** `apps/docs/package.json`, `apps/docs/docs.json` (lines 1-64), `research-external.md` "Mintlify — mermaid and value reuse"
- **Action:** Per D-05.
  1. `npm install -g agent-browser && agent-browser install` (installs the CLI and its browser). Confirm `agent-browser --help` lists `open`, `screenshot`, and a colour-scheme / media emulation option (note the exact flag name in EXECUTION.md; if none exists, dark mode is toggled via the Mintlify theme switch button in the page header, located with `agent-browser snapshot`).
  2. From the repo root: `pnpm install` (if `apps/docs/node_modules/.bin/mintlify` is missing) then `pnpm --filter @attestprotocol/docs dev` in the background; capture the port from its output (Mintlify defaults to 3000; the root script comment says 3001).
  3. `agent-browser open http://localhost:<port>/concepts/how-it-works` and `agent-browser screenshot` to `/tmp/claude-1000/-home-rain-workspace/250a175c-dd56-4c23-9dc6-99127235add5/scratchpad/baseline-how-it-works.png`. This is the pre-change baseline.
- **Done when:** `agent-browser --help` exits 0; a baseline screenshot file exists in the scratchpad; the mintlify dev URL and port are recorded in EXECUTION.md.
- **Covers:** D-05

### II. Convert the 7 box-drawing blocks to mermaid

- **Files:** `apps/docs/concepts/attestations.mdx`, `apps/docs/concepts/authorities.mdx`, `apps/docs/concepts/delegates.mdx`, `apps/docs/concepts/how-it-works.mdx`, `apps/docs/concepts/resolvers.mdx`, `apps/docs/concepts/schemas.mdx`
- **Read first:** each file end to end; `research-codebase.md` "Codebase — apps/docs" for exact line ranges; https://www.mintlify.com/docs/components/mermaid-diagrams
- **Action:** Per D-18 convert exactly these blocks (line numbers as of the research snapshot — re-locate by content, they are the only untagged ```` ``` ```` fences containing `┌`/`│`/`──▶` glyphs):
  | File | Block | Mermaid form |
  |---|---|---|
  | `how-it-works.mdx` L8-16 | Issuer → Protocol → Holder ← Verifier with role captions | `flowchart LR` with four nodes and labelled edges (`Creates schemas & attestations`, `Stores attestations on-chain`, `Queries & validates`) |
  | `attestations.mdx` L27-31 | lifecycle `Created ──▶ Active ──▶ Expired / Revoked` | `stateDiagram-v2` with `[*] --> Created --> Active`, `Active --> Expired`, `Active --> Revoked` |
  | `authorities.mdx` L24-44 | permissionless-by-default tree | `flowchart TD` reproducing the same nodes and branches |
  | `delegates.mdx` L10-29 | authority → BLS signature → delegate → contract | `sequenceDiagram` with participants Authority, Delegate, Protocol Contract; messages in the same order as the ASCII |
  | `delegates.mdx` L191-195 | batch signing fan-out | `flowchart LR` one signer node fanning out to N attestation nodes |
  | `resolvers.mdx` L25-53 | two panels: without resolver / with resolver hook | two `sequenceDiagram` fences under the existing panel headings (or one fence with `rect` blocks) — keep both call orders exactly |
  | `schemas.mdx` L10-27 | schema → attestations references | `flowchart LR` with a Schema node and the attestation nodes that reference it |
  Rules: every label that appears in the ASCII appears in the mermaid; no new information; keep surrounding prose unchanged; fence is exactly ```` ```mermaid ````; do not touch fences with a language tag (`typescript`, `bash`, `json`, `rust`) even if they contain box glyphs in comments.
- **Done when:** `grep -rc '```mermaid' apps/docs/concepts/*.mdx` totals 7 (8 if resolvers is split into two fences, recorded in EXECUTION.md); `grep -rn '┌\|└\|──▶' apps/docs/concepts/*.mdx` returns only lines inside language-tagged code fences (verify by reading the hits); `mintlify dev` reloads all six pages with no MDX parse error in its console.
- **Covers:** D-05, D-18, RESEARCH 7 blocks

### III. Visual QA in light and dark, screenshot fallback only where needed

- **Files:** `apps/docs/images/diagrams/` (only if a fallback is needed), the affected `.mdx` (only if a fallback is applied)
- **Read first:** `apps/docs/chains/stellar/overview.mdx` lines 1-20 (light/dark `<img>` pair pattern), `research-external.md` "Mintlify — mermaid" (theming), RESEARCH.md "Mermaid dark mode under Mintlify"
- **Action:** Per D-05. For each of the six pages: `agent-browser open http://localhost:<port>/concepts/<page>`, screenshot in light; switch to dark (colour-scheme emulation flag from task I, or click the theme toggle) and screenshot again. Save both to the scratchpad as `<page>-light.png` / `<page>-dark.png` and inspect them with the Read tool. Acceptance per diagram: all node labels legible, edge labels readable, no text overflow, contrast acceptable in both schemes. If a diagram fails only in dark, first try a `%%{init: {'theme': 'neutral'}}%%` (or `'base'` with `themeVariables`) directive as the first line of that fence and re-check both schemes. Only if it still fails: export the light and dark renders as PNGs into `apps/docs/images/diagrams/<page>-<n>-light.png` and `-dark.png` and replace the fence with the `<img className="block dark:hidden" ...>` / `<img className="hidden dark:block" ...>` pair from `overview.mdx`. Record per-diagram verdicts (pass / init-directive / fallback) in EXECUTION.md.
- **Done when:** 12 screenshots exist in the scratchpad (6 pages × 2 schemes); EXECUTION.md has a verdict row per diagram; `ls apps/docs/images/diagrams/` is either absent (all passed) or contains only light/dark pairs referenced from an `.mdx`.
- **Covers:** D-05, RESEARCH dark-mode risk

## Nyquist criteria for this plan

- [ ] 7 (or 8) ```` ```mermaid ```` fences replace all 7 box-drawing blocks; no untagged box-glyph fences remain.
- [ ] Every touched page renders without MDX errors under `mintlify dev`.
- [ ] Light and dark screenshots reviewed for all six pages, verdicts recorded.

## Risks accepted in this plan

- Mermaid theming behaviour under Mintlify's colour-scheme switch is undocumented; the screenshot fallback is the accepted mitigation (D-05).
- Stale prose such as `how-it-works.mdx:45-47` ("Authority Contract") is not edited here — mention in EXECUTION.md, do not touch.
- Contract IDs on docs pages are Plan VIII (they depend on the mainnet v2 ID).
