---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
plan: III
wave: II
goal: Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
worktree: false
branch: jira/2026-08-29-soroban-sdk-27-v2-contracts
issue: none
depends_on: [I]
parallel_with: [IV]
files_modified:
  - contracts/stellar/protocol/tests/protocol_attestation_test.rs
  - contracts/stellar/protocol/tests/protocol_cryptography_test.rs
  - contracts/stellar/protocol/tests/protocol_delegation_test.rs
  - contracts/stellar/protocol/tests/testutils.rs
  - contracts/stellar/resolvers/tests/default_resolver.rs
  - contracts/stellar/protocol/src/instructions/crypto.rs
  - contracts/stellar/protocol/Makefile
  - contracts/stellar/resolvers/Makefile
  - contracts/stellar/.cargo/config.toml
  - .github/workflows/soroban-release.yml
covers:
  - D-16
  - D-19
  - "RESEARCH: resource-limit panics, protocol_version 22, archived-entry semantics (migration steps 5-7)"
  - "RESEARCH: Makefiles call bare cargo build; soroban-release.yml pinned to @main with a dead release-authority job"
  - "GOAL: 77 cargo tests green"
---

# Plan III: Tests green on sdk 27, HAL-07 subgroup checks, build tooling

**Sprint goal:** Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
**Worktree:** false — sequential waves share `node_modules`, `target/` and `dist/` build caches on one checkout, and Plans VI/VII need the deployed registry state of that same checkout.
**This plan delivers:** all 77 `#[test]`s passing under sdk 27.0.6, the v2 contract validating BLS points with the sdk-26 host checks, and Makefiles/CI aligned with `stellar contract build` and stellar-cli 27.

## Tasks

### I. Make the 77 tests pass under sdk 27 semantics

