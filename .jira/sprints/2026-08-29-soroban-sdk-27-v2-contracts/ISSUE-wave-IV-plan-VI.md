---
shape: wave
domain: integration
wave: IV
plan: VI
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-01, D-15, D-21]
title: "Deploy the v2 protocol contract to testnet, register it, and move the workspace to Stellar JS SDK 16"
status: pushed
issue: 117
url: https://github.com/daccred/attestprotocol/issues/117
pushed_at: 2026-08-29T23:10:32Z
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 4 of 6.

**Domain**: integration
**Depends on**: #114 (test suite green on soroban-sdk 27), #115 (versioned contract-address registry), #116 (indexer reads the registry)
**Blocks**: the mainnet deployment step and the documentation-addresses step.

## Goal

Deploy the soroban-sdk 27 protocol contract to Stellar testnet, record it in the contract registry as `v2`, regenerate the TypeScript bindings against it, and make it the current testnet contract once the integration suite passes against it.

## Background

The contract source, its tests and the address registry are all in place by this point, but nothing has been deployed. This step is the first real deployment: it exercises the modified deploy script against a live network, proves the sdk 27 contract behaves correctly end to end, and produces the address that the indexer and the documentation later point at.

Regenerating the bindings with stellar-cli 27 also pulls the workspace forward on the JavaScript Stellar SDK, which is currently on version 15 at the repository root.

Decisions already made that this step must respect:

- The existing testnet contract `CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP` stays live and registered as `v1`. No state is migrated to the new contract.
- The registry's current marker for testnet stays on `v1` until the integration suite has passed against the new contract, and is then flipped in one explicit action.
- The JavaScript SDK moves to the 16.x line across the workspace, with peer ranges expressed as `>=16.0.0 <17`. Version 17 is excluded because it reworks the XDR API.
- The deploying identity is taken from the repository's local environment file if it provides one; otherwise a funded testnet identity is generated for this purpose and its name recorded. That identity becomes the new contract's admin and supplies the integration suite's admin key. The secret is never printed or committed.

Intentionally out of scope for this step:

- Mainnet, which requires the repository owner's signing keys.
- Changes in the separate front-end repository.

## Changes

- `contracts/stellar/bindings/src/contracts.json` — a `testnet.v2` entry written by [`contracts/stellar/deploy.sh`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/deploy.sh), carrying the new address, sdk version 27.0.6, the deploy timestamp, ledger, transaction hash and installed code hash. The current marker is flipped to `v2` in a separate action after the suite passes.
- [`contracts/stellar/bindings/src/protocol.ts`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/bindings/src/protocol.ts) and `protocol.md` — regenerated from the deployed contract with stellar-cli 27.1.0; the network block is rewritten by the generator script rather than by hand.
- [`contracts/stellar/package.json`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/package.json), [`packages/stellar-sdk/package.json`](https://github.com/daccred/attestprotocol/blob/canary/packages/stellar-sdk/package.json) and [`packages/cli/package.json`](https://github.com/daccred/attestprotocol/blob/canary/packages/cli/package.json) — the `@stellar/stellar-sdk` peer range becomes `>=16.0.0 <17`.
- [`apps/horizon/package.json`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/package.json) and the [root `package.json`](https://github.com/daccred/attestprotocol/blob/canary/package.json) — `@stellar/stellar-sdk` moves to `^16.3.0` (the root is currently on `^15.0.1`).
- Call sites that break between JavaScript SDK 15 and 16 across [`packages/stellar-sdk/src`](https://github.com/daccred/attestprotocol/blob/canary/packages/stellar-sdk/src), [`apps/horizon/src`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src) and [`contracts/stellar/__test__`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/__test__) — the object-argument form of `authorizeInvocation`, the namespaced `contract.Client.from`, and the removal of the default export.
- [`contracts/stellar/__test__/readme.md`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/__test__/readme.md) — replace the stale authority-contract instructions with the four protocol suites, the admin-key and version environment variables, and the registry as the address source.
- [`apps/horizon/README.md`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/README.md) — fill in the testnet deployment-variable values and the backfill call, using the new contract's recorded deploy ledger.

## Verification

- [ ] `jq -r .testnet.v2.id contracts/stellar/bindings/src/contracts.json` prints a 56-character address different from `CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP`, `jq -r .testnet.v2.sdk` prints `27.0.6`, and `jq -r .testnet.v2.deployedLedger` prints a number.
- [ ] Immediately after the deploy, `jq -r .testnet.current` still prints `v1` and the `testnet.v1` entry is byte-identical to before — the deploy script did not disturb the existing record.
- [ ] `stellar contract invoke --id <new address> --network testnet -- get_dst_for_attestation` returns the domain-separation bytes, confirming the contract is deployed and initialised.
- [ ] The integration suite (`pnpm test` in `contracts/stellar`, pointed at the new version with `CONTRACT_VERSION=v2`) passes with 0 failures.
- [ ] After the flip, `jq -r .testnet.current` prints `v2`; `jq -r .testnet.protocol.id contracts/stellar/deployments.json` equals the new address; and `contracts/stellar/bindings/src/protocol.ts` names the new address for testnet and the unchanged existing address for mainnet.
- [ ] Re-running the integration suite with no version override — so it resolves through the current marker — also passes.
- [ ] `pnpm ls @stellar/stellar-sdk --depth 0 -r` shows only 16.x, and `grep -n '">=16.0.0 <17"'` matches in all three package manifests listed above.
- [ ] `pnpm --filter @attestprotocol/stellar-contracts build`, `pnpm --filter @attestprotocol/stellar-sdk build typecheck lint test` and `pnpm --filter horizon lint:ts lint test:unit` all exit 0.
- [ ] From `apps/horizon`, evaluating the built constants with `STELLAR_NETWORK=testnet` prints both testnet addresses as the indexed set and the new address as the attribution target.
- [ ] `grep -c Authority contracts/stellar/__test__/readme.md` returns 0, and the indexer README names the new address.

## Rollout

Requires an operator action: the deployed testnet indexer service needs `INDEX_CONTRACT_IDS` set to both testnet addresses and `PROTOCOL_CONTRACT_ID` set to the new one, followed by one backfill call from the new contract's deploy ledger. Both are written out with exact values in the indexer README by this step; the deployed service keeps indexing only the existing contract until they are applied.

## Risks

- Where the repository provides no deploying identity, the new testnet contract's admin is an identity generated during this work. Rotating it means redeploying, which on testnet is cheap.
- The separate front-end repository is not changed here; the documented registry endpoint response is what it will read.
- The backfill for the new contract only runs when the operator applies the variables and calls the endpoint. Until then the new contract's events are absent from the deployed indexer while it otherwise looks healthy.
