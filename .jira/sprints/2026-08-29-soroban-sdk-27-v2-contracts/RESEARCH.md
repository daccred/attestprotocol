# Research: 2026-08-29-soroban-sdk-27-v2-contracts

**Date**: 2026-08-29
**Domain**: smart-contracts/soroban + backend/indexer + library/typescript + docs/mintlify
**Confidence**: HIGH (codebase, patterns) / MEDIUM (external — toolchain pairing and Mintlify dark-mode unverified)
**Valid until**: 2026-09-28 — sdk 27.x is the mainnet line; shorten to 7 days if Protocol 28 activates on testnet or sdk 28 goes stable

## Summary

The Rust surface is small and the sdk-27 blast radius is concentrated. `soroban-sdk` is pinned once (`contracts/stellar/Cargo.toml:12`, lock resolves 22.0.11 / env-host 22.1.3 / xdr 22.1.0). The BLS12-381 usage in `protocol/src/instructions/crypto.rs:103,243,345-391` (`G1Affine/G2Affine::from_bytes`, `hash_to_g1`, unary `Neg`, `pairing_check`) is **source-compatible through 27**; the only rename is the deprecated `G1Affine`/`G2Affine` aliases → `Bls12381G1Affine`/`Bls12381G2Affine` (sdk 26). The real behavioural breaks that touch this repo are all in tests: `Env::default()` now enforces mainnet resource limits (sdk 25), `LedgerInfo { protocol_version: 22 }` is hardcoded in 3 places, archived-entry reads no longer panic (sdk 23), `bytes!` rejects decimal literals (sdk 27). `env.events().publish` is deprecated (sdk 23) but still compiles — switching to `#[contractevent]` changes the wire layout horizon decodes, so it is a separate decision. The version path is 22 → 23 → 25 → 26 → 27 (no 24); 27.0.6 pins env-host 27.0.1 / xdr 27.0.0, which closes both open Cargo Dependabot alerts. Mainnet and testnet both run Protocol 27; SDF pairs sdk 27.0.6 with stellar-cli 27.1.0. The 2025-10 downgrade to 22 (`e2ea656`) was for `stellar-tokens`, a crate since removed — the original blocker is gone. There are exactly **77** `#[test]`s, all in `protocol/tests/*.rs` (70) and `resolvers/tests/default_resolver.rs` (7); snapshots are gitignored.

Contract IDs live in **four unsynchronised copies** — `deployments.json` (jq-written by `deploy.sh:291-373`, overwrites on redeploy), the generated `networks` const in `bindings/src/protocol.ts:34-47` (mainnet hand-added in `be068a3`; this is what `packages/stellar-sdk/src/client.ts:102-113` actually resolves against), horizon env `PROTOCOL_CONTRACT_ID`/`AUTHORITY_CONTRACT_ID` (`apps/horizon/src/common/constants.ts:35-38`), and literal tables in README/docs (11 files). Nothing at runtime reads `deployments.json` except the contracts integration tests. Horizon's Prisma models already carry indexed `contractAddress`/`contractId` columns on `Attestation`, `Schema`, `Transaction`, `HorizonEvent`, `HorizonOperation`, but `/api/registry/{attestations,schemas}` expose no contract filter; `/api/data/{events,operations}` already do. The ingest cursor is one global `HorizonIndexerState` row — not per contract. The Dockerfile production stage copies only `dist/` directories, so a registry file must live under `bindings/src/` (compiled into `dist/`) or be COPYed explicitly; and `railway.toml` `watchPatterns` only watches `apps/horizon/**`.

