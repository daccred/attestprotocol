---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
verified_at: 2026-08-31T18:52:00Z
verdict: PASS
---

# Verification: 2026-08-29-soroban-sdk-27-v2-contracts

Goal-backward audit of the executed sprint. Asks: "does the codebase, as it stands now, deliver what the goal promised?" — distinct from `jira-nyquist` (which asks "do tests cover the criteria?") and `jira-reviewer` (which audits the diff).

## Goal

Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from `contracts.json`.

## Goal decomposition

- [x] O1 — The Rust workspace builds and tests on soroban-sdk 27, versioned as the v2 generation
- [x] O2 — A per-network versioned registry exists with v1 and v2 entries and `current` = v2 on both networks
- [x] O3 — v2 is live on testnet and mainnet, and both run the same wasm as this branch
- [x] O4 — Every consumer resolves addresses from the registry rather than a hardcoded literal
- [x] O5 — No hardcoded contract ID survives outside the registry, its generated artifacts, and the docs snippet
- [x] O6 — Horizon indexes every registered contract and exposes the registry over HTTP
- [x] O7 — The promised human-facing deliverables exist (Railway runbook, handed-back release commands, issue trail)

## Findings

### O1 — soroban-sdk 27, v2 generation

- **Status:** delivered
- **Evidence:** `contracts/stellar/Cargo.toml:13` pins `soroban-sdk = { version = "27.0.6" }`; `contracts/stellar/Cargo.toml:10` sets `[workspace.package] version = "2.0.0"` (D-20). `.github/workflows/soroban-release.yml:25` uses `soroban-build-workflow/.github/workflows/release.yml@v27.0.0` and carries no `release-authority` job (D-16). Nyquist re-ran `cargo test --workspace` (79 passed) and `cargo clippy --workspace -- -D warnings` (exit 0) on this branch.

### O2 — versioned registry with v1+v2 and `current` = v2

- **Status:** delivered
- **Evidence:** `contracts/stellar/bindings/src/contracts.json` holds `testnet.v1` / `testnet.v2` / `testnet.current = "v2"` and `mainnet.v1` / `mainnet.v2` / `mainnet.current = "v2"`. Both v1 entries carry their original `id`, `sdk: 22.0.8` and `deployedAt`, i.e. they were not disturbed (D-01). Both v2 entries carry `sdk: 27.0.6`, `deployedLedger` (4404453 testnet, 64212659 mainnet), `txHash` and `wasmHash` — the full D-09 shape. Typed accessor at `contracts/stellar/bindings/src/registry.ts:22-41` (`getContractEntry`, `getContractId`, `listContracts`, `contracts`), published as `@attestprotocol/stellar-contracts/registry` (`contracts/stellar/package.json` `exports["./registry"]`).

### O3 — v2 live on both networks, same wasm

- **Status:** delivered
- **Evidence:** read-only on-chain checks run during this verification.
  - `stellar contract info interface --network testnet --id CA2QET2K…AUCD` returns the v2 protocol interface (`attest`, `revoke`, `register`, …) — the contract exists on testnet.
  - `stellar contract info build --network mainnet --id CAMZUXDE…SF2N` reports `Wasm Hash: 2b699bf3a0f8c2363bb0b296be8afcaffc424986dafe33a082a058c3fe0950a8`.
  - `stellar contract fetch` for both networks followed by `sha256sum`: both `/tmp/testnet-v2.wasm` and `/tmp/mainnet-v2.wasm` hash to `2b699bf3a0f8c2363bb0b296be8afcaffc424986dafe33a082a058c3fe0950a8` — identical code on both networks and identical to the `wasmHash` recorded in the registry.
  - Horizon API `GET /transactions/36d0d511…5688` returns `successful: true`, `ledger: 64212659`, `source_account: GCUP5ZBY…CNZI`, `created_at: 2026-08-31T18:25:02Z` — matching the `mainnet.v2` `txHash`, `deployedLedger` and admin recorded in EXECUTION.md.

### O4 — every consumer resolves from the registry

