---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
plan: I
wave: I
goal: Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
worktree: false
branch: jira/2026-08-29-soroban-sdk-27-v2-contracts
issue: none
depends_on: []
parallel_with: [II]
files_modified:
  - contracts/stellar/Cargo.toml
  - contracts/stellar/Cargo.lock
  - contracts/stellar/protocol/src/instructions/crypto.rs
  - contracts/stellar/protocol/src/events.rs
  - contracts/stellar/rust-toolchain.toml
covers:
  - D-07
  - D-08
  - D-20
  - "RESEARCH: migration checklist steps 1-3 (toolchain, Cargo pin, BLS alias rename)"
  - "RESEARCH: Dependabot alerts closed by env-host 27.0.1 / stellar-xdr 27.0.0"
  - "GOAL: upgrade contracts/stellar to soroban-sdk 27.0.6 and compile"
---

# Plan I: Toolchain and soroban-sdk 27 compile

**Sprint goal:** Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
**Worktree:** false — sequential waves share `node_modules`, `target/` and `dist/` build caches on one checkout, and Plans VI/VII need the deployed registry state of that same checkout.
**This plan delivers:** the Rust workspace on soroban-sdk 27.0.6 compiling for host and `wasm32v1-none`, with stellar-cli 27.1.0 installed and the lockfile resolving the patched env-host/xdr crates. Tests are compiled (`--no-run`) here; making them pass is Plan III.

## Tasks

### I. Install the contract toolchain

- **Files:** `contracts/stellar/rust-toolchain.toml` (new)
- **Read first:** `.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/research-external.md` ("Standard Stack", "Migration checklist" step 1), `.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/research-codebase.md` ("Toolchain on this machine")
- **Action:** Per D-08.
  1. `rustup target add wasm32v1-none` (stable toolchain, rustc 1.97.1 already present; sdk MSRV is 1.91).
  2. Install stellar-cli exactly 27.1.0: `cargo install --locked stellar-cli --version 27.1.0` (use `cargo binstall stellar-cli --version 27.1.0` if `cargo-binstall` is present; either way `stellar --version` must print `stellar 27.1.0`). Do not install 28.x.
  3. Create `contracts/stellar/rust-toolchain.toml`:
     ```toml
     [toolchain]
     channel = "stable"
     targets = ["wasm32v1-none"]
     ```
  4. Confirm `stellar network ls` includes `testnet` and `mainnet`; if `mainnet` is missing add it with `stellar network add mainnet --rpc-url https://mainnet.sorobanrpc.com --network-passphrase "Public Global Stellar Network ; September 2015"`.
- **Done when:** `stellar --version` prints `stellar 27.1.0`; `rustup target list --installed` contains `wasm32v1-none`; `cat contracts/stellar/rust-toolchain.toml` shows the block above.
- **Covers:** D-08

### II. Bump soroban-sdk to 27.0.6 and fix source-level breaks

- **Files:** `contracts/stellar/Cargo.toml`, `contracts/stellar/Cargo.lock`, `contracts/stellar/protocol/src/instructions/crypto.rs`, `contracts/stellar/protocol/src/events.rs`
- **Read first:** `contracts/stellar/Cargo.toml`, `contracts/stellar/protocol/Cargo.toml`, `contracts/stellar/resolvers/Cargo.toml`, `contracts/stellar/protocol/src/instructions/crypto.rs` (lines 100-400), `contracts/stellar/protocol/src/events.rs`, `research-external.md` "Migration checklist" steps 2-3 and "SOTA Updates"
- **Action:**
  1. `contracts/stellar/Cargo.toml:12`: `soroban-sdk = { version = "27.0.6" }`. `[workspace.package] version = "2.0.0"` per D-20. Leave the commented `stellar-xdr` pin removed (delete the comment line).
  2. `cd contracts/stellar && cargo update -p soroban-sdk` then `cargo update` for transitive crates. Verify with `grep -A1 'name = "soroban-env-host"' Cargo.lock` → `version = "27.0.1"` and `grep -A1 'name = "stellar-xdr"' Cargo.lock` → `version = "27.0.0"`; these are the versions that close the two open Dependabot alerts (GHSA-pm4j-7r4q-ccg8, GHSA-x57h-xx53-v53w).
  3. `crypto.rs:103`: change `crypto::bls12_381::{G1Affine, G2Affine}` to `crypto::bls12_381::{Bls12381G1Affine, Bls12381G2Affine}` and update every `G1Affine::`/`G2Affine::` use at lines 243, 375, 379, 387 (and the `Neg` result type if annotated). Do not change behaviour here; D-19 (subgroup checks) is Plan III task II.
  4. `events.rs`: per D-07 put `#[allow(deprecated)]` on each of the six `env.events().publish(...)` statements (attribute on the statement, or on each function) and add one comment above the first function: `// Tuple topics/data are what apps/horizon decodes (ingest/backfill/events repositories). Moving to #[contractevent] changes that wire layout and is a coordinated change.`
  5. Search for other deprecated/removed uses and fix any found: `grep -rn "budget()\|assert_in_contract!\|bytes!(" protocol/src resolvers/src` (expected: none).
  6. `cargo build --workspace` and `cargo clippy --workspace -- -D warnings` must both exit 0 with zero deprecation warnings.
