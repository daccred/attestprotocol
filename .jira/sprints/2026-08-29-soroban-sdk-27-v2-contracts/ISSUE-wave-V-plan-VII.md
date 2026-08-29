---
shape: wave
domain: infra
wave: V
plan: VII
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-01, D-04, D-06, D-17]
title: "Deploy the v2 protocol contract to mainnet, point every reference at it, and release the coupled package major"
status: pushed
issue: 118
url: https://github.com/daccred/attestprotocol/issues/118
pushed_at: 2026-08-29T23:10:39Z
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 5 of 6.

**Domain**: infra
**Depends on**: #117 (testnet v2 deployment)
**Blocks**: the documentation-addresses step, which needs the mainnet address.

## Goal

Deploy the soroban-sdk 27 protocol contract to Stellar mainnet, register it and make it current, update every remaining reference to the old address, and prepare the coupled major release of `@attestprotocol/stellar-contracts` and `@attestprotocol/stellar-sdk`.

## Background

Testnet has proved the contract, the registry write path and the indexer configuration. Mainnet is the same sequence with real value at stake: the deployment is signed with the repository owner's keys, so it is prepared here and run by them, not by automation.

Decisions already made that this step must respect:

- The existing mainnet contract `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI` stays live, registered as `v1`. No state is migrated.
- The deployment command is written out for the repository owner with every flag filled in, and is not executed by anyone else. The registry's current marker for mainnet is flipped only after the deployment is confirmed on-chain.
- Deployment-platform variables are documented with exact keys and values; a person applies them.
- The two packages ship a coupled major: the changeset names both explicitly, because the tooling would otherwise only patch-bump the dependent package.
- The changeset base branch is corrected to the repository's actual default branch, `canary`.
- Publishing to npm and the Rust crate release both need credentials the automation does not hold, so the version bumps are committed here and the publish commands are handed over.

Intentionally out of scope for this step:

- Documentation pages that render contract addresses — the following step.
- Migrating existing schemas, attestations or authorities to the new contract; that is not planned at all.

## Changes

- `contracts/stellar/bindings/src/contracts.json` — a `mainnet.v2` entry written by [`contracts/stellar/deploy.sh`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/deploy.sh) when the owner runs the prepared command, then the current marker flipped to `v2` in a separate action.
- [`contracts/stellar/bindings/src/protocol.ts`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/bindings/src/protocol.ts) and [`contracts/stellar/deployments.json`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/deployments.json) — regenerated from the registry after the flip.
- [`README.md`](https://github.com/daccred/attestprotocol/blob/canary/README.md) (lines 34-46) — list mainnet and testnet, current and legacy, with block-explorer links; drop the two authority-contract lines, since those contracts are no longer part of the protocol; add one sentence naming the registry file as the canonical list and the indexer endpoint that serves it.
- [`apps/horizon/.env.example`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/.env.example) — the development default stays a testnet address; the production value is shown in a comment.
- [`apps/horizon/scripts/mainnet/README.md`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/scripts/mainnet/README.md) (around lines 45-47, 298 and 374-375) — replace the address table rows with current and legacy protocol rows and delete the authority row.
- [`apps/horizon/README.md`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/README.md) — the final production variable block: network, both mainnet addresses as the indexed set, the new address as the attribution target, the authority variable removed, then the backfill call from the new contract's deploy ledger and the check that the registry endpoint reports the new version as current.
- [`.changeset/config.json`](https://github.com/daccred/attestprotocol/blob/canary/.changeset/config.json) — base branch becomes `canary`.
- `.changeset/` (new entry) — both packages as major, described for an outside reader: a v2 protocol contract on soroban-sdk 27, addresses resolved through the versioned registry accessor, the Stellar JavaScript SDK peer range now `>=16.0.0 <17`, and the previous contract addresses still reachable under `v1`.
- [`packages/stellar-sdk/package.json`](https://github.com/daccred/attestprotocol/blob/canary/packages/stellar-sdk/package.json), [`contracts/stellar/package.json`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/package.json) and both changelogs — the version bump produced by running the changeset tooling.

## Verification

- [ ] The exact deployment command, with the fee, network passphrase and initialisation flag filled in, is posted on this issue before anything is run, and the deployment happens only after the repository owner says to proceed.
- [ ] `jq -r .mainnet.v2.id contracts/stellar/bindings/src/contracts.json` prints a 56-character address different from `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI`, and `jq -r .mainnet.v2.sdk` prints `27.0.6`.
- [ ] Immediately after the deploy, `jq -r .mainnet.current` still prints `v1` and the `mainnet.v1` entry is unchanged.
- [ ] A read-only invocation of `get_dst_for_attestation` against the new mainnet address simulates successfully.
- [ ] After the flip, `jq -r .mainnet.current` prints `v2`; `jq -r .mainnet.protocol.id contracts/stellar/deployments.json` equals the new address; and `contracts/stellar/bindings/src/protocol.ts` names it for mainnet.
- [ ] `grep -rn 'CBKOB6\|CCMJGCRS' README.md apps/horizon/scripts/mainnet/README.md apps/horizon/.env.example` returns nothing — no authority-contract address survives.
- [ ] The new mainnet address appears at least once in each of `README.md`, `apps/horizon/README.md` and `apps/horizon/scripts/mainnet/README.md`.
- [ ] The indexer README's production block lists both mainnet addresses in the indexed set, and the backfill command carries the new contract's deploy ledger as its start.
- [ ] `grep -n '"baseBranch": "canary"' .changeset/config.json` matches, and after running the changeset version step both package manifests report `3.0.0` with a matching changelog entry.
- [ ] `pnpm -r build` exits 0 after versioning.
- [ ] The two open Rust advisories on this repository are listed in the pull request with their current state, together with a note that the existing dependency-update pull request becomes redundant for those two crates once this lands.

## Rollout

Requires an operator action, in this order: the repository owner runs the prepared mainnet deployment command with their own signing key; then sets network, indexed addresses and attribution address on the production indexer service and removes the authority variable; then issues one backfill from the new contract's deploy ledger; then runs the npm publish and Rust crate release commands handed over in the pull request. Until the variables are applied, the production indexer keeps indexing only the existing contract.

## Risks

- Nothing in the deployment task runs unattended. If it did, it would spend real funds with a key that automation should not hold.
- Publishing and the crate release are performed by the owner, so this work ends with version bumps committed and commands handed over rather than with packages on the registry.
- Advisory closure is confirmed only after the branch merges into the default branch, outside this change.
- The mainnet RPC endpoint is the owner's choice; the prepared command leaves it as a placeholder rather than picking one.