- **Status:** delivered
- **Evidence:** each of the six consumers named in the goal, checked in the live tree.
  - **stellar-sdk client:** `packages/stellar-sdk/src/client.ts:15` imports `getContractId` from `@attestprotocol/stellar-contracts/registry`; `client.ts:105` resolves `contractId = getContractId(network, options.contractVersion)` only after an explicit `contractId` is absent (D-10 resolution order). `packages/stellar-sdk/src/types.ts:55` adds `contractVersion?: 'v1' | 'v2'`. `packages/stellar-sdk/src/index.ts:91-100` re-exports the registry surface.
  - **horizon constants:** `apps/horizon/src/common/constants.ts:2` imports `getContractId, listContracts`; `:45-46` `CONTRACT_IDS_TO_INDEX` falls back to `listContracts(STELLAR_NETWORK).map(c => c.id)` when `INDEX_CONTRACT_IDS` is unset (D-11 index-all default); `:54-55` `PROTOCOL_CONTRACT_ID` defaults to `getContractId(STELLAR_NETWORK)`; `:57-59` guards that the attribution target is among the indexed set. `grep -rn AUTHORITY_CONTRACT_ID apps/horizon/src` returns nothing — the variable is gone from runtime code (D-11).
  - **contracts integration tests:** `contracts/stellar/__test__/testutils.ts:3` imports `getContractId, type ContractVersion` from `../bindings/src/registry`; `:60` resolves the protocol contract through it.
  - **bindings networks:** `contracts/stellar/bindings/src/protocol.ts:35,37` carry the testnet and mainnet **v2** addresses. Re-running `node contracts/stellar/scripts/sync-networks.mjs` reports "networks block already matches the registry" — generated, not hand-edited (D-10).
  - **deployments.json alias:** `contracts/stellar/deployments.json` holds each network's `current` entry (both v2). `deploy.sh:36,390` invokes `scripts/sync-deployments.sh` after every registry write; re-running it here left the working tree clean, so the alias is a faithful generated projection (D-09).
  - **docs snippet:** `apps/docs/snippets/contracts.mdx` exports all six D-18 constants; imported at `apps/docs/introduction.mdx:6`, `apps/docs/stellar/reference.mdx:6`, `apps/docs/stellar/getting-started.mdx:6` and `apps/docs/concepts/authorities.mdx:6`. **Noted as designed, not as a defect:** this snippet is a checked *copy* of `contracts.json`, not an import — Mintlify cannot import JSON from outside `apps/docs`. Drift is caught rather than prevented: `contracts/stellar/__test__/docs-contract-ids.test.ts` asserts every constant and both `current` pointers against `contracts.json`; re-run here, 6 tests passed.

### O5 — no hardcoded ID outside registry + snippet

- **Status:** delivered
- **Evidence:** `grep -rn 'CBUUI7WK|CBFE5YSU|CA2QET2K|CAMZUXDE'` across `*.ts,*.tsx,*.rs,*.json,*.mdx,*.md,*.sh,*.toml,*.example`, excluding `.jira/`, `node_modules`, `dist/`, `target/`. Every hit falls into one of four legitimate classes:
  - the registry itself (`contracts/stellar/bindings/src/contracts.json`);
  - generated artifacts (`contracts/stellar/bindings/src/protocol.ts`, `protocol.md`, `contracts/stellar/deployments.json`) — both regenerators verified idempotent above;
  - the single docs snippet (`apps/docs/snippets/contracts.mdx`), plus operator-facing prose that is meant to show literal values: `README.md`, `apps/horizon/README.md`, `apps/horizon/scripts/mainnet/README.md`, `apps/horizon/.env.example`;
  - test fixtures asserting *against* the registry: `packages/stellar-sdk/__tests__/uid-parity.test.ts:13`, `delegation-parity.test.ts:15`, `contracts/stellar/__test__/contract-status.test.ts:64`, `apps/horizon/__tests__/constants.unit.test.ts:107`.

  No `.mdx` outside `snippets/contracts.mdx` carries an address. No runtime module reads a literal.

### O6 — horizon indexes every registered contract and serves the registry

