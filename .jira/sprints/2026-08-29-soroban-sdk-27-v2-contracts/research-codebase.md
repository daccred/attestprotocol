# Research: codebase — 2026-08-29-soroban-sdk-27-v2-contracts

## Summary

- Rust surface is small and the sdk-27 blast radius is concentrated: `soroban-sdk` is pinned once at `contracts/stellar/Cargo.toml:12` (`22.0.8`; lockfile resolves `22.0.11` at `Cargo.lock:1360`). The only BLS12-381 host API used is `env.crypto().bls12_381().hash_to_g1(..)` / `.pairing_check(..)` plus `G1Affine::from_bytes` / `G2Affine::from_bytes` in `protocol/src/instructions/crypto.rs:103,243,348,375-391`. No `contractmeta!`, no `extend_ttl`, no temporary storage, no `update_current_contract_wasm` anywhere.
- Exactly 77 `#[test]` functions, all in integration-style `tests/` dirs (12 files under `protocol/tests/`, 1 under `resolvers/tests/`); none in `src/`. Snapshots are gitignored (`contracts/stellar/.gitignore:5`), 70 untracked `.1.json` files exist locally.
- Toolchain on this machine: rustc 1.97.1, no `wasm32v1-none`/`wasm32-unknown-unknown` target installed, `stellar` CLI not installed. `.cargo/config.toml` only sets rustflags for `wasm32-unknown-unknown` while every Makefile/deploy path builds `wasm32v1-none`.
- Contract IDs are hardcoded in 11 places outside `deployments.json`, and the generated bindings (`bindings/src/protocol.ts:34-46`) are the runtime source of truth for `@attestprotocol/stellar-sdk` (`packages/stellar-sdk/src/client.ts:102-113`). Horizon never reads `deployments.json`; it reads `PROTOCOL_CONTRACT_ID` + `AUTHORITY_CONTRACT_ID` env into a two-element array (`apps/horizon/src/common/constants.ts:35-38`).
- The docs concept pages contain **7** box-drawing diagram blocks, not ~18: attestations 1, authorities 1, delegates 2, how-it-works 1, resolvers 1, schemas 1. No mermaid fences exist anywhere in `apps/docs`; the only images are `<img>` tags in `chains/stellar/overview.mdx:6,13,521-522`.

## Findings

### Codebase — contracts/stellar (Wave 1)

**Workspace and build config**
- `contracts/stellar/Cargo.toml:1-8` workspace members `protocol`, `resolvers`; `:9-10` `[workspace.package] version = "1.3.6"`; `:12` `soroban-sdk = { version = "22.0.8" }`; `:13` commented-out `stellar-xdr` pin. Release profile `:15-23` (`opt-level = "z"`, `lto`, `panic = "abort"`), `release-with-logs` profile `:25-27`.
- `Cargo.lock:1359-1361` soroban-sdk 22.0.11; `:1294-1296` soroban-env-host 22.1.3; `:1475-1477` stellar-xdr 22.1.0; `:1265` soroban-env-common 22.1.3. Lockfile is tracked in git.
- `protocol/Cargo.toml:16-17` deps: `soroban-sdk` (workspace), `resolvers` path dep with `default-features = false`. `:19-23` dev-deps: `soroban-sdk` with `testutils`, `bls12_381 = "0.8.0"`, `blst = "0.3.0"`, `hex`. `:12-13` declares an empty `testutils = []` feature (nothing in `src/` is gated on it; grep found no `cfg(feature = "testutils")`).
- `resolvers/Cargo.toml:20-21` features `default = []`, `export-default-resolver = []`. `resolvers/Makefile:59,65` reference `export-token-reward-resolver` and `export-fee-collection-resolver` which do not exist in `Cargo.toml` — `make build` in resolvers would fail on `build-token`/`build-fee`. Only `default.rs` exists in `resolvers/src/`.
- `.cargo/config.toml:2-3` `[target.wasm32-unknown-unknown] rustflags = ["-C", "target-feature=-reference-types"]` — does not apply to `wasm32v1-none`, which is what `protocol/Makefile:19`, `resolvers/Makefile:15`, `deploy.sh:69` and `resolvers/src/lib.rs:21` use.
- `Release.toml:1-5` cargo-release config (`publish = true`, `push = true`); root `package.json:35` `release:stellar` runs `cargo release $1 --execute` in `contracts/stellar`.
- Git history: `e2ea656` (2025-10-26) "downgrade soroban-sdk to v22.0.8 for stellar-tokens compatibility" — workspace was on 23.0.2; the `stellar-tokens` dependency and `token_reward.rs` it mentions no longer exist in the tree (only `resolvers/src/{default,interface,lib}.rs`). The original blocker for going above 22 is gone.

