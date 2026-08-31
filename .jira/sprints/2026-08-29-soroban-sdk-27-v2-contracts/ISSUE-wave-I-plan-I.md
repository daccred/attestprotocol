---
shape: wave
domain: infra
wave: I
plan: I
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-07, D-08, D-20]
title: "Compile the Stellar contracts on soroban-sdk 27.0.6 for the wasm32v1-none target"
status: pushed
issue: 113
url: https://github.com/daccred/attestprotocol/issues/113
pushed_at: 2026-08-29T23:10:12Z
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 1 of 6.

**Domain**: infra
**Depends on**: nothing; can start now.
**Blocks**: the test-suite step and the contract-address registry step.

## Goal

Move the Rust workspace under [`contracts/stellar`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar) from soroban-sdk 22.0.8 to 27.0.6 so that it builds for the host and for the `wasm32v1-none` WebAssembly target, and so every test compiles.

## Background

The Soroban contracts in this repo (a protocol contract and a resolvers contract) are pinned to soroban-sdk 22.0.8 and are built with a bare `cargo build`. Neither contract exposes `update_current_contract_wasm`, so there is no way to upgrade the deployed code in place — the only route to a newer sdk is to deploy fresh contracts alongside the existing ones. This step is the compile half of that: get the source building on the new sdk without changing any contract behaviour, so that the later commit which *does* change behaviour is reviewable on its own.

Decisions already made that this step must respect:

- The toolchain is soroban-sdk 27.0.6 with stellar-cli 27.1.0, Rust stable (the sdk's minimum supported version is 1.91), and the `wasm32v1-none` target. 27.1.0 is the pairing the Stellar Development Foundation ships for mainnet; stellar-cli 27.0.0 pins the wrong JavaScript SDK in its TypeScript binding template, and 28.x is unverified against sdk 27.
- WebAssembly is built with `stellar contract build`, not a bare `cargo build --target`.
- Contract events keep using the now-deprecated `env.events().publish` with an explicit `#[allow(deprecated)]`. The newer `#[contractevent]` macro changes the topic and data layout that this repo's indexer decodes in [`ingest.repository.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/repository/ingest.repository.ts) (lines 632-649), [`backfill.repository.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/repository/backfill.repository.ts) (lines 626-643) and [`events.repository.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/repository/events.repository.ts) (line 512), so it needs a coordinated indexer change and is deferred.
- The Cargo workspace version becomes `2.0.0`, matching the second generation of deployed contracts.

Intentionally out of scope for this step:

- Making the tests *pass* — resource-limit and ledger-version failures are expected here and are fixed in the next step.
- Hardening BLS point validation, and everything about deployment or contract addresses.

## Changes

- [`contracts/stellar/rust-toolchain.toml`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar) (new) — pin the `stable` channel with the `wasm32v1-none` target so every machine and CI runner builds the same way.
- [`contracts/stellar/Cargo.toml`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/Cargo.toml) — line 12 becomes `soroban-sdk = { version = "27.0.6" }`; `[workspace.package] version` becomes `2.0.0`; the stale commented-out `stellar-xdr` pin is deleted.
- [`contracts/stellar/Cargo.lock`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/Cargo.lock) — regenerated so `soroban-env-host` resolves to 27.0.1 and `stellar-xdr` to 27.0.0. Those are the versions that resolve the two open Rust advisories on this repository, [GHSA-pm4j-7r4q-ccg8](https://github.com/advisories/GHSA-pm4j-7r4q-ccg8) and [GHSA-x57h-xx53-v53w](https://github.com/advisories/GHSA-x57h-xx53-v53w).
- [`contracts/stellar/protocol/src/instructions/crypto.rs`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/src/instructions/crypto.rs) — the sdk renamed its BLS12-381 affine point types; `G1Affine`/`G2Affine` become `Bls12381G1Affine`/`Bls12381G2Affine` at the import on line 103 and at each use (lines 243, 375, 379, 387). No behaviour change.
- [`contracts/stellar/protocol/src/events.rs`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/src/events.rs) — `#[allow(deprecated)]` on each of the six `env.events().publish(...)` call sites, with one comment recording that the tuple topic/data layout is what the indexer decodes.

## Verification

- [ ] `stellar --version` prints `stellar 27.1.0`, and `rustup target list --installed` includes `wasm32v1-none`.
- [ ] `cd contracts/stellar && cargo clippy --workspace -- -D warnings` exits 0, with no deprecation warnings in the output.
- [ ] `grep -A1 'name = "soroban-env-host"' contracts/stellar/Cargo.lock` shows `version = "27.0.1"`, and the same command for `stellar-xdr` shows `version = "27.0.0"`.
- [ ] `cd contracts/stellar && stellar contract build` exits 0 and produces both `target/wasm32v1-none/release/protocol.wasm` and `target/wasm32v1-none/release/resolvers.wasm`.
- [ ] The interface dumped from `protocol.wasm` (`stellar contract info interface --wasm ...`) lists all 14 public functions declared in [`protocol/src/lib.rs`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/protocol/src/lib.rs): `initialize`, `register`, `get_schema`, `attest`, `revoke`, `get_attestation`, `attest_by_delegation`, `revoke_by_delegation`, `get_attester_nonce`, `get_revoker_nonce`, `register_bls_key`, `get_bls_key`, `get_dst_for_attestation`, `get_dst_for_revocation`.
- [ ] `cd contracts/stellar && cargo test --workspace --no-run` exits 0 — every test compiles, regardless of whether it passes.
- [ ] `grep -c 'G1Affine::' contracts/stellar/protocol/src/instructions/crypto.rs` returns 0 — no use of the old type names remains.
- [ ] The size of the optimised protocol WebAssembly (`stellar contract optimize --wasm target/wasm32v1-none/release/protocol.wasm`) is recorded in the pull request, as the baseline for deploy-fee estimates in the later deploy steps.

## Rollout

N/A — direct merge. Nothing is deployed by this step; the live testnet and mainnet contracts are untouched.

## Risks

- If the optimised WebAssembly comes out substantially larger than the currently deployed contract, the later deploy steps need a higher transaction fee than the one used for the first mainnet deployment. The size measurement in the last verification item is what surfaces this before a deploy is attempted.
- The subcommand that dumps a contract interface was renamed across stellar-cli versions; use whichever one `stellar contract --help` lists on 27.1.0.