- **Status:** delivered
- **Evidence:** `apps/horizon/src/app.ts:13,36` mounts `contractsRouter` at `/api/contracts` (`apps/horizon/src/router/contracts.router.ts`). `resolveContractFilter` lives at `apps/horizon/src/common/registry.ts:31` and is applied at `registry.router.ts:175,368` (attestations, schemas) and `data.router.ts:75,229` (events, operations) — the four D-12 endpoints. Ran `pnpm vitest run __tests__/constants.unit.test.ts __tests__/contracts.unit.test.ts` in `apps/horizon`: **15 passed**, with the request log showing `GET /api/contracts/v1 → 200`, `GET /api/contracts/v9 → 404`, `?version=v1 → 200`, `?version=v9 → 400`, `?contract=… → 200`. Exactly the D-13 contract.

### O7 — human-facing deliverables

- **Status:** delivered
- **Evidence:**
  - **Railway runbook:** `apps/horizon/README.md:231-232` is a per-service table giving `INDEX_CONTRACT_IDS` (the `v1,v2` comma list per network) and `PROTOCOL_CONTRACT_ID` (v2) with final values for testnet and mainnet; `:234` states `AUTHORITY_CONTRACT_ID` is no longer read and must be deleted; `:244-249` gives the backfill `curl`s for both services; `:257` gives `curl …/api/contracts | jq .data.current   # -> "v2"` as the confirmation. Nothing was applied in Railway (D-04).
  - **Handed-back release commands:** recorded in EXECUTION.md under Plan VII task III — `pnpm release` and `pnpm release:stellar 2.0.0`, explicitly not run by the executor. `pnpm changeset version` was completed on-branch: both `packages/stellar-sdk/package.json` and `contracts/stellar/package.json` read `3.0.0`, a coupled major (D-17). `.changeset/config.json` has `baseBranch: "canary"` and `packages: ["packages/*", "contracts/stellar"]`.
  - **Issue trail:** `#113`–`#118` are recorded in the `issue:` frontmatter of `ISSUE-wave-I-plan-I.md` (113), `wave-II-plan-III.md` (114), `wave-II-plan-IV.md` (115), `wave-III-plan-V.md` (116), `wave-IV-plan-VI.md` (117), `wave-V-plan-VII.md` (118), with a consistent depends-on chain.

## Source coverage

