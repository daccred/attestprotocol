---
shape: wave
domain: library
wave: II
plan: III
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-16, D-19]
title: "Get the contract test suite green on soroban-sdk 27 and reject invalid BLS points with an error instead of a trap"
status: pushed
issue: 114
url: https://github.com/daccred/attestprotocol/issues/114
pushed_at: 2026-08-29T23:10:20Z
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 2 of 6.

**Domain**: library
**Depends on**: #113 (compile the contracts on soroban-sdk 27)
**Blocks**: the testnet deployment step.

## Goal

Make all 77 Rust tests in [`contracts/stellar`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar) pass under soroban-sdk 27.0.6, have the contract reject geometrically invalid BLS12-381 points with a structured error rather than trapping inside the host, and point the makefiles and the release workflow at `stellar contract build`.

## Background

The previous step bumped the sdk and got the workspace compiling; runtime behaviour was deliberately left broken. Three changes between sdk 22 and 27 break existing tests: the default per-invocation resource budgets are tighter, the ledger's `protocol_version` value moved on, and reading an archived storage entry no longer panics the way the tests assume.

Separately, soroban-sdk 26 added host functions that check whether a BLS point lies on the curve and in the correct prime-order subgroup. The contract currently validates only the encoding flag byte, so a caller-supplied point that decodes but is geometrically invalid traps inside the host — the caller pays the fee and gets no usable error. This is the residual of a prior security-audit finding on the delegated-attestation path, and the new v2 contract is where it gets closed.

Decisions already made that this step must respect:

- The v2 contract calls the host's on-curve and subgroup checks after decoding, and returns `Error::InvalidSignaturePoint` where they fail. The cheap flag-byte pre-checks stay — they are still the first thing that rejects malformed input.
- Resource-limit relief is applied per test, never in the shared test helpers, so the default budget in the suite stays realistic.
- The release workflow drops its second job: the authority contract it built no longer exists in this repository.

Intentionally out of scope for this step:

- Anything about deployment or contract addresses.

## Changes

- [`contracts/stellar/protocol/tests/protocol_attestation_test.rs`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/tests/protocol_attestation_test.rs) lines 268 and 780, and [`contracts/stellar/resolvers/tests/default_resolver.rs`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/resolvers/tests/default_resolver.rs) line 17 — the simulated ledger `protocol_version` moves from 22 to 27.
- [`contracts/stellar/protocol/tests`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/tests) — tests that now exceed a CPU, memory or entry budget get `env.cost_estimate().disable_resource_limits()` in that test alone, each with a comment naming the limit hit; tests that asserted a panic on an archived or expired entry are rewritten to assert the entry's time-to-live directly; event-comparison assertions are adapted to the sdk's new events return type without weakening what they assert.
- [`contracts/stellar/protocol/src/instructions/crypto.rs`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/src/instructions/crypto.rs) — in `register_bls_key` (around line 243), reject the supplied G2 public key with `Error::InvalidSignaturePoint` unless the host reports it both on-curve and in-subgroup; the same guard on the G1 signature in the verification path (around lines 369-379). The stored public key is validated at registration, so the verification path does not re-check it. The version-pinned comment blocks at lines 127-168, 170-200, 225-245 and 355-370 are rewritten as statements about behaviour, with no sdk version numbers or line references that go stale.
- [`contracts/stellar/protocol/tests/protocol_cryptography_test.rs`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/tests/protocol_cryptography_test.rs) — the test asserting an all-zero signature traps now asserts it returns `InvalidSignaturePoint`, and is renamed to say so; two new tests cover an off-curve public key through `register_bls_key` and an off-curve signature through `attest_by_delegation`.
- [`contracts/stellar/protocol/Makefile`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/Makefile) and [`contracts/stellar/resolvers/Makefile`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/resolvers/Makefile) — `build` calls `stellar contract build --package …` instead of a bare `cargo build --target`. The resolvers `build-token` and `build-fee` targets are deleted: the Cargo features they pass do not exist in [`resolvers/Cargo.toml`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/resolvers/Cargo.toml) (lines 20-21), so those targets cannot succeed.
- [`contracts/stellar/.cargo/config.toml`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/.cargo/config.toml) — the `[target.wasm32-unknown-unknown]` flags block is dead now that every build path targets `wasm32v1-none`; delete it, and the file if it empties.
- [`.github/workflows/soroban-release.yml`](https://github.com/daccred/attestprotocol/blob/canary/.github/workflows/soroban-release.yml) — pin the reusable `stellar-expert/soroban-build-workflow` to `@v27.0.0` instead of `@main`, and delete the `release-authority` job at lines 24-32.

## Verification

- [ ] `cd contracts/stellar && cargo test --workspace` reports 79 passed (the 77 existing tests plus the two new point-validation tests), 0 failed, 0 ignored.
- [ ] `grep -rn 'protocol_version: 22' contracts/stellar` returns nothing.
- [ ] `grep -c disable_resource_limits contracts/stellar/protocol/tests/testutils.rs` returns 0 — no blanket relief in the shared helpers.
- [ ] `cargo clippy --workspace -- -D warnings` exits 0.
- [ ] Calling `register_bls_key` with a 192-byte public key whose flag byte is valid but whose coordinates are random returns `Error::InvalidSignaturePoint` instead of trapping; the equivalent 96-byte signature through `attest_by_delegation` behaves the same. Both are asserted by the two new tests.
- [ ] `grep -c 'soroban-sdk-22\|22\.0\.11' contracts/stellar/protocol/src/instructions/crypto.rs` returns 0 — no version-pinned commentary remains.
- [ ] `make build` in both `contracts/stellar/protocol` and `contracts/stellar/resolvers` invokes `stellar contract build` and exits 0.
- [ ] `.github/workflows/soroban-release.yml` contains exactly one job, referencing the reusable workflow at `@v27.0.0`, with no `release-authority` job and no path under `contracts/stellar/authority`.

## Rollout

N/A — direct merge. The added point checks change contract behaviour, but that behaviour ships in the new v2 deployment; the live contracts are untouched.

## Risks

- The on-curve and subgroup host calls add cost to `register_bls_key` and to delegated attest and revoke. The trade — a structured error instead of a trap the submitter pays for anyway — is accepted deliberately.
- Whether the host returns false or traps for an all-zero input can only be established by running it. Either outcome is acceptable as long as the test name states the behaviour that was observed.
- If a single delegated call turns out to exceed the mainnet invocation resource limits in a test, that is a real finding about mainnet, not a test artefact. It must be reported in the pull request rather than absorbed by disabling the limit.
