---
project: attestprotocol
created: 2026-08-29
last_activity: 2026-08-29
active_sprint: 2026-08-29-soroban-sdk-27-v2-contracts
---

# State

Project-wide state for the `jira` workflow. The orchestrator commands keep this current.

## Sprints

<!-- One row per sprint. Most recent first. -->

| Slug | Status | Goal | Outcome |
|------|--------|------|---------|
| 2026-08-29-soroban-sdk-27-v2-contracts | planned | Upgrade Stellar contracts to soroban-sdk 27, deploy versioned v2 contracts, registry-driven addresses in SDK/horizon/docs | — |

Status legend: `researching`, `planned`, `executing`, `verifying`, `done`, `blocked`, `abandoned`.

## Decisions log

<!-- Cross-sprint decisions worth remembering. Each as one bullet with the date and the sprint where it was made. -->

- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-01: New v2 contracts are deployed; there is no in-place upgrade.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-02: Contract addresses become a versioned registry keyed `{network: {v1: {...}, v2: {...}, current}}`, consumed by the SDK, horizon and docs.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-03: Horizon pins datasets to the contract address (columns `Attestation.contractAddress`, `Schema.contractAddress`, `Transaction.contractId`, `HorizonEvent.contract.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-04: Railway environment changes are documented (exact keys and values) for the user to apply.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-05: Docs: convert the ASCII box-drawing diagrams to native ```` ```mermaid ```` fences (Mintlify renders them).
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-06: Logical waves: (1) Compile, (2) Registry + horizon, (3) Testnet v2, (4) Mainnet v2, (5) Docs.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-07: Keep `env.events().publish` in v2 with `#[allow(deprecated)]` on each call site in `protocol/src/events.rs` and a comment tying the layout to horizon's decoders.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-08: Toolchain: soroban-sdk `27.0.6`, stellar-cli `27.1.0` (SDF's mainnet pairing; 27.0.0's TS template pins the wrong JS SDK, 28 is unverified against sdk 27), Rust.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-09: Registry location and shape.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-10: `getContractId(network, version?)` (version defaults to `current`) is exported from `@attestprotocol/stellar-contracts/registry` together with `contracts`, `get.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-11: Horizon env semantics.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-12: Filter parameter names are `contract` (address) and `version` (registry key resolved server-side against `STELLAR_NETWORK`; unknown version → 400).
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-13: `GET /api/contracts` response: `{ success: true, data: { network, current, contracts: { v1?: entry, v2?: entry }, indexing: string[] } }`; `GET /api/contracts/:.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-14: Cursor: no new Prisma model (no schema push in this sprint).
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-15: JS SDK: regenerated bindings target `@stellar/stellar-sdk` 16.x.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-16: `.github/workflows/soroban-release.yml`: pin `stellar-expert/soroban-build-workflow` to `@v27.0.0` and delete the `release-authority` job (its directory no long.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-17: `.changeset/config.json` `baseBranch` becomes `canary` (the default branch) in the mainnet wave; the changeset names both `@attestprotocol/stellar-contracts: ma.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-18: Docs scope: the 7 box-drawing blocks identified in research-codebase.md (attestations L27-31, authorities L24-44, delegates L10-29 and L191-195, how-it-works L8.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-19: HAL-07 residual: v2 adds the sdk-26 host checks after `from_bytes` — `g1_is_on_curve` + `g1_is_in_subgroup` on the caller-supplied signature and `g2_is_on_curve.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-20: Cargo workspace version becomes `2.0.0` (`contracts/stellar/Cargo.toml` `[workspace.package] version`), matching the "v2" contract generation.
- 2026-08-29 [2026-08-29-soroban-sdk-27-v2-contracts] D-21: Testnet deployer identity: if `contracts/stellar/env.sh` provides `SOURCE_IDENTITY`, use it; otherwise the executor generates and funds `attest-v2-testnet` with.

## Blockers

<!-- Active blockers across all sprints. Resolved blockers move to the Decisions log. -->

## Notes

<!-- Free-form workflow notes, accumulated lessons, links to recurring patterns. -->