- **Files:** `contracts/stellar/protocol/tests/protocol_attestation_test.rs`, `contracts/stellar/protocol/tests/protocol_cryptography_test.rs`, `contracts/stellar/protocol/tests/protocol_delegation_test.rs`, `contracts/stellar/protocol/tests/testutils.rs`, `contracts/stellar/resolvers/tests/default_resolver.rs` (others only if they fail)
- **Read first:** the failing test files as reported by `cargo test`; `research-external.md` "SOTA Updates" and "Migration checklist" step 5; RESEARCH.md "Common Pitfalls" (resource limits, protocol_version)
- **Action:**
  1. `cd contracts/stellar && cargo test --workspace 2>&1 | tee /tmp/claude-1000/-home-rain-workspace/250a175c-dd56-4c23-9dc6-99127235add5/scratchpad/cargo-test-before.log`; record the failing test names in EXECUTION.md.
  2. `protocol_attestation_test.rs:268,780` and `resolvers/tests/default_resolver.rs:17`: change `protocol_version: 22` to `protocol_version: 27`.
  3. For each test that panics with a CPU/memory/entry budget message: apply `env.cost_estimate().disable_resource_limits();` immediately after `let env = Env::default();` in that test only (Claude's discretion in CONTEXT.md), with a one-line comment naming the limit hit. Never add it to `testutils.rs` helpers. If any test exercising a single `attest_by_delegation` / `revoke_by_delegation` / `register_bls_key` call exceeds `InvocationResourceLimits::mainnet()`, record the test name and the reported budget in EXECUTION.md under "Mainnet resource finding".
  4. Any test asserting a panic on an archived/expired entry (sdk 23 change) is rewritten to assert the entry's TTL via `soroban_sdk::testutils::storage::Persistent` / `Ledger` instead.
  5. `env.events().all()` comparisons that fail to compare: convert the expected `Vec` to the shape `ContractEvents` implements `PartialEq` against (see sdk-25 event-testing migration note); do not weaken the assertion.
  6. Snapshots under `test_snapshots/` are gitignored; delete the stale local ones (`rm -rf protocol/test_snapshots resolvers/test_snapshots`) so they regenerate in the new compact format.
- **Done when:** `cd contracts/stellar && cargo test --workspace 2>&1 | grep -E "^test result"` shows every line `ok` and the summed `passed` count is 77 with 0 failed and 0 ignored; `grep -rn "protocol_version: 22" contracts/stellar` returns nothing; `grep -c "disable_resource_limits" contracts/stellar/protocol/tests/testutils.rs` = 0.
- **Covers:** GOAL 77 tests green, RESEARCH migration step 5

### II. Close the HAL-07 residual with sdk-26 subgroup checks

- **Files:** `contracts/stellar/protocol/src/instructions/crypto.rs`, `contracts/stellar/protocol/tests/protocol_cryptography_test.rs`
- **Read first:** `crypto.rs` lines 100-400 (after Plan I's rename), `protocol_cryptography_test.rs` lines 880-1200 (`test_hal07_*`), https://docs.rs/soroban-sdk/27.0.6/soroban_sdk/crypto/bls12_381/struct.Bls12_381.html (`g1_is_on_curve`, `g1_is_in_subgroup`, `g2_is_on_curve`, `g2_is_in_subgroup`)
- **Action:** Per D-19.
  1. In `register_bls_key` (around `crypto.rs:243`): after `validate_g2_point_bytes(&public_key)?;` replace `let _validated_pk = Bls12381G2Affine::from_bytes(public_key.clone());` with
     ```rust
     let pk_point = Bls12381G2Affine::from_bytes(public_key.clone());
     let bls = env.crypto().bls12_381();
     if !bls.g2_is_on_curve(&pk_point) || !bls.g2_is_in_subgroup(&pk_point) {
         return Err(Error::InvalidSignaturePoint);
     }
     ```
  2. In the signature verification path (around `crypto.rs:369-379`): after `validate_g1_point_bytes(signature)?;` and `let s = Bls12381G1Affine::from_bytes(signature.clone());` add the same guard with `g1_is_on_curve(&s)` / `g1_is_in_subgroup(&s)` returning `Error::InvalidSignaturePoint`. The stored public key was validated at registration; no second G2 check there.
  3. Rewrite the comment blocks at `crypto.rs:127-168`, `:170-200`, `:225-245`, `:355-370` as behavioural statements ("flag-byte check rejects compressed/infinity encodings; host on-curve and subgroup checks reject geometrically invalid points with `InvalidSignaturePoint`; `from_bytes` itself does not validate") with no sdk version numbers or line references (RESEARCH "not to imitate").
  4. Tests: `test_hal07_all_zeros_signature_still_traps` (`protocol_cryptography_test.rs:1033`) now expects `Err(Error::InvalidSignaturePoint)` via the `try_` client method — rename it `test_hal07_all_zeros_signature_returns_invalid_point`. Add `test_hal07_off_curve_pubkey_returns_invalid_point` (192 bytes with clean flag byte but random coordinates → `try_register_bls_key` returns `Err(Ok(Error::InvalidSignaturePoint))`) and `test_hal07_off_curve_signature_returns_invalid_point` (96 bytes, same pattern, through `try_attest_by_delegation`). If the host traps inside `g*_is_on_curve` for a specific input instead of returning `false`, keep that test's assertion as the observed behaviour, name it accordingly, and record it in EXECUTION.md.
  5. `cargo test --workspace` and `cargo clippy --workspace -- -D warnings` exit 0; `stellar contract build` still succeeds.
- **Done when:** `grep -c "g1_is_in_subgroup\|g2_is_in_subgroup" contracts/stellar/protocol/src/instructions/crypto.rs` = 2; `grep -n "still_traps" contracts/stellar/protocol/tests/protocol_cryptography_test.rs` returns nothing; `grep -c "soroban-sdk-22\|22\.0\.11" contracts/stellar/protocol/src/instructions/crypto.rs` = 0; test total is now 79 passed, 0 failed.
- **Covers:** D-19, RESEARCH "Don't Hand-Roll: BLS point validation"

### III. Align Makefiles, cargo config and the release workflow with stellar-cli 27

- **Files:** `contracts/stellar/protocol/Makefile`, `contracts/stellar/resolvers/Makefile`, `contracts/stellar/.cargo/config.toml`, `.github/workflows/soroban-release.yml`
- **Read first:** all four files; `research-codebase.md` "Workspace and build config"; `research-external.md` "Standard Stack — Supporting" (soroban-build-workflow `@v27.0.0`)
- **Action:**
  1. `protocol/Makefile` `build` target: replace `cargo build --target wasm32v1-none --release` with `stellar contract build --package protocol`. Replace the example ID comment line 14 (`CB3NF4...`) with `# make events ID=<contract id from bindings/src/contracts.json> START_LEDGER=<ledger>`.
  2. `resolvers/Makefile`: `build` uses `stellar contract build --package resolvers --features export-default-resolver`; delete the `build-token` and `build-fee` targets (lines ~59,65) whose features do not exist in `resolvers/Cargo.toml:20-21`, and remove them from any aggregate target.
  3. `.cargo/config.toml`: the `[target.wasm32-unknown-unknown]` rustflags block is dead (every path builds `wasm32v1-none`); delete it. If the file becomes empty, delete the file.
  4. `.github/workflows/soroban-release.yml`: per D-16 delete the `release-authority` job (lines 24-32) and change both `@main` refs to `@v27.0.0` (only `release-protocol` remains). Update the "Usage Notes" comment to describe a single `<tag>-protocol` release. Keep `on.push.tags: ['v*']`.
- **Done when:** `grep -c "stellar contract build" contracts/stellar/protocol/Makefile contracts/stellar/resolvers/Makefile` shows 1 each; `grep -n "build-token\|build-fee\|export-token-reward-resolver\|export-fee-collection-resolver" contracts/stellar/resolvers/Makefile` returns nothing; `grep -n "wasm32-unknown-unknown" contracts/stellar/.cargo/config.toml` returns nothing (or file absent); `grep -c "release-authority\|contracts/stellar/authority" .github/workflows/soroban-release.yml` = 0 and `grep -c "release.yml@v27.0.0" .github/workflows/soroban-release.yml` = 1; `cd contracts/stellar/protocol && make build` exits 0.
- **Covers:** D-16, RESEARCH migration step 7

## Nyquist criteria for this plan

- [ ] `cargo test --workspace` in `contracts/stellar`: 79 passed (77 original + 2 new HAL-07), 0 failed.
- [ ] `cargo clippy --workspace -- -D warnings` exits 0.
- [ ] `make build` in `protocol/` and `resolvers/` invokes `stellar contract build` and succeeds.
- [ ] `soroban-release.yml` has one job pinned to `@v27.0.0`.

## Risks accepted in this plan

- The extra on-curve/subgroup host calls add fees to `register_bls_key` and delegated attest/revoke; the trade (structured error instead of a trap that still costs the submitter) is accepted per D-19.
- Whether `g*_is_on_curve` returns `false` or traps for all-zero input is only knowable by running the test; the plan accepts either as long as the test name states the behaviour.
- The stellar-expert workflow's `@v27.0.0` bundles stellar-cli 27.0.0, which is fine for wasm builds (its TS-template bug only affects bindings, which are generated locally with 27.1.0).
