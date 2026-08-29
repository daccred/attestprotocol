# Execution: 2026-08-29-soroban-sdk-27-v2-contracts

Append-only log of what happened during `/jira:execute`. The executor writes here; humans read it.

## Started

2026-08-29T22:40:00Z

## Branch / worktree

`jira/2026-08-29-soroban-sdk-27-v2-contracts` — no worktree (`worktree: false`), in-place on the main checkout.

## Task log

### Plan II task I: Install agent-browser and confirm `mintlify dev` renders

- **Commit:** `n/a` (no repo files changed)
- **Result:** deviated
- **Notes:**
  - `agent-browser` installed globally via npm; browser via `agent-browser install --with-deps`. Chrome needs `--args "--no-sandbox"` on this host (no usable sandbox / unprivileged userns disabled) — every `agent-browser open` in this plan passes that flag.
  - Colour-scheme emulation flag confirmed: `agent-browser set media dark|light` (also takes `reduced-motion`). No theme-toggle clicking needed.
  - Deviation: the repo-local `@mintlify/cli` (`apps/docs/node_modules/.bin/mintlify`) crashes at startup — its `ink@6`/`react-reconciler@0.32` needs React 19 but pnpm hoists React 18 from the workspace root: `TypeError: Cannot read properties of undefined (reading 'S')`. Rather than run `pnpm install` at the root (Plan I is working in the same checkout) or clobber `apps/docs/node_modules`, mintlify was installed in a throwaway dir outside the repo (`/tmp/docsqa/mint`) and run with cwd `apps/docs`. No repo file changed. Pre-existing issue, unrelated to this sprint — worth a follow-up.
  - Dev server: `http://localhost:3000` (not 3001; `mintlify dev` default).
  - Baseline screenshot captured for `/concepts/how-it-works`.

### Plan II task II: Convert the 7 box-drawing blocks to mermaid