**soroban_sdk API inventory (src only)**
- Macros: `#[contract]`/`#[contractimpl]` at `protocol/src/lib.rs:19-22`, `resolvers/src/default.rs:6-9`; `#[contracttype]` x12 (`protocol/src/state.rs`, `resolvers/src/interface.rs:3,19,28`); `#[contracterror]` at `protocol/src/errors.rs:4`, `resolvers/src/interface.rs:40`; `#[contractclient(name = "ResolverClient")]` at `protocol/src/interfaces/resolver.rs:59`. No `contractmeta!`, no `contractspec`, no `contractimport!`.
- Crypto: `env.crypto().sha256(..)` x9 (`protocol/src/utils.rs:54,222`, `protocol/src/instructions/delegation.rs:459,474,498,503,534,554,566`), `env.crypto().keccak256(..)` at `utils.rs:128`. Results are used via `.into()` to `BytesN<32>` and `.to_array()` (`delegation.rs:459`). BLS: import `soroban_sdk::crypto::bls12_381::{G1Affine, G2Affine}` at `crypto.rs:103`; `G2Affine::from_bytes(public_key.clone())` `:243`; `env.crypto().bls12_381().hash_to_g1(&message.into(), &Bytes::from_slice(env, DST))` `:345-348`; unary negation `-hashed_message` `:366`; `G1Affine::from_bytes` `:375`; `G2Affine::from_bytes(bls_key.key)` `:379`; `G2Affine::from_bytes(BytesN::from_array(env, &G2_GENERATOR))` `:387`; `Vec::from_array(env, [s, neg])` `:385,389`; `pairing_check(g1_points, g2_points)` `:391` returning `bool`.
- The HAL-07 comment block `crypto.rs:127-168` and `:314-320,355-357` documents that 22.x exposes only infallible `from_bytes` and builds flag-byte pre-checks (`validate_g1_point_bytes` `:178`, `validate_g2_point_bytes` `:192`) around that. `protocol/tests/protocol_cryptography_test.rs:897,1046` repeat this assumption. These comments and the tests `test_hal07_*` (5 snapshots) encode 22.x semantics.
- XDR: `soroban_sdk::xdr::ToXdr` at `attestation.rs:3`, `utils.rs:2`, `delegation.rs:10` (`.to_xdr(env)` on `Address`/`String`).
- Storage: `env.storage().instance()` x6 (`lib.rs:38,45`, `schema.rs:106`, ...), `env.storage().persistent()` x11 (`attestation.rs:210,215,347`, `delegation.rs:137,262,354,384`, `crypto.rs:227,251,268,341`, `lib.rs:226`). Schemas are stored in **instance** storage (`schema.rs:106`); attestations, nonces, BLS keys in persistent. No TTL extension calls anywhere.
- Events: `env.events().publish(topics, data)` x6 in `protocol/src/events.rs` with `symbol_short!` topics (`("SCHEMA","REGISTER")` `:5`, `("ATTEST","CREATE")` `:12`, etc.).
- Auth: `require_auth()` x11 (`lib.rs:43`, `crypto.rs:222`, ...). `env.ledger().timestamp()` x7, `env.ledger().network_id()` x4 (delegation message building), `env.current_contract_address()` x3.
- `#![no_std]` at `protocol/src/lib.rs:1`, `resolvers/src/lib.rs:31`. `resolvers/src/lib.rs:42-43,53-54` gate `default` module on `not(target_arch = "wasm32")` OR the feature.
- Public contract surface (`protocol/src/lib.rs`): `initialize` `:37`, `register` `:69`, `get_schema` `:89`, `attest` `:109`, `revoke` `:132`, `get_attestation` `:146`, `attest_by_delegation` `:171`, `revoke_by_delegation` `:193`, `get_attester_nonce` `:213`, `get_revoker_nonce` `:225`, `register_bls_key` `:245`, `get_bls_key` `:259`, `get_dst_for_attestation` `:272`, `get_dst_for_revocation` `:285`. No upgrade/admin-wasm function — confirms the brief's "no in-place upgrade path".

