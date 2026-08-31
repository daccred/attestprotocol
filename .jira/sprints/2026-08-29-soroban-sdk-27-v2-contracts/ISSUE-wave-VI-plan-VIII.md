---
shape: wave
domain: frontend
wave: VI
plan: VIII
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-02, D-05, D-18]
title: "Render contract addresses on the documentation pages from a single snippet"
status: draft
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 6 of 6.

**Domain**: frontend
**Depends on**: the diagram conversion on the concept pages (not yet filed), and #118 (mainnet v2 deployment)
**Blocks**: nothing; this is the last step.

## Goal

Have the four documentation pages that show contract addresses render them from one shared snippet listing both networks and both versions, instead of each page carrying its own hardcoded table.

## Background

Four pages on the documentation site repeat the same contract addresses in hand-written tables. With a second generation of contracts deployed, each page would have to grow a version column and be edited in step with every future deployment — which is exactly how they went stale before.

Mintlify supports reusable snippets that export values and components, so the addresses can live in one file that every page imports. The snippet is a copy of the registry rather than an import of it: the docs build cannot read files outside its own directory, so a comment in the snippet and a line in the repository README tie the two together.

Decisions already made that this step must respect:

- One snippet file exports the addresses for both networks and both versions, plus which one is current, and a component that renders the table.
- Addresses in the snippet are copied verbatim from the registry file that the deployment steps write.
- Every touched page is checked visually in both colour schemes against a locally running docs site.

Intentionally out of scope for this step:

- The diagram conversions on the concept pages, done in the first step of this effort; this step only touches one of those files, for its address table.

## Changes

- `apps/docs/snippets/contracts.mdx` (new) — exports `testnetV1`, `testnetV2`, `mainnetV1`, `mainnetV2`, `testnetCurrent` and `mainnetCurrent`, plus a `ContractAddresses` component rendering a four-row table of network, version and address. Opens with a comment naming the registry file as the source of truth and stating that the two are updated together.
- [`apps/docs/introduction.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/introduction.mdx) (lines 74-86), [`apps/docs/stellar/reference.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/stellar/reference.mdx) (lines 8-20) and [`apps/docs/stellar/getting-started.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/stellar/getting-started.mdx) (lines 143-155) — import the component and replace the hardcoded tables with it, followed by one sentence pointing at the programmatic routes: the SDK's address accessor, or the indexer's registry endpoint.
- [`apps/docs/concepts/authorities.mdx`](https://github.com/daccred/attestprotocol/blob/canary/apps/docs/concepts/authorities.mdx) (line 64) — the sample code uses the current testnet address from the snippet instead of a literal. If snippet values do not interpolate inside a code fence when checked, the sample instead omits the address and relies on the network alone, which now resolves the current contract; say in the pull request which of the two applies.

## Environment

- Docs site: Mintlify, served locally with `pnpm --filter @attestprotocol/docs dev`.
- Snippets and code-fence interpolation follow [Mintlify's reusable snippets documentation](https://www.mintlify.com/docs/create/reusable-snippets).

## Visual evidence

Visual evidence (light/dark, captured from the running docs site):

- [introduction](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/introduction-ids-light.png) / [dark](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/introduction-ids-dark.png)
- [stellar/reference](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/stellar-reference-ids-light.png) / [dark](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/stellar-reference-ids-dark.png)
- [stellar/getting-started](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/stellar-getting-started-ids-light.png) / [dark](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/stellar-getting-started-ids-dark.png)
- [concepts/authorities](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/concepts-authorities-ids-light.png) / [dark](https://github.com/daccred/attestprotocol/blob/eab4c8e247438bab4bdbbb5dd8daf28d285b5208/.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/screenshots/concepts-authorities-ids-dark.png)

## Verification

- [ ] `grep -rn 'CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP\|CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI' apps/docs --include=*.mdx` returns only `apps/docs/snippets/contracts.mdx`.
- [ ] The addresses in the snippet match the registry exactly: `diff <(jq -r '.testnet.v2.id, .mainnet.v2.id' contracts/stellar/bindings/src/contracts.json) <(grep -oP 'V2 = "\K[^"]+' apps/docs/snippets/contracts.mdx)` produces no output.
- [ ] `grep -c '<ContractAddresses />' apps/docs/introduction.mdx apps/docs/stellar/reference.mdx apps/docs/stellar/getting-started.mdx` returns 1 for each.
- [ ] All four pages reload under the local docs server with no MDX parse error.
- [ ] On each of the four pages, in both light and dark: the table shows four rows with the full 56-character addresses in a monospace font, with no wrapping that hides characters. Screenshots of every page in both schemes are attached to this issue.
- [ ] The authorities page's code sample shows a real address, not the literal template expression, and the diagram converted earlier on that page still renders correctly.

## Rollout

N/A — direct merge. Documentation only.

## Risks

- The snippet duplicates the registry rather than importing it, so the two can drift. The address-equality check above is what catches that, and it belongs in review of any future deployment.
- Interpolating snippet values inside a code fence is documented by Mintlify but unverified in this project; the fallback of dropping the address from the sample covers it.
status: pushed
url: https://github.com/daccred/attestprotocol/issues/121
pushed_at: 2026-08-31T18:52:06Z