- **Commit:** `4d2c876`
- **Result:** deviated (diagram-type choice only, within CONTEXT "Claude's discretion")
- **Notes:**
  - 8 ```mermaid fences replace the 7 ASCII blocks — `resolvers.mdx` is split into two fences (one per panel), as the plan allows.
  - `grep -n '┌\|└\|──▶\|▼' apps/docs/concepts/*.mdx` now returns nothing at all: no box glyphs remain in any fence, tagged or untagged.
  - Diagram types: how-it-works `flowchart LR`; attestations `stateDiagram-v2`; authorities `flowchart TD`; delegates (auth→delegate→contract) `sequenceDiagram`; delegates (batch) `flowchart LR`; schemas `flowchart LR`; resolvers **`flowchart LR` + `flowchart TD`** rather than the two `sequenceDiagram`s the plan suggested — neither panel is an interaction between actors over time; the second is a branch (approved/rejected), which reads far better as a flowchart. Diagram type is explicitly Claude's discretion in CONTEXT.
  - Panel/section titles kept via quoted `subgraph` ids (`subgraph W1["WITHOUT RESOLVER (Permissionless)"]`) — an unquoted subgraph title with parentheses is a mermaid parse error.
  - All six pages return HTTP 200 from `mintlify dev` with no MDX error in the server log.
  - Not touched (noted per plan): the stale "Authority Contract" prose around `how-it-works.mdx:45-47`.

### Plan I task I: Install the contract toolchain

- **Commit:** `a0cb327`
- **Result:** deviated (install method only)
- **Notes:**
  - `rustup target add wasm32v1-none` on stable (rustc 1.97.1); `rustup target list --installed` now shows `wasm32v1-none` and `x86_64-unknown-linux-gnu`.
  - Deviation: `cargo install --locked stellar-cli --version 27.1.0` fails on this host — `libdbus-sys v0.2.6` build script aborts with "The system library `dbus-1` required by crate `libdbus-sys` was not found" (no `libdbus-1-dev`, installing it needs root). `cargo-binstall` is not present either. Installed the official prebuilt release tarball instead (`stellar-cli-27.1.0-x86_64-unknown-linux-gnu.tar.gz` from the stellar/stellar-cli v27.1.0 GitHub release) into `~/.cargo/bin/stellar` — same artefact `cargo binstall` would fetch. `stellar --version` → `stellar 27.1.0 (8e402ea…)`, `stellar-xdr 27.0.0`.
  - `stellar network ls` already lists `local`, `futurenet`, `mainnet`, `testnet` — no `network add` needed.
  - Committed `contracts/stellar/rust-toolchain.toml` with `channel = "stable"`, `targets = ["wasm32v1-none"]`.

### Plan I task II: Bump soroban-sdk to 27.0.6 and fix source-level breaks

- **Commit:** `8074038`
- **Result:** deviated (two extra files, doc-comment whitespace only)
- **Notes:**
  - `contracts/stellar/Cargo.toml`: `soroban-sdk = { version = "27.0.6" }`, `[workspace.package] version = "2.0.0"` (D-20), commented-out `stellar-xdr` pin line deleted.
  - Lockfile after `cargo update -p soroban-sdk` + `cargo update`: `soroban-sdk 27.0.6`, `soroban-env-host 27.0.1`, `stellar-xdr 27.0.0` — the versions that close GHSA-pm4j-7r4q-ccg8 and GHSA-x57h-xx53-v53w.
  - `crypto.rs`: `G1Affine`/`G2Affine` → `Bls12381G1Affine`/`Bls12381G2Affine` at the import and all five use sites, plus the same names inside the HAL-07 doc comments so they do not go stale. `grep -c Bls12381G1Affine` = 6, `grep -c '\bG1Affine::'` = 0. No behaviour change (D-19 subgroup checks are Plan III task II).
  - `events.rs`: `#[allow(deprecated)]` on all six `env.events().publish(...)` statements (D-07) with the horizon-decoder comment above the first function.
  - `grep -rn "budget()\|assert_in_contract!\|bytes!(" protocol/src resolvers/src` → no matches, as expected.
  - Deviation: `cargo clippy --workspace -- -D warnings` failed on **six pre-existing** `clippy::doc_overindented_list_items` / `doc_list_item_without_indentation` findings in `protocol/src/instructions/delegation.rs` and `protocol/src/instructions/schema.rs`. These are clippy-1.97 lints, unrelated to the sdk bump, but they block the plan's `-D warnings` gate. Fixed with doc-comment whitespace only (two blank `///` separator lines in delegation.rs, four continuation lines re-indented to 2 spaces in schema.rs). `schema.rs` and `delegation.rs` are not in the plan's `files_modified`; no code changed in either.
  - `cargo build --workspace` and `cargo clippy --workspace -- -D warnings` both exit 0 with zero deprecation warnings.

### Plan I task III: Build wasm with stellar-cli and compile the test suite

- **Commit:** `6ac9427`
- **Result:** deviated (test files touched to fix compile errors, as the task anticipated)
- **Notes:**
  - `stellar contract build` (workspace) succeeds. Artefacts:
    - `target/wasm32v1-none/release/protocol.wasm` — 34220 bytes (original 37329), wasm hash `47cf005faa3c11f1669afac8a3a188ff7f3d65026e9d7c33e3ce5529dc1f5b63`, 14 exported functions.
    - `target/wasm32v1-none/release/resolvers.wasm` — 1172 bytes (original 1191), wasm hash `945541aa941b4d8ed6534f4a5aec0dba0d329dbcfa52658c80507563ecc2c0a2`, no exported functions (expected: resolver exports are feature-gated).
  - **Optimized size baseline for Plan VI/VII deploy fees:** `protocol.optimized.wasm` = **34220 bytes** — `stellar contract optimize` produced no further reduction, because `stellar contract build` already optimizes (it prints "34220 bytes optimized (original size was 37329 bytes)"). Note `stellar contract optimize` is deprecated in CLI 27.1.0 in favour of `stellar contract build --optimize`.
  - `stellar contract inspect` no longer exists on 27.x; used `stellar contract info interface --wasm ...`. All 14 expected public functions are present:
    `initialize`, `register`, `get_schema`, `attest`, `revoke`, `get_attestation`, `attest_by_delegation`, `revoke_by_delegation`, `get_attester_nonce`, `get_revoker_nonce`, `register_bls_key`, `get_bls_key`, `get_dst_for_attestation`, `get_dst_for_revocation`.
  - `cargo test --workspace --no-run` exits 0.
  - Deviation (anticipated by the task text, but the files are outside `files_modified`): 23 call sites across 5 test files failed to compile because `env.events().all()` now returns `ContractEvents`, which has no `is_empty`/`len`/`iter`/`last`. Added `all_events(&env)` to `protocol/tests/testutils.rs`, rebuilding the old `Vec<(Address, Vec<Val>, Val)>` shape from the XDR events, and replaced `env.events().all()` with `testutils::all_events(&env)` in `events_regression.rs`, `protocol_attestation_test.rs`, `protocol_cryptography_test.rs`, `protocol_initialization_and_schema.rs`, `protocol_revocation_test.rs` (adding `mod testutils;` to the four that lacked it). No assertion was weakened or removed.
  - Runtime test results are Plan III's scope and were not run here.

### Plan I finished

2026-08-29T23:10:00Z — all three tasks committed (`a0cb327`, `8074038`, `6ac9427`).

### Plan II task III: Visual QA in light and dark

- **Commit:** `307ce6d`
- **Result:** done
- **Notes:**
  - Colour scheme driven by `agent-browser set media light|dark`; Mintlify follows the emulated preference, so no theme-toggle clicking was needed. Viewport 1440x1200, each diagram scrolled into view before capture. 12 screenshots in the scratchpad (`<page>-light.png` / `<page>-dark.png`), plus `delegates-batch-<scheme>.png` for the second fence on that page and the pre-change `baseline-how-it-works.png`.
  - Verdicts:

    | Diagram | Light | Dark | Verdict |
    |---|---|---|---|
    | how-it-works — four actors | pass | pass | pass |
    | attestations — lifecycle | pass | pass | pass |
    | authorities — permissionless model | pass | pass | pass |
    | delegates — authority → delegate → contract | pass | pass | pass |
    | delegates — batch fan-out | pass | pass | pass |
    | resolvers — without resolver | pass | pass | pass |
    | resolvers — with resolver | fail (illegible) → pass | fail (illegible) → pass | fixed by layout, no theme directive |
    | schemas — schema → attestation | pass | pass | pass |

  - The one failure was a **layout**, not a theming, problem: the "with resolver" subgraph inherited a horizontal layout, so the SVG was scaled down to the content column width and node text shrank to a few pixels. `direction TB` inside the subgraph plus shorter branch labels fixed it in both schemes (commit `307ce6d`).
  - Mermaid's default theme handles Mintlify's dark mode on its own: node fills invert, label text stays high-contrast. No `%%{init: ...}%%` directive was needed anywhere.
  - No screenshot fallback was needed — `apps/docs/images/diagrams/` was never created.

### Plan II finished

2026-08-29T23:15:00Z — all three tasks complete. Commits: `4d2c876`, `307ce6d`.

Nyquist criteria for Plan II:
- [x] 8 ```mermaid fences replace all 7 box-drawing blocks (resolvers split in two); `grep -n '┌\|└\|──▶\|▼' apps/docs/concepts/*.mdx` returns nothing.
- [x] All six pages return 200 from `mintlify dev` with no MDX error in the server log.
- [x] Light and dark screenshots reviewed for all six pages; verdicts recorded above.

## Nyquist results

- [x] {{criterion}} — verified by `{{test_or_check}}`
- [ ] {{criterion}} — gap; `jira-nyquist` added `{{test_path}}`

## PR

{{pr_url_or_none}}

## Finished

{{iso_timestamp}}

### Plan III task I: Make the 77 tests pass under sdk 27 semantics

- **Commit:** `7a54344`
- **Result:** done
- **Notes:**
  - Baseline (`cargo test --workspace --no-fail-fast`, log in scratchpad `cargo-test-before.log`): **77 tests, 68 passed, 9 failed**. All nine failures had the identical root cause — `Ledger::set(...)` with `protocol_version: 22` now aborts with `HostError: Error(Context, InternalError)` / `"ledger protocol version too old for host", 22` under soroban-env-host 27.
    - `protocol_attestation_test`: `test_attestation_and_expiration`, `test_handling_expired_attestations`
    - `resolvers/tests/default_resolver.rs` (all seven): `test_metadata`, `test_accept_valid_attestation`, `test_reject_self_attestation`, `test_reject_expired_attestation`, `test_allow_revocable_attestation_revocation`, `test_reject_non_revocable_attestation_revocation`, `test_revocation_hooks`
  - Fix: three `protocol_version: 22` → `27` (attestation test lines 269 and 781, default_resolver line 17). Stale `test_snapshots/` directories deleted so they regenerate in the sdk-27 format.
  - **No other failures.** Steps 3-5 of the task turned out to be unnecessary: no test hit a CPU/memory/entry budget, so `disable_resource_limits` was added nowhere (`grep -c disable_resource_limits testutils.rs` = 0, and 0 repo-wide); no test asserted a panic on an archived entry; the `env.events().all()` shape change was already absorbed by the `all_events(&env)` helper Plan I added to `testutils.rs`.
  - **Mainnet resource finding:** none. No entrypoint, including `attest_by_delegation` / `revoke_by_delegation` / `register_bls_key`, exceeded the default test budget, so nothing approached `InvocationResourceLimits::mainnet()` in a way the suite could observe.
  - Result: **77 passed, 0 failed** across 16 test binaries. The `7 ignored` line belongs to the doc-test target — seven ```ignore-fenced examples in `protocol/src/utils.rs` and `lib.rs` that predate this sprint and are not `#[test]`s.

### Plan III task II: Close the HAL-07 residual with sdk-26 subgroup checks

- **Commit:** `PENDING2`
- **Result:** done
- **Notes:**
  - `register_bls_key`: the discarded `let _validated_pk = ...` is now a real check — `g2_is_on_curve` + `g2_is_in_subgroup` on the decoded public key, returning `Error::InvalidSignaturePoint`. Signature path: `g1_is_on_curve` + `g1_is_in_subgroup` on the caller-supplied G1 point. The stored public key is not re-checked (it was validated at registration).
  - Four comment blocks rewritten as behavioural statements: no sdk version numbers, no registry paths, no "HAL-07 residual"/trap language. `grep -c "soroban-sdk-22\|22\.0\.11"` = 0.
  - `test_hal07_all_zeros_signature_still_traps` → `test_hal07_all_zeros_signature_returns_invalid_point`; the `#[should_panic(expected = "InvokeError::Abort")]` is gone and the test now asserts `Err(Ok(InvalidSignaturePoint))` through `try_attest_by_delegation`. Two new tests: `test_hal07_off_curve_pubkey_returns_invalid_point` (via `try_register_bls_key`, plus a side-effect check that nothing was stored) and `test_hal07_off_curve_signature_returns_invalid_point`.
  - **Host behaviour worth recording:** the on-curve/subgroup predicates only apply to points whose *coordinates are in-range field elements*. The first draft of the off-curve pubkey test filled all 192 bytes with a pseudo-random pattern; the host still returned `Err(Err(Abort))`, because a 48-byte limb exceeding the field modulus is rejected during decoding, before any predicate runs. Zeroing the leading byte of each 48-byte coordinate (`i % 48 == 0`) keeps every limb in range and produces a genuine off-curve point, which the predicates then reject as `InvalidSignaturePoint`. So: malformed *encodings* with out-of-range limbs still abort; malformed *geometry* is now a structured error. Both new tests use the in-range construction, so both assert the intended path.
  - `cargo test --workspace --no-fail-fast`: **79 passed, 0 failed** (crypto binary 17 → 19). `cargo clippy --workspace -- -D warnings` exits 0 and neither new test produces a finding under `--all-targets`. `stellar contract build` succeeds.