**Tests**
- 77 `#[test]` total. Per file: `protocol/tests/protocol_cryptography_test.rs` 17, `protocol_delegation_test.rs` 14, `protocol_attestation_test.rs` 9, `protocol_resolver_test.rs` 8, `protocol_revocation_test.rs` 5, `resolver_abi.rs` 4, `protocol_schema_uid_test.rs` 3, `protocol_initialization_and_schema.rs` 3, `__protocol_bls_gaffine_test.rs` 3, `events_regression.rs` 2, `protocol_revoke_error_test.rs` 2, `resolvers/tests/default_resolver.rs` 7. Shared helpers in `protocol/tests/testutils.rs` (BLS constants `:21,32`, `DummyResolver` contract `:120`, `create_delegated_attestation_request` `:75`). No `#[cfg(test)]` modules in `src/`.
- Test-side sdk API usage: `Env::default()` x66, `env.register(Contract, ())` x74, `mock_all_auths` x51, `mock_auths`/`MockAuth` x42/92, `as_contract` x48, `env.events().all()` x23, `soroban_sdk::testutils::{Address, Events, Ledger, LedgerInfo}`, `set_timestamp`, `try_*` client methods x~40, `InvokeError` x6, `try_into_val`/`IntoVal`.
- `__protocol_bls_gaffine_test.rs:13-15` uses `bls12_381` and `blst` crates directly (no soroban); `:18-19` writes a log file via `std::fs`.
- Snapshots: 63 files in `protocol/test_snapshots/`, 7 in `resolvers/test_snapshots/`; `contracts/stellar/.gitignore:5` ignores `test_snapshots` (0 tracked). `git ls-files` confirms.
- Vitest integration suite: `contracts/stellar/__test__/` (4 `*.test.ts` + `testutils.ts`), `vitest.config.ts:9` includes `__test__/**/*.test.ts`, single-thread `:13-18`, 120s timeout. `testutils.ts:60-84` loads `contracts/stellar/deployments.json` → `deployments.testnet.protocol.id`; rpcUrl hardcoded to `https://soroban-testnet.stellar.org` `:79`; `ADMIN_SECRET_KEY` from env `:78`. Tests use `ProtocolContract.networks.testnet.networkPassphrase` from bindings (`protocol.integration.test.ts:47` etc.). `__test__/readme.md` still describes a deleted "Authority contract" suite.