| Decision | Plan | Implemented | Evidence |
|----------|------|-------------|----------|
| D-01 | 06,07 | yes | `contracts.json` v1 entries byte-intact on both networks; v2 deployed alongside |
| D-02 | 04,08 | yes | registry consumed by SDK, horizon, docs; O4/O5 above |
| D-03 | 05 | yes | `app.ts:36`; `contracts.router.ts`; filters on the four endpoints |
| D-04 | 07 | yes | `apps/horizon/README.md:231-257`; no Railway change applied |
| D-05 | 02,08 | yes | 8 mermaid fences across `apps/docs/concepts/*.mdx`; 10 light/dark screenshots in `screenshots/` |
| D-06 | 06,07 | yes | EXECUTION.md records the mainnet checkpoint pause (`d4584b3`) and the user-run deploy |
| D-07 | 03 | yes | `contracts/stellar/protocol/src/events.rs` — six `#[allow(deprecated)]` + `env.events().publish` pairs |
| D-08 | 01 | yes | `Cargo.toml:13` sdk 27.0.6; stellar-cli 27.1.0 present (used for the on-chain checks here) |
| D-09 | 04 | yes | `contracts.json` full shape; `deploy.sh:36,390` regenerates `deployments.json`; `files` still lists it |
| D-10 | 04 | yes | `registry.ts:22-41`; `client.ts:15,105`; `types.ts:55`; `sync-networks.mjs` idempotent |
| D-11 | 05 | yes | `constants.ts:45-46,54-55,57-59`; name `CONTRACT_IDS_TO_INDEX` kept; `AUTHORITY_CONTRACT_ID` absent from `src/` |
| D-12 | 05 | yes | `resolveContractFilter` at `common/registry.ts:31`, used in `registry.router.ts:175,368` and `data.router.ts:75,229`; `v9 → 400` observed |
| D-13 | 05 | yes | `contracts.unit.test.ts` run here: `/api/contracts` 200, `/api/contracts/v1` 200, `/api/contracts/v9` 404 |
| D-14 | 06,07 | yes | backfill `curl`s with `startLedger` 64212659 / 4404453 at `apps/horizon/README.md:244-249` |
| D-15 | 06 | yes | `>=16.0.0 <17` in `contracts/stellar/package.json:44` and `packages/stellar-sdk/package.json:54`; `^16.3.0` in `apps/horizon/package.json:43` |
| D-16 | 03 | yes | `.github/workflows/soroban-release.yml:25` `@v27.0.0`; no `release-authority` job |
| D-17 | 07 | yes | `.changeset/config.json` `baseBranch: canary`; both packages at 3.0.0 |
| D-18 | 08 | yes | snippet exports all six constants; imported on the four named pages; parity test green |
| D-19 | 03 | yes | `protocol/src/instructions/crypto.rs:221-222` (`g2_is_on_curve` + `g2_is_in_subgroup` at registration), `:341-342` (`g1_is_on_curve` + `g1_is_in_subgroup` on the signature), both returning `Error::InvalidSignaturePoint` (`errors.rs:46`); flag pre-checks retained at `:165,177`; comments at `:144-156` are behavioural, no sdk line numbers |
| D-20 | 03 | yes | `contracts/stellar/Cargo.toml:10` `version = "2.0.0"` |
| D-21 | 06 | yes | testnet deployer identity recorded in EXECUTION.md; testnet v2 live and its integration suite ran against it |
| D-22 | 09 | yes | `packages/stellar-sdk/src/utils/uidGenerator.ts:28-32` encodes the full `ScVal::Bytes` wrapper via `nativeToScVal(buf).toXDR()`; `packages/stellar-sdk/src/delegation.ts:46-50,72,116` bind the message to `sha256(address.to_xdr(env))` of the contract |

22 of 22 decisions implemented; 0 uncovered.

## Verdict

**PASS** — all seven decomposed outcomes delivered, all 22 locked decisions implemented.

The strongest evidence is on-chain and independent of EXECUTION.md's claims: the wasm deployed at both `CA2QET2K…AUCD` (testnet) and `CAMZUXDE…SF2N` (mainnet) hashes to `2b699bf3a0f8c2363bb0b296be8afcaffc424986dafe33a082a058c3fe0950a8`, matching each other and the `wasmHash` recorded in the registry. Both networks point `current` at v2, and every consumer path traced above reaches an address through `contracts.json` rather than a literal.

## Observations (non-blocking, not gaps against this goal)

These do not affect the verdict; they are recorded so the orchestrator can decide whether to fold them into the PR or file them.

1. `apps/horizon/README.md:29,47` still describes the indexer as tracking "protocol and authority contracts … from deployments.json" in the feature-list prose. Stale on two counts — the authority contract is retired and `deployments.json` is now a generated alias. The operational sections further down (the Railway table, `/api/contracts`) are correct. Also flagged by Nyquist.
2. `apps/docs/snippets/contracts.mdx` is a manual copy of the registry, guarded by a test rather than generated. The four Mintlify constraints that forced this (no component export, no interpolation in backticks or code fences, no export-referencing-export, no comments between exports) are documented in the file's line-1 comment. Working as designed under D-18; worth a generator script if the snippet grows.
3. `pnpm release` (npm publish) and `pnpm release:stellar 2.0.0` (cargo release) are deliberately unrun and handed to the user per D-06 — outside this goal, which is about what the repo resolves, not about what is published.
4. `contracts/stellar/bindings/src/protocol.ts` still carries box-drawing characters in its generated doc comments. Out of D-18 scope (that decision covers `apps/docs` concept pages, all of which are clean).

## Next steps

None required for this goal. If the orchestrator wants the PR spotless, fold observation 1 into it — it is a two-line prose edit in `apps/horizon/README.md`.
