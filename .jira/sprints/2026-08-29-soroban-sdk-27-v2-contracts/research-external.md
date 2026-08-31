# Research: external — 2026-08-29-soroban-sdk-27-v2-contracts

## Summary

- soroban-sdk went 22 → 23 → 25 → 26 → 27 (there is no v24). 27.0.6 (2026-08-13) is latest stable; 28.0.0-rc.1 (2026-08-25) is a pre-release for Protocol 28. Mainnet runs Protocol 27 (activated 2026-07-08), SDF lists soroban-sdk 27.0.6 / stellar-cli 27.1.0 as the mainnet pairing; testnet is also P27 and not yet on P28.
- The BLS12-381 API is source-compatible across 22→27 for this repo's usage (`G1Affine::from_bytes`, `G2Affine::from_bytes`, `hash_to_g1`, `pairing_check`, `generator`, `Neg`), but v26 deprecated the short aliases (`G1Affine`→`Bls12381G1Affine`, `Fr`→`Bls12381Fr`, etc.) and added `g1_is_on_curve` / `g1_is_in_subgroup` / `g2_*` host checks — a fallible pre-check that HAL-07 said was unavailable in 22 now exists.
- Real behavioural breaks: (v23) `env.events().publish()` deprecated in favour of `#[contractevent]`; archived-entry tests no longer panic; (v25) `Env::default()` enforces mainnet resource limits and panics on overrun; `Events::all()` returns `ContractEvents`; (v26) `assert_in_contract` renamed; (v27) `bytes!` literals only hex/binary. Workspace `rust-version` for sdk 27.0.6 is 1.91.0.
- Dependabot targets are resolved by the bump: sdk 27.0.6 pins `soroban-env-host 27.0.1` (advisory GHSA-pm4j-7r4q-ccg8 patched at 26.0.0) and `stellar-xdr 27.0.0` (GHSA-x57h-xx53-v53w patched at 25.0.1). Current lock has env-host 22.1.3 / xdr 22.1.0 / sdk 22.0.11.
- stellar-cli 27.1.0 `contract bindings typescript` emits a package depending on `@stellar/stellar-sdk ^16.0.1` (v27.0.0 wrongly pinned ^14.5.0, issue #2639); `apps/horizon` is on `^14.6.1` and `packages/stellar-sdk` on `>=14.3.0` — a major JS SDK jump (v15 class-XDR rewrite, v16 base merge) rides along with regenerated bindings.

## Findings

### Standard Stack (versions, status, fit)

| Component | Version | Notes |
|---|---|---|
| soroban-sdk | 27.0.6 (2026-08-13) | Apache-2.0. Support policy: two most recent majors get critical security fixes; bugs/features only on latest. Protocol 27. Pulls soroban-env-* 27.0.1, stellar-xdr 27.0.0, stellar-strkey 0.0.16. `rust-version = 1.91.0` in workspace Cargo.toml. |
| soroban-sdk 28.0.0-rc.1 | 2026-08-25, pre-release | Protocol 28 — not on mainnet/testnet ("TBD"). Breaking: requires stellar-cli ≥ 25.2.0 spec shaking always on; removes `lib=`/`export=`; `deploy_contract`/`update_current_contract` (CAP-85); events omit unset `Option` fields (CAP-86); test snapshots change. Out of scope for this sprint but shapes what to avoid writing now. |
| Rust toolchain | ≥ 1.84 for `wasm32v1-none`; sdk 27 declares 1.91.0 | SDK README: `wasm32-unknown-unknown` is a build error on Rust ≥ 1.82 (reference-types/multi-value). "Do not build contracts with `cargo build`" — use `stellar contract build`. Repo Makefiles already use `wasm32v1-none` but call `cargo build` directly. |
| stellar-cli | 27.1.0 (2026-07-31) is SDF's mainnet pairing; 28.0.0 (2026-08-26) is latest | 27.1.0: fixes TS bindings template to `@stellar/stellar-sdk ^16.0.1`, token transfer/balance commands. 28.0.0: container builds (`--image`, `--engine`, `--cpus`, `--memory`), XDR depth limits. Release notes do not state whether 28 CLI + sdk 27 is a supported combination (see Open questions). |
| stellar-expert/soroban-build-workflow | tag v27.0.0 (2026-07-23, "update stellar cli to 27.0.0") | release.yml: `rustup update && rustup target add wasm32v1-none`, `stellar/stellar-cli@v27.0.0` with `version: '27.0.0'`, `stellar contract build --optimize`, wasm named `<pkg>_v<version>.wasm`, tag suffixed `_cli<ver>`. Repo pins `@main`, not a tag. |
| @stellar/stellar-sdk (JS) | 16.3.0 (2026-08-28, P28-compatible); 17.0.1 (2026-08-25, P28, XDR overhaul) | Generated bindings target ^16.0.1. v16: merged `@stellar/stellar-base`, no default export, `authorizeInvocation` takes object param, `contract.Client.from<T>` generic. v16.2: SEP-48 event parsing (`Spec.events()/parseEvent()`), typed event interfaces in bindings. v17: `.switch()`→`.type`, `toXDR()`→`toXdr()` — do not mix with 16-based bindings. |
| OpenZeppelin/stellar-contracts (prior art) | 0.7.2 / 0.8.0-rc.3 pinned `soroban-sdk = 27.0.2` | Confirms sdk 27 is the ecosystem target as of June 2026. |

### SOTA Updates (Old → Current)

- **Events**: `env.events().publish((topics), data)` → `#[contractevent] struct X { #[topic] a, b }` + `X{..}.publish(&env)` (sdk 23, 2025-09). `publish` still compiles but is `#[deprecated]`; topics may not contain `Vec`/`Map`/`Bytes>32`/`contracttype`. Spec now carries events (SEP-48), which the TS bindings expose as typed event interfaces (JS SDK 16.2). Default first topic = struct name lower-snake-case; `data_format = "map" | "vec" | "single-value"`; 23.1.0 added a compile error for event names over the length limit.
- **Test resource limits**: `Env::default()` now calls `set_invocation_resource_limits(Some(InvocationResourceLimits::mainnet()))` (env.rs @v27.0.6 ~line 773). Tests that exceed CPU/mem/entry/bytes limits panic. Opt-out: `env.cost_estimate().disable_resource_limits()`; custom: `enforce_resource_limits(limits)`. 27.0.3 refreshed the mainnet numbers. `env.budget()` deprecated → `env.cost_estimate().budget()`.
- **Archived entries in tests** (sdk 23): accessing an archived persistent/instance entry emulates automatic restoration instead of panicking. Tests asserting a panic on expired entries must be rewritten to assert TTL via `testutils::storage::Persistent` / `Ledger` instead.
- **Event testing** (sdk 25): `env.events().all()` returns `ContractEvents` (comparable with the old `Vec<(Address, Vec<Val>, Val)>`, `[xdr::ContractEvent; N]`, `Vec<xdr::ContractEvent>`); `filter_by_contract`, `events()`; `contractevent` types get `to_xdr(&env)` under testutils.
- **BLS12-381** (sdk 26 / CAP-80): new host functions `g1_is_on_curve`, `g1_is_in_subgroup`, `g2_is_on_curve`, `g2_is_in_subgroup`, `g1_checked_add`/`g2_checked_add` (`Option`), `G1Affine::is_in_subgroup(&self)` / `checked_add` methods. `from_bytes` remains infallible and unvalidated: rustdoc 27.0.6 says "The `from_bytes` constructor does not validate the contents—it accepts any 96 bytes ... Invalid bytes will cause the host call to trap, not construction." Full signature set at 27.0.6: `hash_to_g1(&Bytes, &Bytes) -> G1`, `pairing_check(Vec<G1>, Vec<G2>) -> bool` (panics on length mismatch or empty), `g1_add/g1_mul/g1_msm`, `fr_add/sub/mul/pow/inv`, `map_fp_to_g1`, `map_fp2_to_g2`. `Neg` is implemented for owned and borrowed `G1Affine`.
- **Naming** (sdk 26): `bls12_381::{G1Affine, G2Affine, Fp, Fp2, Fr}` deprecated aliases → `Bls12381G1Affine`, `Bls12381G2Affine`, `Bls12381Fp`, `Bls12381Fp2`, `Bls12381Fr`; `crypto::BnScalar` deprecated. Motivation: `bn254::Fr` silently mapped to the BLS scalar in spec output.
- **Fr security fix** (GHSA-x2hw-px52-wp4m, moderate, patched 22.0.11 / 23.5.3 / 25.3.0): `Fr` constructors did not reduce mod r, so equal scalars could compare unequal. 27.x includes the fix. Repo lock is already on 22.0.11.
- **TTL** (sdk 26 / CAP-78): `extend_ttl_with_limits(key, min_extension, max_extension)` on `Persistent`, `Instance`, `Deployer` — "extension only happens if it exceeds `min_extension` ledgers, otherwise no-op". `extend_ttl(key, threshold, extend_to)` unchanged.
- **Auth**: no changes to `require_auth` / `mock_all_auths` in 23–27. v27 adds CAP-71 `CustomAccount::delegate_auth` / `get_delegated_signers` (custom-account contracts only). 27.0.2: `register`/`register_at` now record auth for native constructors ("Both methods invoke constructors with authorization mocked").
- **Ledger**: `env.ledger().protocol_version()` deprecated in 23.2.1. Repo tests hardcode `LedgerInfo { protocol_version: 22, .. }` (`protocol/tests/protocol_attestation_test.rs:268,780`, `resolvers/tests/default_resolver.rs:17`) — env-host 27 bounds-checks protocol version (`check_protocol_version_lower_bound`), see Pitfalls.
- **Env::from_ledger_snapshot** (23.4.0): accepts custom snapshot sources; 25.0.0 compact snapshot format (~35% smaller), reads old format. `Env::default` vs snapshot semantics otherwise unchanged; test snapshot JSON will regenerate on upgrade.
- **contracttrait** (23.4.0, documented in v25 notes): `#[contracttrait]` + `#[contractimpl(contracttrait)]` generates `{Trait}Client/Args/Spec` and exports default impls. 27.0.6 makes `contracttrait` on a non-trait impl a compile error.
- **contractmeta**: `contractmeta!(key = "...", val = "...")` unchanged; 23.0.0 allows `env!()`/`concat!()` in values. `stellar contract build --meta k=v` adds entries from the CLI. Contract Source Validation SEP (draft, stellar discussions #1573) standardises `source_repo` (`github:<org>/<repo>`) and `home_domain` meta keys; soroban-build-workflow has a `home_domain` input.
- **Spec shaking**: 25.2.0 added opt-in `experimental_spec_shaking_v2` (needs stellar-cli ≥ 25.2.0); 26.1.0/27 deprecate `export = ...` under it; 28 makes it mandatory and removes `lib=`/`export=`. Not using the feature = nothing to do in 27; avoid adding `export=`/`lib=` args now.
- **bytes! literal** (sdk 27): decimal integers rejected, use `0x..`/`0b..`; array form unaffected.
- **Deploy/upgrade**: `deploy_v2` / `update_current_contract_wasm` are current in 27; 28 renames them to `deploy_contract` / `update_current_contract` taking `ContractExecutable`. SDF docs' upgrade guide is admin-gated `update_current_contract_wasm(new_wasm_hash)` with a `version()` getter — the pattern this repo lacks (brief: no upgrade path).

### Migration checklist sdk 22.0.8 → 27.0.6 (source-derived, ordered)

1. Toolchain: `rustup update` to ≥ 1.91 (sdk `rust-version`); `rustup target add wasm32v1-none`; install stellar-cli 27.1.0 (or 28.0.0 — see Open questions). Build via `stellar contract build`, not bare `cargo build --target wasm32v1-none` (SDK README).
2. `contracts/stellar/Cargo.toml`: `soroban-sdk = "27.0.6"`; regenerate `Cargo.lock`; confirm lock shows env-host 27.0.1 / stellar-xdr 27.0.0 (closes both Dependabot alerts). Any `soroban-token-sdk` usage: `TokenUtils::events()` and legacy `event` module were removed in 26.
3. Crypto: rename `crypto::bls12_381::{G1Affine, G2Affine}` → `Bls12381G1Affine`/`Bls12381G2Affine` (deprecation warnings otherwise; blocks `-D warnings`). Optional: replace HAL-07 flag-byte pre-check with `env.crypto().bls12_381().g1_is_on_curve(&p) && g1_is_in_subgroup(&p)` (and g2 equivalents) to return `Err(InvalidSignaturePoint)` instead of trapping — CAP-80 host functions cost fees but are the "fallible host API" the code comment says did not exist.
4. Events: 12 `env.events().publish(` call sites → `#[contractevent]` structs. Note `contractevent` changes the wire shape (map data keyed by field name, first topic = struct name) — coordinate with horizon's event decoders and the `events_regression.rs` test which already guards a tuple layout. Keep old layout only if `data_format = "vec"` and explicit `topics = [...]` reproduce it exactly.
5. Tests (132 `Env::default`, 250 `.register(`): (a) resource-limit panics — either optimise or `env.cost_estimate().disable_resource_limits()` per test; (b) `LedgerInfo.protocol_version: 22` → 27 (or drop; default_ledger_info sets it); (c) any test expecting a panic on archived/expired entry → assert TTL instead; (d) `env.budget()` → `env.cost_estimate().budget()`; (e) `events().all()` comparisons compile unchanged in most cases; (f) snapshot JSON files regenerate (compact format).
6. `assert_in_contract!` → `debug_assert_in_contract!`; `bytes!(&env, 1)` → `0x1`; remove any `export=`/`lib=` args on `contracttype`/`contracterror`/`contractevent` (forward-compat with 28); `contractimpl(contracttrait)` only on real trait impls.
7. Makefiles / CI: `resolvers/Makefile` and `protocol/Makefile` use `cargo build --target wasm32v1-none --release` — switch to `stellar contract build --package <pkg> --out-dir ...` (also required for spec shaking later). `soroban-release.yml` pins workflow `@main` (currently CLI 27.0.0); pin to `@v27.0.0` for reproducibility.
8. Bindings: `stellar contract bindings typescript --contract-id <id> --network testnet --output-dir contracts/stellar/bindings --overwrite`. Output: `package.json` (`@stellar/stellar-sdk ^16.0.1`, `buffer 6.0.3`, `"exports": "./dist/index.js"`, `typings dist/index.d.ts`, `build: tsc`), `src/index.ts` exporting `networks = { testnet: { networkPassphrase, contractId } }` (key derived from passphrase: `testnet`/`futurenet`/`local`/`public`), `Client extends ContractClient` with per-method `AssembledTransaction<T>`, `Errors` map, typed event interfaces. `--wasm` (local file) generates without a contract ID; `--contract-id` bakes it in.
9. JS: consumers of regenerated bindings must move to `@stellar/stellar-sdk` 16.x (horizon is on `^14.6.1`, `packages/stellar-sdk` peer `>=14.3.0`). v15/v16 breaking changes listed above.

### Contract address registry — prior art

- **Soroswap** (`soroswap/core`, `public/`): per-network JSON `mainnet.contracts.json` / `testnet.contracts.json`, shape `{ "ids": { factory, router }, "hashes": { pair, factory, router, token } }`; old deployments kept as sibling folders `backup-YYYY-MM-DD/` and `mainnet-deployment-2024-03/`; served statically (Vercel) plus `/api/<network>/factory` endpoints. No `current` pointer — a new deploy overwrites the file, history lives in backup dirs.
- **Blend** (`blend-capital/blend-utils`): same `{ ids, hashes }` shape per network (`mainnet.contracts.json`, `testnet.contracts.json`, `futurenet.contracts.json`). Versioning is by key suffix inside `ids` (`backstop` / `backstopV2`, `poolFactory` / `poolFactoryV2`, `FixedV2`), plus `wasm_v1/` and `wasm_v2/` directories. `hashes` records the installed wasm hashes.
- **Stellar Registry** (`stellar-registry-cli` 0.0.21, stellar.rgstry.xyz): on-chain registry contract separating published WASMs (`wasm-name`, `binver`) from deployed instances (`contract-name`); `publish` / `deploy --version` / `install` (registers an alias for stellar-cli). Early-stage (0.x), testnet + mainnet.
- **SEP-1 stellar.toml**: no general contracts section; only `WEB_AUTH_CONTRACT_ID` and `[[CURRENCIES]].contract`. Contract Source Validation SEP (draft v0.4.0) covers wasm→repo attestation via `contractmeta` keys, not address listing.
- **stellar-cli bindings** `networks` export is itself a tiny per-network registry keyed by passphrase-derived name, single contract per package.
- Net: ecosystem convention is per-network JSON with `ids` + `hashes`; versioning is ad hoc (suffix keys or backup dirs). Nothing external defines a `current` pointer or `deployedAt`/`sdk` metadata — the brief's `{network: {v1, v2, current}}` shape is a superset that stays compatible if `ids`-style access is also exposed.

### Mintlify — mermaid and value reuse

- Syntax: a fenced ```` ```mermaid ```` block; any Mermaid diagram type. Props on the fence: `actions={true|false}` (controls auto-show when height > 120px), `placement="top-left|top-right|bottom-left|bottom-right"`. ELK renderer via `%%{init: {'flowchart': {'defaultRenderer': 'elk'}}}%%` for large graphs. Built-in zoom/pan/reset controls.
- Theming/dark mode: the official page documents no theme option and no dark-mode behaviour. The `theme={null}` seen on the docs page's own fences is not documented as a user prop. Mermaid's own config supports `theme: 'dark'` and `darkMode: true` via the `%%{init: {...}}%%` directive, but whether Mintlify re-renders on colour-scheme switch is unverified (general Mermaid ecosystem reports: diagrams don't re-render on `prefers-color-scheme` change; default theme has low contrast on dark backgrounds — GitHub community discussions #12116, #35733, #172498). Visual QA in both modes is the only reliable check; the brief's screenshot fallback covers this.
- Snippets: files under `/snippets/` are never rendered as pages. Import with `import X from "/snippets/x.mdx"`, tag name must be capitalised. Props: `{word}` in snippet, `<X word="..."/>` at use site; variables also interpolate inside fenced code blocks. Exported constants: `export const contractId = "C..."` in a snippet `.mdx`, then `import { contractId } from "/snippets/contracts.mdx"` and `{contractId}` in prose — this is the documented mechanism for reusing one contract ID across pages. `.jsx` snippet components must be arrow functions. Snippets are not supported in the web editor (CLI/git only).

### Railway env conventions

- Official docs define reference syntax `${{ shared.KEY }}`, `${{ SERVICE.VAR }}`, multi-line values (Ctrl/Cmd+Enter or Raw Editor), Raw Editor accepting `.env` or JSON paste, and sealed variables (hidden, not copied to PR envs, unavailable via CLI). No array/list type and no documented delimiter convention.
- Community (Railway Help Station): comma-separated strings work; apparent trailing semicolons are a terminal display artifact, values are clean. So `INDEX_CONTRACT_IDS=C...,C...` with app-side `split(',')` is the de facto pattern; nothing in Railway enforces or parses it.

### Common Pitfalls (library-reported)

- Tests panic after bump with "resource limits exceeded" — expected per v25 migration note; decide per-test whether to optimise or disable (`disable_resource_limits`). Warning sign: only heavy tests (BLS pairing, large vec loops) fail.
- `LedgerInfo { protocol_version: 22 }` in tests: env-host 27 enforces protocol bounds; hardcoding an old protocol can error or silently gate features. Warning sign: host errors mentioning protocol version on `env.ledger().set(..)`.
- `#[deprecated]` warnings from `publish`, `G1Affine`, `Fr`, `budget()`, `assert_in_contract` fail CI if `RUSTFLAGS=-D warnings` or `#![deny(warnings)]`.
- `pairing_check` panics on empty or mismatched-length vectors (rustdoc) — not a `false` return.
- `from_bytes` is unvalidated; traps happen inside the host call. HAL-07 residual stays unless `g*_is_on_curve`/`is_in_subgroup` are called first (costs fees; on-curve alone is insufficient for subgroup safety).
- Building with `cargo build --target wasm32-unknown-unknown` on Rust ≥ 1.82 fails; `wasm32v1-none` via bare `cargo build` compiles but SDK README says only `stellar contract build` applies the required settings; spec shaking v2 exits 1 without the CLI env var (`SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2`).
- stellar-cli 27.0.0's TS template pinned `@stellar/stellar-sdk ^14.5.0` (issue #2639) — use ≥ 27.1.0 to generate bindings or the package will lack AddressV2 auth support.
- JS SDK 17 changed XDR API (`.switch()`→`.type`, `toXDR`→`toXdr`); bindings generated for ^16 break if a consumer resolves 17.
- `contractevent` with `data_format="map"` (default) will, from sdk 28, omit `None` fields unless `sparse=false`; indexers written now should tolerate absent keys.
- `register`/`register_at` mock constructor auth (27.0.2 changed recording) — constructor auth cannot be negatively tested.
- Snapshot files: 25 compact format and 28 per-contract code entries both regenerate `test_snapshots/` JSON; expect large diffs.
- `soroban-release.yml` uses `@main` of the build workflow, which moved from CLI 25.1.0 to 27.0.0 in July 2026 without notice — unpinned builds can change toolchain between runs.

## Open questions

- Is stellar-cli 28.0.0 supported for building/deploying sdk-27 contracts to a P27 mainnet? SDF pairs 27.1.0 with mainnet; 28 notes are silent. Needs a test build or a maintainer statement.
- Exact `InvocationResourceLimits::mainnet()` numbers at 27.0.3 vs what the BLS-verifying entrypoints consume — cannot be known without running `cargo test` (codebase/verification task, not external).
- Which of the 12 `publish(` sites' wire layouts horizon depends on (codebase focus) — determines whether `contractevent` can be adopted in v2 without an indexer change.
- Mintlify dark-mode mermaid behaviour is undocumented; needs the planned agent-browser QA in both colour schemes.
- Whether the repo's `packages/stellar-sdk` peer range `>=14.3.0` should become `>=16 <17` when bindings regenerate — release/major-bump decision for the planner.
- soroban-build-workflow has no `v27.1.0` tag; pinning to `@v27.0.0` gives CLI 27.0.0 (the one with the bad TS template — irrelevant for wasm builds, relevant only if bindings are generated in CI).

## Sources

### Primary (HIGH confidence)
- https://github.com/stellar/rs-soroban-sdk/releases — release bodies for v23.0.0, 23.1.0–23.5.3, 25.0.0–25.3.2, 26.0.0, 26.1.0, 27.0.0–27.0.6, 28.0.0-rc.1, 22.0.9–22.0.11 (read via `gh api`).
- https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/index.html and `soroban-sdk/src/_migrating/{v23_archived_testing,v23_contractevent,v25_bn254,v25_contracttrait,v25_event_testing,v25_resource_limits,v27_bytes_literals,v27_export}.rs` @v27.0.6 — official migration guide.
- `rs-soroban-sdk` `Cargo.toml` @v27.0.6 — `rust-version = 1.91.0`, env-* 27.0.1, stellar-xdr 27.0.0; `README.md` @v27.0.6 — support policy, wasm32v1-none target rules; `soroban-sdk/src/env.rs` @v27.0.6 — `Env::default` sets `InvocationResourceLimits::mainnet()`; `testutils/cost_estimate.rs` @v27.0.6 — `enforce_resource_limits` / `disable_resource_limits`.
- https://docs.rs/soroban-sdk/27.0.6/soroban_sdk/crypto/bls12_381/ (module, `Bls12_381`, `Bls12381G1Affine`), `storage/struct.Persistent.html`, `events/struct.Events.html`, `attr.contractevent.html`, `struct.Env.html`, `macro.contractmeta.html`.
- Advisories: GHSA-x2hw-px52-wp4m (rs-soroban-sdk), GHSA-pm4j-7r4q-ccg8 (rs-soroban-env, patched 26.0.0), GHSA-x57h-xx53-v53w (rs-stellar-xdr, patched 25.0.1).
- https://developers.stellar.org/docs/networks/software-versions — mainnet P27 (2026-07-08), sdk 27.0.6 / cli 27.1.0; testnet P27 (2026-06-18).
- https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup — Rust ≥ 1.84, `wasm32v1-none`, cli 28.0.0 install.
- https://github.com/stellar/stellar-cli/raw/refs/heads/main/FULL_HELP_DOCS.md — `bindings typescript` flags; `cmd/crates/soroban-spec-typescript/src/{project_template/package.json, project_template/src/index.ts, boilerplate.rs}` @v27.1.0 and package.json @v28.0.0 — output shape and `networks` export.
- https://github.com/stellar/stellar-cli/issues/2639 — TS template sdk pin bug and fix.
- https://github.com/stellar/stellar-cli/releases (v25.2.0–v28.0.0), https://github.com/stellar/js-stellar-sdk/releases.
- `stellar-expert/soroban-build-workflow` `.github/workflows/release.yml`, tags, recent commits.
- https://www.mintlify.com/docs/components/mermaid-diagrams.md, https://www.mintlify.com/docs/create/reusable-snippets, https://docs.railway.com/guides/variables.
- In-repo (read-only, scoping): `contracts/stellar/Cargo.toml:13`, `Cargo.lock` (sdk 22.0.11, env-host 22.1.3, xdr 22.1.0), `protocol/src/instructions/crypto.rs:100-220`, `protocol/tests/protocol_attestation_test.rs:268,780`, `resolvers/tests/default_resolver.rs:17`, `protocol/Makefile:19`, `resolvers/Makefile:17,53`, `.github/workflows/soroban-release.yml:25-40`, `apps/horizon/package.json:43`, `packages/stellar-sdk/package.json:54`.

### Secondary (MEDIUM confidence)
- `soroswap/core` `public/*.contracts.json` and `blend-capital/blend-utils` `*.contracts.json` — read directly, but they document practice, not a standard.
- `OpenZeppelin/stellar-contracts` `Cargo.toml` pin `soroban-sdk = 27.0.2` — read directly; used only as ecosystem-adoption evidence.
- https://github.com/orgs/stellar/discussions/1573 (Contract Source Validation SEP, draft) and SEP-1 — official repos, but SEP is draft/unadopted.
- https://developers.stellar.org/docs/build/guides/conventions/upgrading-contracts — official, but general guidance.
- Railway Help Station thread on comma-separated vars — vendor forum with staff reply, single thread.

### Tertiary (LOW confidence)
- Mermaid dark-mode behaviour under Mintlify — inferred from generic Mermaid/GitHub community discussions (#12116, #35733, #172498), not Mintlify-specific; validate visually.
- `stellar-registry-cli` README (docs.rs 0.0.21) — single source, 0.x project.
- WebFetch summaries of stellar-cli release pages (v26–v28) where the page partially failed to load; flag-level claims cross-checked against FULL_HELP_DOCS.md but feature lists are summarised.