**Deploy / registry / bindings**
- `deploy.sh:35` `CONTRACTS_JSON_FILE="deployments.json"` shape `{network: {contract: {id, hash, timestamp}}}`; `update_contracts_json` `:291-360` uses `jq` to merge `.[$net][$name] = {id, hash, timestamp}` — a flat per-contract slot, no version dimension. `:656` `stellar contract build`; `:687` `stellar contract deploy --wasm ... --source ... --network ...`; ID parsed from the stellar.expert URL in CLI output `:711`; `:765-770` `stellar contract invoke ... initialize --admin`. Bindings: `:435-438` `stellar contract bindings typescript --network ... `, then moves `index.ts` → `bindings/src/<name>.ts` `:453-457`. Only `--protocol` flag remains (`:73` `deploy_protocol`), `bindings/README.md:9-10,17-21` still documents `--authority`.
- `deployments.json:1-15` current shape. Published with the npm package via `contracts/stellar/package.json:23-26` `files: ["dist/", "deployments.json"]`; package exports only `./protocol` → `dist/protocol.js` `:15-19`; `tsconfig.json:33-35` compiles only `bindings/src/*`.
- `bindings/src/protocol.ts:34-46` `export const networks = { testnet: {contractId: CBFE5…}, local: {contractId: undefined}, mainnet: {contractId: CBUUI…} } as const` — generated, hand-regenerated on deploy. `bindings/src/protocol.md:11,33` embed the testnet ID in CLI examples. `bindings/src/types.ts` is hand-written (simulation payload types).
- `.github/workflows/soroban-release.yml:24-41` two jobs via `stellar-expert/soroban-build-workflow/.github/workflows/release.yml@main`: `release-authority` with `relative_path: 'contracts/stellar/authority'` (directory does not exist) and `release-protocol`. Triggers on `v*` tags `:14-16`. No CI workflow runs `cargo test` (`codeql.yml`, `semantic-release.yml` only; `semantic-release.yml:5-7` runs on `canary` and `main`).
- `.changeset/config.json:9` `baseBranch: "main"` (checked-out default branch is `canary`); `:11` packages `["packages/*", "contracts/stellar/*"]`.

### Codebase — packages/stellar-sdk (Wave 2)

- `packages/stellar-sdk/src/client.ts:83-100` derives `networkPassphrase` from `options.network` (`Networks.PUBLIC/FUTURENET/TESTNET`); `:102-113` resolves `contractId` from `options.contractId` else `ProtocolNetworks.{mainnet,testnet}.contractId`; `:115-120` throws `ConfigurationError` if empty; `:126-131` constructs `ProtocolClient`. `ClientOptions` at `src/types.ts:54-68` (`network?: 'testnet'|'mainnet'|'futurenet'|'local'`, `contractId?`). A separate, apparently unused `contractAddresses?: {protocol?, authority?}` option exists at `types.ts:36-42`.
- `src/index.ts:81-89` re-exports `Client as ProtocolClient`, `networks as ProtocolNetworks`, and types from `@attestprotocol/stellar-contracts/protocol` — this is the only import of the contracts package. No import of `deployments.json`.
- `src/utils/indexer.ts:85-100` `HORIZON_CONFIGS` (testnet registry `https://testnet-graph.attest.so/api/registry`, mainnet `https://graph.attest.so/api/registry`); `:107-110` `REGISTRY_ENDPOINTS` overridable by `HORIZON_REGISTRY_URL`. Functions hit `/attestations` and `/schemas` only (`:167,196,230,267,298,325`).
- Build: `tsup.config.ts` (cjs+esm, dts, `external: ['@stellar/stellar-sdk']`, platform neutral). `package.json:9` depends on `@attestprotocol/stellar-contracts: workspace:*`; version `2.0.2` `:4`; peer `@stellar/stellar-sdk >=14.3.0`.
- `packages/sdk/src` and `packages/cli/src`: no references to `stellar-contracts`, `ProtocolNetworks`, or `CONTRACT_ID`.

### Codebase — apps/horizon (Wave 2)