The docs brief overstated scope: there are **7** box-drawing diagram blocks across the six concept pages (not ~18), no mermaid anywhere, no `snippets/`. Mintlify renders ` ```mermaid ` fences natively and supports `export const` in `/snippets/*.mdx` for reusing a contract ID across pages; dark-mode behaviour of mermaid under Mintlify is undocumented and needs the planned visual QA. Ecosystem registries (Soroswap, Blend) are per-network `{ids, hashes}` JSON with ad-hoc versioning; nothing defines a `current` pointer — the brief's `{network: {v1, v2, current}}` shape is a compatible superset.

**Primary recommendation:** Wave 1 is a mechanical bump with test-side fixes, not a rewrite — keep `env.events().publish` for v2 (wire-compatible with horizon), rename the BLS aliases, fix the three `protocol_version` literals, and handle resource-limit panics per test. Put the registry under `contracts/stellar/bindings/src/contracts.json` (already inside the compiled/COPYed path), make it the single source that `deploy.sh`, bindings `networks`, `packages/stellar-sdk`, horizon, the integration tests, and a Mintlify snippet all derive from.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| sdk bump, BLS rename, test fixes | Infra (Rust/cargo) | — | `contracts/stellar/*` only; no runtime consumer changes |
| Contract build/deploy, ID capture | Infra (shell + stellar CLI) | — | `deploy.sh:656-737`; needs stellar-cli 27.1.0 installed (absent locally) |
| Versioned contract registry (`contracts.json`) | Database/Storage-as-file | Library (bindings, stellar-sdk) | Must sit under a path the Dockerfile copies (`dist/`) — `bindings/src/` qualifies |
| SDK contract resolution (`getContractId`) | Browser/Client library | — | `packages/stellar-sdk/src/client.ts:102-113` already switches on network |
| Multi-contract ingest + `INDEX_CONTRACT_IDS` | API/Backend (horizon) | Infra (Railway env) | `constants.ts:35-38` consumed by 9 files; env applied by user |
| `GET /contracts`, `?contract=` filters | API/Backend (Express) | Database (Prisma) | Model on `registry.router.ts:302-360` → `schemas.repository.ts:102-160` |
| Per-contract backfill from deploy ledger | API/Backend | Database (`HorizonIndexerState`) | Cursor is global; v2 events before cursor need backfill path |
| Regenerated TS bindings | Library | — | Rides a `@stellar/stellar-sdk` 14 → 16 jump |
| attest.next reads `/contracts` | Browser/Client | — | Separate repo; out of this repo's scope beyond the endpoint |
| Docs contract tables + diagrams | CDN/Static (Mintlify) | — | Snippet `export const` for IDs; mermaid fences for diagrams |
| Railway env | Infra (user-applied) | — | Document keys/values; cannot be applied by the agent |

## Codebase

Sourced from `research-codebase.md`.

- **Existing (load-bearing):**
  - `contracts/stellar/Cargo.toml:12` single sdk pin; `Cargo.lock:1359-1361,1294-1296,1475-1477` (sdk 22.0.11, env-host 22.1.3, xdr 22.1.0). No `rust-toolchain.toml`.
  - `protocol/src/instructions/crypto.rs:103,243,345-391` — the complete BLS surface. HAL-07 comment block `:127-168,314-320,355-357` and tests `protocol_cryptography_test.rs:897,1046` encode "22.x has only infallible `from_bytes`".
  - `protocol/src/events.rs:5-…` — 6 `env.events().publish` sites with `symbol_short!` tuple topics (`("SCHEMA","REGISTER")`, `("ATTEST","CREATE")`, …). `protocol/tests/events_regression.rs` guards the tuple layout.
  - Storage: schemas in **instance** storage (`schema.rs:106`), attestations/nonces/BLS keys in persistent (`attestation.rs:210,215,347`, `delegation.rs:137,262,354,384`, `crypto.rs:227,251,268,341`). No `extend_ttl`, no `contractmeta!`, no `update_current_contract_wasm` — confirms no in-place upgrade path.
  - Tests: 77 `#[test]` (12 files under `protocol/tests/`, 1 under `resolvers/tests/`); `Env::default()` x66, `env.register` x74, `mock_all_auths` x51, `events().all()` x23; `LedgerInfo { protocol_version: 22 }` at `protocol/tests/protocol_attestation_test.rs:268,780`, `resolvers/tests/default_resolver.rs:17`. `__protocol_bls_gaffine_test.rs:13-19` uses `bls12_381`/`blst` crates directly and writes a log file via `std::fs`.
  - Build: `wasm32v1-none` in `protocol/Makefile:19`, `resolvers/Makefile:15`, `deploy.sh:69`; `.cargo/config.toml:2-3` sets `-reference-types` only for `wasm32-unknown-unknown` (inert). `resolvers/Makefile:59,65` reference features that don't exist in `resolvers/Cargo.toml:20-21`.
  - `deploy.sh:291-360` `update_contracts_json` (jq merge, atomic mv); `:435-457` bindings generation then move `index.ts` → `bindings/src/protocol.ts`; `:687` deploy; `:711` ID parsed from stellar.expert URL; `:765-770` `initialize --admin`.
  - `bindings/src/protocol.ts:34-46` `networks` const (testnet CBFE5…, local undefined, mainnet CBUUI…) — consumed by `packages/stellar-sdk/src/client.ts:102-113`; `ConfigurationError` at `:115-120`. `bindings/src/types.ts` is hand-written.
  - `contracts/stellar/package.json:23-26` `files: ["dist/", "deployments.json"]`, exports only `./protocol`; `tsconfig.json:33-35` compiles only `bindings/src/*`, `resolveJsonModule` on (`:22`).
  - `__test__/testutils.ts:60-84` loads `deployments.json` → `testnet.protocol.id`; RPC hardcoded `:79`; `ADMIN_SECRET_KEY` `:78`.
  - Horizon: `constants.ts:35-38` `CONTRACT_IDS_TO_INDEX` (always length 2 — `as string` casts; `length === 0` guard at `:93` never fires); consumers `src/index.ts:2,18`, `events.repository.ts:79,160`, `ingest.repository.ts:96,958-1026`, `backfill.repository.ts:98,166,955-1023`, `operations.repository.ts:190`, `ingest.router.ts:184`, `analytics.router.ts:160`, `system.router.ts:133`. Fallback to `CONTRACT_IDS_TO_INDEX[0]` at `ingest.repository.ts:1026`, `backfill.repository.ts:1023`.
  - Cursor: `prisma/schema.prisma:160-174` `HorizonIndexerState` single row; `db.ts:16-62`; ingest resumes `lastProcessedLedger + 1` (`ingest.repository.ts:154-157`); backfill window `LEDGER_HISTORY_LIMIT_DAYS = 7` (`constants.ts:60`).
  - Columns: `HorizonEvent.contractId:15/36`, `HorizonOperation.contractId:135/152`, `Attestation.contractAddress:188/207`, `Schema.contractAddress:222/240`, `Transaction.contractId:250/265` (col/index). `HorizonTransaction` has none.
  - Routes: `app.ts:30-34` mounts `/api`, `/api/ingest`, `/api/data`, `/api/analytics`, `/api/registry`. `registry.router.ts:122-132` (attestations) and `:304-314` (schemas) — no contract filter; `data.router.ts:70,211` accept `contractId`; `analytics.router.ts:153-160` `/contracts` takes `contractIds` defaulting to env array; `system.router.ts:133` exposes `indexing_contracts`.
  - Deployment: `Dockerfile:24-26` builds stellar-contracts then stellar-sdk; `:55-59` production copies only `dist/` of core, stellar-sdk, stellar-contracts. `railway.toml:3` `watchPatterns = ["apps/horizon/**"]`; `[variables]` only NODE_ENV/PORT/NODE_OPTIONS.
  - Unit tests mock constants wholesale: `__tests__/endpoints.unit.test.ts:19-23`, `indexer-sdk.unit.test.ts:13-17` (`CONTRACT_IDS_TO_INDEX: ['CAAAAA','CBBBBB']`); `mockDb` per model `endpoints.unit.test.ts:5-17`; `schemas.repository.ts:127-137` omits `where` when empty and tests assert exact call args.
  - Docs: `docs.json:21-64` navigation; hardcoded IDs at `introduction.mdx:82-83`, `stellar/reference.mdx:16-17`, `stellar/getting-started.mdx:151-152`, `concepts/authorities.mdx:64`. Diagram blocks (exact): `attestations.mdx` L27-31; `authorities.mdx` L24-44; `delegates.mdx` L10-29, L191-195; `how-it-works.mdx` L8-16; `resolvers.mdx` L25-53; `schemas.mdx` L10-27 — **7 total**. No `images/diagrams/`; only images are light/dark `<img>` pairs in `chains/stellar/overview.mdx`. `mintlify` binary in `apps/docs/node_modules/.bin`; `agent-browser` not installed.
  - CI: `soroban-release.yml:24-31` `release-authority` job → nonexistent `contracts/stellar/authority`; `:34-41` `release-protocol`; pins workflow `@main`. No workflow runs `cargo test`. `.changeset/config.json:9` `baseBranch: "main"` while default branch is `canary`.
  - Machine: rustc 1.97.1; no wasm targets installed; no `stellar` CLI.

- **Would change:** `contracts/stellar/Cargo.toml`, `Cargo.lock`, `protocol/src/instructions/crypto.rs` (alias rename + HAL-07 comment), `protocol/tests/*.rs` + `resolvers/tests/default_resolver.rs` (protocol_version, resource limits), `deploy.sh` (registry writer, version key), `bindings/src/protocol.ts` (regenerated) + new `bindings/src/contracts.json`, `contracts/stellar/package.json` (exports), `__test__/testutils.ts`, `packages/stellar-sdk/src/{client,index,types}.ts`, `apps/horizon/src/common/constants.ts`, `src/app.ts`, new `router/contracts.router.ts`, `repository/{attestations,schemas}.repository.ts`, `registry.router.ts`, `ingest.repository.ts`/`backfill.repository.ts`/`events.repository.ts` (contract set source), `__tests__/*.unit.test.ts` mocks, `Dockerfile`/`railway.toml` (if registry path needs it), `.env.example`, `apps/docs/{introduction,stellar/reference,stellar/getting-started,concepts/authorities}.mdx`, 6 concept pages, new `apps/docs/snippets/contracts.mdx`, `README.md`, `apps/horizon/scripts/mainnet/README.md`, `.github/workflows/soroban-release.yml`.

- **Reference-only:** `registry.router.ts:302-360` + `schemas.repository.ts:102-160` (endpoint model), `deploy.sh:291-373` (atomic jq merge), `deploy.sh:113-118,980d74f,e3c36e5` (credential-safe patterns to preserve), `protocol/tests/testutils.rs` (BLS fixtures), `chains/stellar/overview.mdx:6-16` (light/dark image pattern).

## Patterns & conventions

Sourced from `research-patterns.md`.

- **To imitate:**
  - `GET /api/registry/schemas` — router `registry.router.ts:302-360` (query destructure, `limit`/`offset` validation `:316-325`, 400 envelope `:333-339`, typed filters, `{success,data,pagination}` `:353-360`) → repository `schemas.repository.ts:28-35,102-160` (typed `Filters` → conditional `where` → `Promise.all(findMany,count)`, `take` ≤ 200). Mount + log in `app.ts:30-43`.
  - Explicit-override-beats-network-lookup precedence in `client.ts:102-113` — `getContractId(network, version?)` should slot into this switch, not replace it.
  - `deploy.sh:291-373` atomic jq write with temp file + verify-before-mv; ID/tx-hash regexes at `:393,400`.
  - `__test__/testutils.ts:57-84` as the one existing JSON-registry consumer — extend it to read `contracts.json`.
  - `POST /ingest/recurring` `contractIds` body override (`ingest.router.ts:182-184`) — the precedent for a contract set that isn't the env array.
  - Changeset convention: one file naming every package + bump (`efa55ba`); last major `13e3f7f` bumped `stellar-contracts` and `stellar-sdk` together. `updateInternalDependencies: "patch"` means both must be named for a coupled major.
  - Light/dark `<img>` pairs in `chains/stellar/overview.mdx:6-16` — the pattern for any screenshot fallback.
- **To deliberately not imitate:**
  - Hand-editing CLI-generated bindings to add networks (`be068a3`, `bceb6fb`) — the registry must feed `networks`, not the other way round.
  - `deployments.json` overwrite-on-redeploy (`deploy.sh:337`) — history lost; the new writer appends a version key.
  - `as string` env casts yielding `[undefined, undefined]` (`constants.ts:35-38`).
  - Inline Prisma in routers (`data.router.ts:52-100`) vs repository layer — use the repository layer.
  - Alias query params accumulating (`authority`/`deployer`, `by_ledger`/`ledger`) — one name for the contract filter.
  - Version-pinned line-number comments in Rust (`crypto.rs:133-146` names `soroban-sdk-22.0.11` lines) — they rot on bump; replace with behavioural statements.
  - Module-level emoji `console.log` banners (`constants.ts:88-101`).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| soroban-sdk | 27.0.6 | Contract SDK | SDF's mainnet pairing; pulls env-host 27.0.1 / xdr 27.0.0 (closes both Cargo alerts); `rust-version = 1.91.0`; OpenZeppelin stellar-contracts pins 27.0.2 |
| stellar-cli | 27.1.0 | build / deploy / bindings | SDF mainnet pairing; 27.0.0's TS template pinned the wrong JS SDK (issue #2639) — do not use 27.0.0 for bindings |
| Rust | stable (1.97.1 local; ≥ 1.91) + `wasm32v1-none` target | toolchain | sdk 27 MSRV 1.91; `wasm32-unknown-unknown` errors on Rust ≥ 1.82 |
| @stellar/stellar-sdk (JS) | ^16.x (16.3.0) | bindings runtime | What cli 27.1.0 bindings target; **avoid 17** (XDR API overhaul: `.switch()`→`.type`, `toXDR`→`toXdr`) |

### Supporting

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| stellar-expert/soroban-build-workflow | `@v27.0.0` (pin, not `@main`) | CI wasm release | `soroban-release.yml`; `@main` moved 25.1.0 → 27.0.0 silently in July 2026 |
| Mintlify mermaid | built-in | diagrams | ` ```mermaid ` fences; `actions`/`placement` props; ELK via `%%{init}%%` for large graphs |
| Mintlify snippets | built-in | contract ID reuse | `export const` in `/snippets/*.mdx`, `import {x} from "/snippets/..."`, `{x}` in prose and code fences; CLI/git only |
| agent-browser | not installed | visual QA of `mintlify dev` | both colour schemes; screenshot fallback |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| stellar-cli 27.1.0 | 28.0.0 | Latest, container builds; release notes silent on 28-CLI + sdk-27 + P27-mainnet support — unverified |
| keep `env.events().publish` | `#[contractevent]` | Typed SEP-48 events in bindings; but changes topic/data wire layout horizon decodes (`ingest.repository.ts:632-649`, `events_regression.rs`) — a coordinated indexer change |
| JSON registry under `bindings/src/` | TS module export | JSON is readable by `deploy.sh` (jq), tests, and horizon without a build; TS is typed/tree-shakeable. JSON + a generated typed accessor gets both |
| snippet `export const` for IDs | hand-edited tables | Tables are what exists; snippets keep four docs pages in sync from one file |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Atomic registry write | new jq/sed logic | `deploy.sh:291-373` pattern (temp file, verify, mv) | Already credential-safe and atomic; extend the key path |
| Paginated list endpoint | ad-hoc `res.json` | `schemas.repository.ts:128-131` + `registry.router.ts:353-360` envelope | Tests assert this exact shape and the ≤200 cap |
| Network → passphrase/RPC | new switch | `client.ts:84-99`, `constants.ts:69-86` | Two existing switches; add `getContractId` beside them |
| BLS point validation | more flag-byte checks | sdk 26+ `g1_is_on_curve`/`g1_is_in_subgroup` (+ g2) host functions | The fallible pre-check HAL-07 said didn't exist now does; on-curve alone is insufficient — need subgroup |
| RPC retry | new backoff | `ingest.repository.ts:116-149` | Already handles timeout/backoff |
| Test config loading | second loader | `__test__/testutils.ts:57-84` | Single JSON loader to extend |
| Comma-list env parsing | custom parser | `split(',').map(trim).filter(Boolean)` | Railway has no list type; this is the staff-confirmed pattern |

**Key insight:** every new source of truth in this sprint should *replace* one of the four existing ID copies, not become a fifth.

## Common Pitfalls

### Resource-limit panics in tests (sdk 25)
- **What goes wrong:** heavy tests (BLS `pairing_check`, delegation flows, large vec loops) panic with resource-limit errors after the bump.
- **Why it happens:** `Env::default()` now applies `InvocationResourceLimits::mainnet()` (env.rs @27.0.6 ~L773).
- **How to avoid:** decide per test — optimise, or `env.cost_estimate().disable_resource_limits()`; never blanket-disable in `testutils.rs`. The BLS entrypoints hitting limits is itself a mainnet finding worth recording.
- **Warning signs:** only the 17 crypto + 14 delegation tests fail; message mentions CPU/mem budget.

### Hardcoded `protocol_version: 22` in `LedgerInfo`
- **What goes wrong:** `env.ledger().set(..)` errors or silently gates features under env-host 27's protocol bounds check.
- **Why it happens:** `protocol_attestation_test.rs:268,780`, `resolvers/tests/default_resolver.rs:17` pin 22.
- **How to avoid:** set 27 or drop the field (default_ledger_info supplies it).
- **Warning signs:** host errors naming protocol version on `ledger().set`.

### Deprecation warnings under `-D warnings`
- **What goes wrong:** build fails on `G1Affine`/`G2Affine`, `publish`, `budget()`, `assert_in_contract` deprecations.
- **Why it happens:** sdk 23/26 deprecations; the stellar-expert workflow floats stable Rust.
- **How to avoid:** rename BLS aliases; `env.budget()` → `env.cost_estimate().budget()`; leave `publish` (see events decision) with an explicit `#[allow(deprecated)]` and a comment tying it to the indexer.
- **Warning signs:** `cargo build` warnings before `stellar contract build`.

### `#[contractevent]` changes the wire shape
- **What goes wrong:** horizon stops matching events after v2 deploy.
- **Why it happens:** `contractevent` default first topic = struct name, data = map keyed by field; horizon decodes the current tuple layout (`ingest.repository.ts:632-649`, `backfill.repository.ts:626-643`, `events.repository.ts:512`).
- **How to avoid:** keep `publish` in v2 (wire-compatible), or adopt `contractevent` only with `topics=[...]`/`data_format="vec"` reproducing the layout exactly and the `events_regression.rs` test extended. From sdk 28, `map` format drops `None` fields — indexers must tolerate absent keys either way.
- **Warning signs:** `events_regression.rs` fails; horizon `HorizonEvent` rows with unrecognised topics.

### Registry file missing from the Railway image
- **What goes wrong:** horizon boots with an empty contract set in production.
- **Why it happens:** `Dockerfile:55-59` copies only `dist/`; `railway.toml:3` doesn't watch `contracts/stellar/**`.
- **How to avoid:** place `contracts.json` under `bindings/src/` (compiled via `resolveJsonModule`) or add a COPY; add `contracts/stellar/**` to `watchPatterns`.
- **Warning signs:** `system.router.ts:133` `indexing_contracts` empty in `/api/status` on Railway.

### Global cursor skips v2 history
- **What goes wrong:** v2 events between deploy ledger and the current cursor are never indexed.
- **Why it happens:** `HorizonIndexerState` is one row; ingest resumes at `lastProcessedLedger + 1`; backfill window is 7 days (`constants.ts:60`).
- **How to avoid:** register the v2 contract before/at deploy so the cursor is already past nothing, or record `deployedLedger` in the registry and run backfill from it.
- **Warning signs:** `/api/registry/schemas?contract=<v2>` empty while stellar.expert shows events.

### Unit-test mocks silently drop new exports
- **What goes wrong:** `INDEX_CONTRACT_IDS`/registry loader is `undefined` in `endpoints.unit.test.ts`, `indexer-sdk.unit.test.ts`.
- **Why it happens:** `vi.mock('../src/common/constants', () => ({...}))` replaces the whole module (`:19-23`, `:13-17`).
- **How to avoid:** update both mock factories in the same change; add `Contract`/registry model to `mockDb` if a Prisma model is introduced.
- **Warning signs:** `TypeError: cannot read properties of undefined` in unit runs only.

### `deployments.json` overwrite loses v1
- **What goes wrong:** running `deploy.sh` for v2 erases the v1 ID.
- **Why it happens:** `deploy.sh:337` jq assigns `.[$net][$name]` flat.
- **How to avoid:** new writer assigns `.[$net][$name][$version]` and sets `current` explicitly; v1 entries seeded from git history before the first v2 deploy.
- **Warning signs:** `git diff deployments.json` shows a deletion.

### Bindings regeneration pulls JS SDK 16 and drops mainnet
- **What goes wrong:** regenerated `protocol.ts` has only `testnet` in `networks`; `packages/stellar-sdk` peer `>=14.3.0` and horizon `^14.6.1` diverge from the bindings' `^16.0.1`.
- **Why it happens:** CLI emits one network per run; mainnet passphrase maps to `unknown`/`public` depending on version.
- **How to avoid:** generate `networks` from `contracts.json` post-CLI (scripted, not hand-edited); bump peer range to `>=16 <17` and horizon to 16.x in the same wave; test `authorizeInvocation`/`Client.from<T>` call sites.
- **Warning signs:** `ConfigurationError` from `client.ts:115-120` on mainnet; type errors in horizon after `pnpm install`.

### Mermaid dark mode under Mintlify
- **What goes wrong:** low-contrast diagrams in dark theme.
- **Why it happens:** Mintlify documents no theme option; Mermaid doesn't re-render on `prefers-color-scheme` change (community reports).
- **How to avoid:** `%%{init: {'theme': ...}}%%` experiments during the agent-browser pass in both schemes; screenshot fallback with light/dark `<img>` pair where unfixable.
- **Warning signs:** visual QA only.

## SOTA Updates

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `env.events().publish((topics), data)` | `#[contractevent]` struct + `.publish(&env)`; SEP-48 typed events in bindings | sdk 23 (2025-09) | Deprecated, still compiles; wire-shape change → deferred decision |
| `G1Affine`, `G2Affine`, `Fr` | `Bls12381G1Affine`, `Bls12381G2Affine`, `Bls12381Fr` | sdk 26 | Rename only |
| No fallible BLS validation | `g1_is_on_curve`, `g1_is_in_subgroup`, `g2_*`, `checked_add` (CAP-80) | sdk 26 | HAL-07 residual can now be closed at fee cost |
| Tests unbounded | `Env::default()` enforces mainnet limits; `cost_estimate().disable_resource_limits()` | sdk 25 (numbers refreshed 27.0.3) | Test failures on heavy paths |
| Archived-entry access panics in tests | Emulates auto-restore | sdk 23 | Any test asserting the panic must assert TTL instead |
| `env.budget()` | `env.cost_estimate().budget()` | sdk 25 | Deprecation |
| `extend_ttl` only | `extend_ttl_with_limits(key, min, max)` (CAP-78) | sdk 26 | Not used today |
| `deploy_v2` / `update_current_contract_wasm` | renamed `deploy_contract` / `update_current_contract` | sdk 28 (rc) | Don't add an upgrade path using the 27 names without noting the rename |
| `bytes!(&env, 1)` | hex/binary literals only | sdk 27 | Compile error if any decimal literal exists |
| `export=`/`lib=` on contract macros | removed; spec shaking mandatory | sdk 28 (rc) | Don't introduce now |

**Deprecated:** `assert_in_contract!` → `debug_assert_in_contract!` (26); `env.ledger().protocol_version()` (23.2.1); `crypto::BnScalar`; stellar-cli 27.0.0 TS template.

## Risks & unknowns

- **stellar-cli 28 vs sdk 27 on P27 mainnet** — SDF pairs 27.1.0 with mainnet; 28.0.0 notes are silent. Resolve by installing 27.1.0 (safe default) or a test build with 28 against testnet.
- **Resource-limit headroom of BLS entrypoints** — unknown until `cargo test` runs on 27. If `attest_by_delegation` exceeds mainnet limits in tests, that's a real mainnet constraint, not a test artefact.
- **Which `publish` layouts horizon depends on** — the three decoders are near-duplicates; confirm topic tuples match `events.rs` before any `contractevent` move. Recommendation: defer `contractevent` to a later sprint.
- **JS SDK 14 → 16 in horizon** — `authorizeInvocation` object param, `Client.from<T>`, no default export. Unknown call-site count until attempted.
- **Global cursor** — whether v2 needs `deployedLedger` in the registry plus a backfill invocation, or whether registering before the first event suffices.
- **Changesets base branch** — `baseBranch: "main"` vs working branch `canary`; `changeset version` may misdetect changed packages.
- **`release-authority` CI job** — fails on every `v*` tag; deleting it is safe but touches the release workflow the v2 tag will trigger.
- **Docs scope** — 7 diagrams, not ~18; whether tree-style text blocks (e.g. `authorities.mdx:75-90`) count.
- **Mermaid dark mode** — undocumented; visual QA is the only check.
- **`INDEX_CONTRACT_IDS` semantics** — comma list vs "registry" sentinel; and what `PROTOCOL_CONTRACT_ID` means once the registry exists (ingest target only, per brief).

## Open questions for planner

- Keep `env.events().publish` for v2 (wire-compatible) and defer `#[contractevent]`? (Recommended: yes.)
- Adopt sdk-26 `g1_is_in_subgroup`/`g2_is_in_subgroup` pre-checks to close HAL-07's residual, or leave the flag-byte checks? Fee cost vs trap behaviour.
- Registry location: `contracts/stellar/bindings/src/contracts.json` (inside compiled/COPYed path) vs `contracts/stellar/contracts.json` + Dockerfile COPY + new `exports` key?
- Registry shape: brief's `{network: {v1: {id, sdk, deployedAt}, current}}` — add `deployedLedger` and `hash` (wasm hash, not tx hash) for backfill and source validation?
- Does `deployments.json` get deleted, or kept as a generated alias for one release?
- `getContractId(network, version?)` — export from `@attestprotocol/stellar-contracts` (bindings) and re-export from `stellar-sdk`, or only stellar-sdk?
- `INDEX_CONTRACT_IDS`: comma list of IDs, or a `registry` sentinel meaning "all non-retired entries for `STELLAR_NETWORK`"?
- Per-contract cursor: add `deployedLedger` + one-shot backfill, or a `startLedger` column on a new `IndexedContract` model?
- `?contract=` filter name on `/api/registry/{attestations,schemas}` — `contract` (address) and `version` (registry key resolved server-side), or only `contract`?
- JS SDK bump scope: `packages/stellar-sdk` peer `>=16 <17` and horizon 16.x in Wave 3 (with bindings) — and is that the major that ships in Wave 4?
- stellar-cli version to install locally: 27.1.0 (safe) or 28.0.0?
- Pin `soroban-release.yml` to `@v27.0.0` and delete `release-authority` in Wave 1?
- Fix `.changeset/config.json` `baseBranch` to `canary` in Wave 4?
- Docs: convert only the 7 box-drawing blocks, or also tree-text blocks? Snippet file name/shape for IDs (`/snippets/contracts.mdx` exporting per-network consts)?
- Mainnet deploy: who signs, from where, and is `deploy.sh --fee` + `--initialize` (per `readme.txt`) still the procedure?

## Sources

### Primary (HIGH confidence)

- In-repo (read directly, cited by `path:line` above): `contracts/stellar/{Cargo.toml,Cargo.lock,Release.toml,.cargo/config.toml,deploy.sh,deployments.json,package.json,tsconfig.json,vitest.config.ts,.gitignore,readme.txt}`, `protocol/{Cargo.toml,Makefile,src/**,tests/*}`, `resolvers/{Cargo.toml,Makefile,src/*,tests/*}`, `bindings/{README.md,src/*}`, `__test__/*`, `packages/stellar-sdk/src/{index,client,types}.ts`, `src/utils/indexer.ts`, `package.json`, `tsup.config.ts`, `apps/horizon/{Dockerfile,railway.toml,.env.example,README.md,package.json,vitest.config.ts}`, `prisma/schema.prisma`, `src/{app,index}.ts`, `src/common/{constants,db}.ts`, `src/router/*.ts`, `src/repository/*.ts`, `__tests__/*.unit.test.ts`, `__tests__/fixtures/unit-setup.ts`, `apps/docs/{docs.json,package.json,introduction.mdx,concepts/*.mdx,stellar/*.mdx,chains/stellar/overview.mdx}`, `.github/workflows/*.yml`, `.changeset/config.json`, `README.md`.
- Git history on `canary`: `e2ea656` (sdk downgrade), `cf59560` (stellar-tokens removal), `ea10628` (authority removal), `be068a3`/`bceb6fb` (hand-edited bindings), `283d558` (mainnet deploy), `13e3f7f` (last coupled major), `efa55ba` (changeset format), `ad6c1d3` (HAL-07), `980d74f`/`e3c36e5`/`433b055` (deploy.sh hardening).
- Shell facts: 77 `#[test]`; rustc 1.97.1; no wasm targets; no `stellar` CLI; `mintlify` in `apps/docs/node_modules/.bin`.
- https://github.com/stellar/rs-soroban-sdk/releases — v22.0.9–22.0.11, 23.x, 25.x, 26.x, 27.0.0–27.0.6, 28.0.0-rc.1.
- `rs-soroban-sdk` @v27.0.6: `Cargo.toml` (rust-version 1.91.0, env-* 27.0.1, xdr 27.0.0), `README.md`, `soroban-sdk/src/env.rs`, `testutils/cost_estimate.rs`, `src/_migrating/*.rs` (v23 archived testing, v23 contractevent, v25 bn254/contracttrait/event testing/resource limits, v27 bytes literals/export).
- https://docs.rs/soroban-sdk/27.0.6/ — `crypto/bls12_381`, `storage::Persistent`, `events::Events`, `attr.contractevent`, `Env`, `contractmeta`.
- Advisories GHSA-x2hw-px52-wp4m (sdk Fr), GHSA-pm4j-7r4q-ccg8 (env-host, patched 26.0.0), GHSA-x57h-xx53-v53w (xdr, patched 25.0.1).
- https://developers.stellar.org/docs/networks/software-versions — mainnet P27 since 2026-07-08, sdk 27.0.6 / cli 27.1.0; testnet P27 since 2026-06-18.
- https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup.
- stellar-cli `FULL_HELP_DOCS.md` (bindings flags), `soroban-spec-typescript/src/project_template/*` @v27.1.0 and v28.0.0, issue #2639, releases v25.2.0–v28.0.0.
- https://github.com/stellar/js-stellar-sdk/releases (15, 16.x, 17.0.1).
- `stellar-expert/soroban-build-workflow` `release.yml`, tags (v27.0.0).
- https://www.mintlify.com/docs/components/mermaid-diagrams, https://www.mintlify.com/docs/create/reusable-snippets, https://docs.railway.com/guides/variables.

### Secondary (MEDIUM confidence)

- `soroswap/core` `public/*.contracts.json`, `blend-capital/blend-utils` `*.contracts.json` — registry practice, not a standard.
- `OpenZeppelin/stellar-contracts` `Cargo.toml` pin 27.0.2 — adoption evidence.
- Contract Source Validation SEP draft (stellar discussions #1573), SEP-1.
- Railway Help Station thread on comma-separated vars (staff reply, single thread).
- Diagram block count (7) — script-classified fences, spot-checked; not every page read end-to-end.
- `deployments.json` unread at runtime — grep-based; a constructed dynamic path would evade it.
- Tag shape `v2.0.1_..._cli22.8.1` attributed to the stellar-expert workflow — inferred from tag + workflow file.

### Tertiary (LOW confidence)

- Mermaid dark-mode behaviour under Mintlify — generic Mermaid/GitHub discussions (#12116, #35733, #172498); validate visually.
- `stellar-registry-cli` (0.0.21) — single source, 0.x.
- `release-authority` job fails on every tag — inferred from the missing directory, not Actions history.
- `undefined` in `CONTRACT_IDS_TO_INDEX` reaching the RPC filter — inferred from the cast, not observed.
- stellar-cli 28 release pages partially failed to load; flag claims cross-checked against `FULL_HELP_DOCS.md`.

## Metadata

**Research scope:**
- Focus areas covered: codebase, patterns, external (all run against `canary`, the default branch; a first pass against a stale local `main` was discarded).
- Sections omitted: none.

**Confidence breakdown:**
- Codebase findings: HIGH — every claim is `path:line` on the checked-out tree; test count and diagram count verified by shell.
- Patterns & conventions: HIGH — from direct reads and `git show`/`log -S` on canary.
- Standard stack: MEDIUM — versions and breaking changes from official release notes; cli-28/sdk-27 pairing and Mintlify dark mode unverified.
- Pitfalls: HIGH for sdk-migration items (official migration guide), MEDIUM for Railway/Docker (inferred from Dockerfile + railway.toml, not a deploy).

**Valid-until reasoning:** 30 days — sdk 27.x is the mainnet line and P28 is "Testnet, TBD"; if P28 activates on testnet or sdk 28 goes stable, Wave 1's target and the `contractevent`/`deploy_contract` naming notes change, so re-check before Wave 3.

**Contradictions resolved:**
- Brief says ~18 ASCII diagrams; tree has 7 box-drawing blocks (codebase + patterns agree). Brief's number came from an earlier count that included code-comment fences.
- Brief lists `env.crypto().bls12_381` as the first API break; external research shows it's source-compatible — the only change is a deprecated alias rename. The first real breaks are test-side (resource limits, protocol_version).
- Brief assumes `deployments.json` is load-bearing; only the integration tests read it. The load-bearing copy is the bindings `networks` const.

---

*Sprint: 2026-08-29-soroban-sdk-27-v2-contracts*
*Research completed: 2026-08-29*
*Next step: `/jira:plan`*