- **Done when:** `grep -n 'soroban-sdk = { version = "27.0.6" }' contracts/stellar/Cargo.toml` matches; `grep -n 'version = "2.0.0"' contracts/stellar/Cargo.toml` matches; `grep -c "Bls12381G1Affine" contracts/stellar/protocol/src/instructions/crypto.rs` ≥ 3 and `grep -c "\bG1Affine::" ` = 0; `grep -c "#\[allow(deprecated)\]" contracts/stellar/protocol/src/events.rs` = 6 (or 6 functions annotated); `cd contracts/stellar && cargo clippy --workspace -- -D warnings` exits 0; lockfile shows env-host 27.0.1 and stellar-xdr 27.0.0.
- **Covers:** D-07, D-20, RESEARCH migration steps 2-3, Dependabot alerts

### III. Build wasm with stellar-cli and compile the test suite

- **Files:** none new (build artefacts under `contracts/stellar/target/` are gitignored)
- **Read first:** `contracts/stellar/protocol/Makefile`, `contracts/stellar/resolvers/src/lib.rs` (lines 15-55, the `wasm32` gating), `research-external.md` "Common Pitfalls" (wasm target, spec shaking)
- **Action:**
  1. `cd contracts/stellar && stellar contract build` (workspace build; no `export=`/`lib=` flags). Both `target/wasm32v1-none/release/protocol.wasm` and `target/wasm32v1-none/release/resolvers.wasm` must exist.
  2. `stellar contract optimize --wasm target/wasm32v1-none/release/protocol.wasm` and record the resulting `.optimized.wasm` size in EXECUTION.md (baseline for Plan VI/VII deploy fees).
  3. `stellar contract inspect --wasm target/wasm32v1-none/release/protocol.wasm --output spec` (or `stellar contract info interface --wasm ...` on 27.x — use whichever subcommand `stellar contract --help` lists) must list the 14 public functions from `protocol/src/lib.rs` (`initialize`, `register`, `get_schema`, `attest`, `revoke`, `get_attestation`, `attest_by_delegation`, `revoke_by_delegation`, `get_attester_nonce`, `get_revoker_nonce`, `register_bls_key`, `get_bls_key`, `get_dst_for_attestation`, `get_dst_for_revocation`).
  4. `cargo test --workspace --no-run` must compile all 77 tests (failures at runtime are expected and handled in Plan III; compile errors are fixed here — the known ones are none in tests per research, but `Events::all()` now returns `ContractEvents`; if a comparison fails to type-check, wrap the expected side per the sdk-25 event-testing migration note).
- **Done when:** `ls contracts/stellar/target/wasm32v1-none/release/protocol.wasm contracts/stellar/target/wasm32v1-none/release/resolvers.wasm` lists both files; `cd contracts/stellar && cargo test --workspace --no-run` exits 0; the function list from step 3 is pasted into EXECUTION.md.
- **Covers:** D-08, GOAL compile

## Nyquist criteria for this plan

- [ ] `stellar --version` = 27.1.0 and `wasm32v1-none` installed.
- [ ] `cargo clippy --workspace -- -D warnings` exits 0 on sdk 27.0.6.
- [ ] `Cargo.lock` resolves soroban-env-host 27.0.1 and stellar-xdr 27.0.0.
- [ ] `stellar contract build` produces `protocol.wasm` and `resolvers.wasm`.
- [ ] `cargo test --workspace --no-run` exits 0.

## Risks accepted in this plan

- Runtime test failures (resource limits, `protocol_version: 22`) are deliberately left to Plan III.
- HAL-07 subgroup checks (D-19) are Plan III; this plan is a pure compile step so the diff that changes contract behaviour is reviewable on its own.
- `stellar network add mainnet` uses a public RPC only for `network ls`; the mainnet deploy RPC is the user's choice at the Plan VII checkpoint.