- Env consumption: `src/common/constants.ts:35-38` `CONTRACT_IDS_TO_INDEX = [process.env.PROTOCOL_CONTRACT_ID, process.env.AUTHORITY_CONTRACT_ID]` — cast `as string`, so an unset var yields `undefined` in the array (length stays 2; the `length === 0` warning at `:93` never fires). `STELLAR_NETWORK` `:25`; RPC URL `:71-75` (mainnet → `https://rpc.lightsail.network`). `.env.example:6-8` sets `STELLAR_NETWORK=testnet`, `AUTHORITY_CONTRACT_ID=CCMJ…`, `PROTOCOL_CONTRACT_ID=CBFE5…`. `README.md:136` says contract IDs are configured in constants.ts; `README.md:145-149` lists stale IDs `CADB73…`/`CAD6YM…`; `scripts/mainnet/README.md:45-46,298,374-375` list mainnet IDs incl. authority `CBKOB6…`.
- Consumers of `CONTRACT_IDS_TO_INDEX` (all would need to read the registry instead): `src/index.ts:2,18` (boot → `enqueueRecurringIngestion`), `repository/events.repository.ts:79,160` (getEvents filter), `repository/ingest.repository.ts:96,958-1026`, `repository/backfill.repository.ts:98,166,955-1023`, `repository/operations.repository.ts:190`, `router/ingest.router.ts:184`, `router/analytics.router.ts:160`, `router/system.router.ts:133` (`indexing_contracts` in health payload). `ingest.repository.ts:1026` and `backfill.repository.ts:1023` fall back to `CONTRACT_IDS_TO_INDEX[0]` when a contract address cannot be attributed.
- Cursor model: single `HorizonIndexerState` row (`prisma/schema.prisma:160-174`: `lastProcessedLedger Int`, `lastProcessedAt`, `syncStatus`, metrics). Read/write via `src/common/db.ts:16-62` (`getLastProcessedLedgerFromDB`, `updateLastProcessedLedgerInDB`). Ingest loop `ingest.repository.ts:154-157` resumes at `lastProcessedLedger + 1`; events loop `events.repository.ts:106-116,345-357`. The cursor is global, not per contract — a newly added contract starts from the shared cursor, not from its own deploy ledger.
- Contract columns: `HorizonEvent.contractId` `schema.prisma:15` (indexed `:36`), `HorizonOperation.contractId` `:135` (`:152`), `Attestation.contractAddress` `:188` (`:207`), `Schema.contractAddress` `:222` (`:240`), `Transaction.contractId` `:250` (`:265`). `HorizonTransaction` has no contract column (`:43-75`).
- Routers mounted in `src/app.ts:30-34`: `/api` (system), `/api/ingest`, `/api/data`, `/api/analytics`, `/api/registry`. Existing filters: `data.router.ts:70,211` accept `contractId` on `/api/data/events` and `/api/data/operations`; `registry.router.ts:122-132` (`/attestations`: `by_ledger, ledger, limit, offset, schema_uid, attester, subject, revoked`) and `:304-314` (`/schemas`: `deployer, authority, type, context, revocable`) have no contract filter; `attestations.repository.ts:128-135` builds the `where` from those fields only. `analytics.router.ts:153-160` `/contracts` route takes `contractIds` query defaulting to the env array. No route named `/contracts` at the registry or root level today.
- Deployment: `railway.toml:1-4` Dockerfile builder, `watchPatterns = ["apps/horizon/**"]` (changes under `contracts/stellar/` alone will not trigger a Railway rebuild); `[variables]` only `NODE_ENV`, `PORT`, `NODE_OPTIONS` `:23-26`. `Dockerfile:9-13,44-48` copy `contracts/stellar/package.json`; `:24-26` builds `stellar-contracts` then `stellar-sdk`; production stage `:55-59` copies only `dist/` directories of `core`, `stellar-sdk`, `stellar-contracts` — `contracts/stellar/deployments.json` (or a future `contracts.json`) is **not** copied into the production image unless it is inside `dist/` or added explicitly. No `.dockerignore`.
- Horizon unit tests mock `CONTRACT_IDS_TO_INDEX` (`__tests__/endpoints.unit.test.ts:21`, `indexer-sdk.unit.test.ts:15`).

### Codebase — apps/docs (Wave 5)

