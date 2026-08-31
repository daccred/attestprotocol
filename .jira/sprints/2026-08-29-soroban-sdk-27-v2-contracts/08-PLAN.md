---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
plan: VIII
wave: VI
goal: Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
worktree: false
branch: jira/2026-08-29-soroban-sdk-27-v2-contracts
issue: none
depends_on: [II, VII]
parallel_with: []
files_modified:
  - apps/docs/snippets/contracts.mdx
  - apps/docs/introduction.mdx
  - apps/docs/stellar/reference.mdx
  - apps/docs/stellar/getting-started.mdx
  - apps/docs/concepts/authorities.mdx
covers:
  - D-02
  - D-05
  - D-18
  - "RESEARCH: hardcoded IDs in introduction.mdx, stellar/reference.mdx, stellar/getting-started.mdx, concepts/authorities.mdx"
  - "RESEARCH: Mintlify snippets with export const for value reuse"
  - "GOAL: docs render contract IDs from the registry"
---

# Plan VIII: Docs contract IDs from one snippet, visual QA

**Sprint goal:** Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
**Worktree:** false — sequential waves share `node_modules`, `target/` and `dist/` build caches on one checkout, and Plans VI/VII need the deployed registry state of that same checkout.
**This plan delivers:** the four docs pages that carry contract IDs reading them from a single snippet whose values are copied from `contracts.json` (v1 and v2 for both networks, with `current` marked), verified visually in both colour schemes. Waits for the mainnet v2 ID (Plan VII) and the diagram conversion (Plan II, same files).

## Tasks

### I. Create the contracts snippet and render the ID tables from it

- **Files:** `apps/docs/snippets/contracts.mdx` (new), `apps/docs/introduction.mdx`, `apps/docs/stellar/reference.mdx`, `apps/docs/stellar/getting-started.mdx`, `apps/docs/concepts/authorities.mdx`
- **Read first:** `contracts/stellar/bindings/src/contracts.json` (final, after Plan VII), `apps/docs/introduction.mdx` lines 74-86, `apps/docs/stellar/reference.mdx` lines 8-20, `apps/docs/stellar/getting-started.mdx` lines 143-155, `apps/docs/concepts/authorities.mdx` lines 56-70, https://www.mintlify.com/docs/create/reusable-snippets, `research-external.md` "Mintlify — mermaid and value reuse"
- **Action:** Per D-18/D-02.
  1. Create `apps/docs/snippets/contracts.mdx` exporting constants copied verbatim from `contracts.json` — `testnetV1`, `testnetV2`, `mainnetV1`, `mainnetV2`, `testnetCurrent` (= the ID of `testnet.current`), `mainnetCurrent`, plus a `ContractAddresses` component rendering the table:
     ```mdx
     export const testnetV1 = "CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP"
     export const testnetV2 = "<testnet v2 id>"
     export const mainnetV1 = "CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI"
     export const mainnetV2 = "<mainnet v2 id>"
     export const testnetCurrent = testnetV2
     export const mainnetCurrent = mainnetV2

     export const ContractAddresses = () => (
       <table>
         <thead><tr><th>Network</th><th>Version</th><th>Protocol Contract</th></tr></thead>
         <tbody>
           <tr><td>Testnet</td><td>v2 (current)</td><td><code>{testnetV2}</code></td></tr>
           <tr><td>Testnet</td><td>v1 (legacy)</td><td><code>{testnetV1}</code></td></tr>
           <tr><td>Mainnet</td><td>v2 (current)</td><td><code>{mainnetV2}</code></td></tr>
           <tr><td>Mainnet</td><td>v1 (legacy)</td><td><code>{mainnetV1}</code></td></tr>
         </tbody>
       </table>
     )
     ```
     Add a leading comment line `{/* Source of truth: contracts/stellar/bindings/src/contracts.json — update both together. */}`.
  2. In `introduction.mdx`, `stellar/reference.mdx`, `stellar/getting-started.mdx`: add `import { ContractAddresses } from "/snippets/contracts.mdx"` after the frontmatter and replace the hardcoded markdown table under "Contract Addresses" with `<ContractAddresses />`. Add one sentence under the table: "Programmatic access: `getContractId(network, version?)` from `@attestprotocol/stellar-sdk`, or `GET /api/contracts` on horizon."
  3. `concepts/authorities.mdx:64`: import `{ testnetCurrent }` and change the sample to `contractId: '{testnetCurrent}'` inside the fence (snippet variables interpolate inside code fences per the Mintlify docs); if interpolation does not render in the fence during QA, change the sample to omit `contractId` and rely on `network: 'testnet'` (which now resolves the current ID), and record which path was taken.
  4. `grep -rn "CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP\|CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI" apps/docs --include=*.mdx` must return only `snippets/contracts.mdx`.
- **Done when:** the grep in step 4 lists only `apps/docs/snippets/contracts.mdx`; `grep -c "<ContractAddresses />" apps/docs/introduction.mdx apps/docs/stellar/reference.mdx apps/docs/stellar/getting-started.mdx` = 1 each; `grep -n 'import .* from "/snippets/contracts.mdx"' apps/docs/concepts/authorities.mdx` matches; `mintlify dev` reloads the four pages with no MDX error.
- **Covers:** D-02, D-18, RESEARCH hardcoded docs IDs

### II. Visual QA of the four pages in light and dark

- **Files:** none (fixes to the four pages only if QA finds a rendering problem)
- **Read first:** Plan II EXECUTION.md notes (agent-browser invocation, mintlify port), `apps/docs/snippets/contracts.mdx`
- **Action:** Per D-05. Start `pnpm --filter @attestprotocol/docs dev` if not running. For each of `/introduction`, `/stellar/reference`, `/stellar/getting-started`, `/concepts/authorities`: `agent-browser open`, screenshot in light and dark to the scratchpad as `<page>-ids-light.png` / `-dark.png`, inspect with the Read tool. Acceptance: the table shows four rows with full 56-character IDs in monospace, no wrapping that hides characters, the `authorities` code sample shows a real ID (not the literal `{testnetCurrent}`), and the mermaid diagram from Plan II on `authorities.mdx` still renders. Fix any failure in the affected `.mdx` and re-screenshot. Record verdicts in EXECUTION.md.
- **Done when:** 8 screenshots exist in the scratchpad; EXECUTION.md has a pass verdict per page and scheme; no `{testnetCurrent}` literal is visible in the authorities screenshots.
- **Covers:** D-05

## Nyquist criteria for this plan

- [ ] No hardcoded protocol contract ID in any `.mdx` outside `snippets/contracts.mdx`.
- [ ] Snippet values equal `contracts.json` (`diff <(jq -r '.testnet.v2.id, .mainnet.v2.id' contracts/stellar/bindings/src/contracts.json) <(grep -oP 'V2 = "\K[^"]+' apps/docs/snippets/contracts.mdx)` is empty).
- [ ] Four pages pass visual QA in both schemes.

## Risks accepted in this plan

- The snippet is a copy of `contracts.json`, not a build-time import (Mintlify cannot read files outside `apps/docs`); the comment in the snippet and the README sentence in Plan VII tie the two together.
- Code-fence interpolation of snippet variables is documented by Mintlify but unverified here; the fallback in task I step 3 covers it.