- `docs.json:21-64` navigation: groups Getting Started (`introduction`, `concepts/how-it-works`, `quickstart`), Concepts (`concepts/{schemas,attestations,resolvers,authorities,delegates}`), Stellar (`stellar/{getting-started,schemas,reference}`, `chains/stellar/overview`), Examples. Theme `aspen` `:6`. Mintlify CLI dev-dep `@mintlify/cli ^4.0.1109` (`package.json:13`); `mintlify` binary present in `apps/docs/node_modules/.bin` but not on PATH; `agent-browser` not installed.
- Hardcoded IDs in docs: `introduction.mdx:78-83` table; `stellar/reference.mdx:12-17` table; `stellar/getting-started.mdx:147-152` table; `concepts/authorities.mdx:62-65` code sample `contractId: 'CBFE5…'`.
- Box-drawing diagram blocks (fenced ``` with no language, containing box/arrow glyphs), exact ranges:
  - `concepts/attestations.mdx` (70 lines): 1 block, L27-31 (lifecycle `Created ──▶ Active ──▶ Expired / Revoked`).
  - `concepts/authorities.mdx` (229 lines): 1 block, L24-44 (permissionless-by-default tree).
  - `concepts/delegates.mdx` (251 lines): 2 blocks, L10-29 (authority → BLS signature → delegate → contract flow), L191-195 (batch signing fan-out).
  - `concepts/how-it-works.mdx` (64 lines): 1 block, L8-16 (Issuer → Protocol → Holder ← Verifier).
  - `concepts/resolvers.mdx` (423 lines): 1 block, L25-53 (two stacked panels: without resolver / with resolver hook sequence).
  - `concepts/schemas.mdx` (257 lines): 1 block, L10-27 (schema → attestation references).
  - Total: 7. All other fences on these pages are code samples (typescript/bash/json). No ` ```mermaid ` anywhere under `apps/docs`; `images/` contains only logos/favicon/og/chain marks (`images/{favicon.ico,favicon.svg,logo-*.svg,og.png,solana-*.svg,stellar-*.svg}`); no `images/diagrams/` directory.

### Hardcoded contract ID locations (full list, excluding node_modules/dist/target)

| File:line | ID |
|---|---|
| `README.md:38` | mainnet CBUUI… (+ mainnet authority `CBKOB6…` at `:39`) |
| `README.md:42-43` | testnet CBFE5…, testnet authority CCMJ… |
| `contracts/stellar/deployments.json:4,11` | CBFE5…, CBUUI… |
| `contracts/stellar/bindings/src/protocol.ts:37,45` | CBFE5…, CBUUI… |
| `contracts/stellar/bindings/src/protocol.md:11,33` | CBFE5… |
| `apps/horizon/.env.example:7-8` | CCMJ…, CBFE5… |
| `apps/horizon/scripts/mainnet/README.md:45,298,374` | CBUUI… |
| `apps/docs/introduction.mdx:82-83` | both |
| `apps/docs/concepts/authorities.mdx:64` | CBFE5… |
| `apps/docs/stellar/reference.mdx:16-17` | both |
| `apps/docs/stellar/getting-started.mdx:151-152` | both |

### Toolchain on this machine

- `rustc 1.97.1 (2026-07-14)`, `cargo 1.97.1`; rustup toolchains `stable` (active) and `1.85.0`; installed targets: `x86_64-unknown-linux-gnu` only — neither `wasm32v1-none` nor `wasm32-unknown-unknown`.
- `stellar` and `soroban` CLIs: not found on PATH. `deploy.sh:656` (`stellar contract build`), `:687`, `:435`, `protocol/Makefile:36` all require it. No `rust-toolchain.toml` in `contracts/stellar`.
- Expected build target from repo: `wasm32v1-none` (`protocol/Makefile:19`, `resolvers/Makefile:15`, `deploy.sh:69`).

### Architectural Responsibility Map (seed)

| Capability (from brief) | Tier today | Evidence |
|---|---|---|
| Contract build/deploy, ID capture | Infra (shell + stellar CLI) | `deploy.sh:656-737` |
| Contract address registry | Database/Storage-as-file: `contracts/stellar/deployments.json`; duplicated into generated bindings | `deployments.json`, `bindings/src/protocol.ts:34-46` |
| SDK contract resolution | Browser/Client library | `packages/stellar-sdk/src/client.ts:102-113` |
| Event ingest target selection | API/Backend env | `apps/horizon/src/common/constants.ts:35-38` |
| Ingest cursor | Database (single row) | `prisma/schema.prisma:160-174`, `src/common/db.ts:16-62` |
| Data endpoints / filters | API/Backend (Express) | `src/router/registry.router.ts:120-132,302-314`, `data.router.ts:70,211` |
| Docs contract tables | CDN/Static (Mintlify MDX, hand-edited) | `introduction.mdx:78-83`, `stellar/reference.mdx:12-17`, `stellar/getting-started.mdx:147-152` |
| Diagrams | CDN/Static (ASCII in fences) | 7 blocks listed above |
| Railway env | Infra (user-applied) | `railway.toml:23-26` carries no contract vars; they live in Railway UI |

## Open questions

- The brief says "~18 ASCII diagrams"; the repo has 7 box-drawing blocks across the six concept pages. Planner should confirm whether other fenced blocks (e.g. tree-style text in `authorities.mdx:75-90`) are also in scope.
- `Attestation`/`Schema` rows record `contractAddress` but the ingest cursor is a single global `lastProcessedLedger`; indexing a v2 contract deployed at a later ledger is fine, but adding a *second* pre-existing contract (e.g. the old authority `CBKOB6…`) would require a backfill from its own start ledger. Not resolved here.
- `constants.ts:35-38` always has length 2; if `AUTHORITY_CONTRACT_ID` is unset, `undefined` is passed into the RPC `contractIds` filter. Whether that currently errors on mainnet is not determinable from code alone.
- `soroban-release.yml:24-31` references non-existent `contracts/stellar/authority`; the `release-authority` job presumably fails on every tag. Out of this focus whether to delete it.
- `resolvers/Makefile:59,65` reference features not defined in `resolvers/Cargo.toml:20-21`.
- The `.cargo/config.toml` `-reference-types` flag targets `wasm32-unknown-unknown`; whether sdk 27 / `wasm32v1-none` needs any equivalent is an `external`-focus question.
- Dockerfile production stage does not copy `deployments.json`; a registry file consumed by horizon at runtime must be placed under a copied path or embedded in `dist/`.
- `.changeset/config.json:9` `baseBranch` is `main` while the default branch is `canary`.

## Sources

### Primary (HIGH confidence)
- In-repo files read directly, cited by `path:line` above: `contracts/stellar/{Cargo.toml,Cargo.lock,Release.toml,.cargo/config.toml,deploy.sh,deployments.json,package.json,tsconfig.json,vitest.config.ts,.gitignore}`, `contracts/stellar/protocol/{Cargo.toml,Makefile,src/**,tests/*}`, `contracts/stellar/resolvers/{Cargo.toml,Makefile,src/*}`, `contracts/stellar/bindings/{README.md,src/*}`, `contracts/stellar/__test__/*`, `packages/stellar-sdk/src/{index,client,types}.ts`, `packages/stellar-sdk/src/utils/indexer.ts`, `packages/stellar-sdk/{package.json,tsup.config.ts}`, `apps/horizon/{Dockerfile,railway.toml,.env.example,README.md,package.json}`, `apps/horizon/prisma/schema.prisma`, `apps/horizon/src/{app.ts,index.ts,common/constants.ts,common/db.ts,router/*.ts,repository/*.ts}`, `apps/docs/{docs.json,package.json,introduction.mdx,concepts/*.mdx,stellar/*.mdx}`, `.github/workflows/*.yml`, `.changeset/config.json`, `README.md`.
- Shell facts: `grep -c '#\[test\]'` totals (77), `git ls-files` for snapshot/lockfile tracking, `rustup show`, `rustc --version`, `which stellar`, `git show e2ea656 --stat`.

### Secondary (MEDIUM confidence)
- Diagram block count derived by a script that classifies fenced blocks containing box-drawing/arrow glyphs; boundaries were spot-checked against the grep of glyph lines but not every page was read end-to-end.

### Tertiary (LOW confidence)
- Inference that `release-authority` job fails on every tag (directory absent) — not verified against Actions history.
- Inference that `undefined` in `CONTRACT_IDS_TO_INDEX` reaches the RPC filter — based on the `as string` cast at `constants.ts:36-37`, not on runtime observation.
