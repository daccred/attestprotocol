---
shape: wave
domain: library
wave: II
plan: IV
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-02, D-09, D-10]
title: "Resolve contract addresses from a versioned per-network registry instead of a hardcoded switch"
status: pushed
issue: 115
url: https://github.com/daccred/attestprotocol/issues/115
pushed_at: 2026-08-29T23:10:20Z
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 2 of 6.

**Domain**: library
**Depends on**: #113 (compile the contracts on soroban-sdk 27)
**Blocks**: the indexer step, and both deployment steps.

## Goal

Replace the single-address-per-network [`contracts/stellar/deployments.json`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/deployments.json) with a registry — a JSON file listing every deployed contract address per network and per version — and have `@attestprotocol/stellar-sdk` resolve addresses through it.

## Background

Because the deployed contracts cannot be upgraded in place, a new sdk means a new contract at a new address while the old one keeps running. An address therefore stops being a constant: callers need to ask for a network and, optionally, a version.

Two things stand in the way today. `deployments.json` holds exactly one address per network and the deploy script overwrites it, so the first new deployment would erase the record of the existing one. And the generated TypeScript bindings carry a hand-maintained `networks` block that has previously lost its mainnet entry when the bindings were regenerated.

The registry shape, keyed by network:

```json
{
  "testnet": {
    "v1": { "id": "C…", "sdk": "22.0.8", "deployedAt": "…", "deployedLedger": 123, "txHash": "…", "wasmHash": null },
    "current": "v1"
  },
  "mainnet": { "…": "…" }
}
```

`deployedLedger` is recorded so the indexer can later backfill a newly registered contract from its own first ledger rather than from the start of the chain. `wasmHash` is the installed code hash; `txHash` is the deploy transaction.

Decisions already made that this step must respect:

- The registry file lives at `contracts/stellar/bindings/src/contracts.json`. That path is inside the package's TypeScript `include`, and therefore inside its build output, which [`apps/horizon/Dockerfile`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/Dockerfile) (line 59) copies into the runtime image. A registry outside that path would be missing at run time.
- The deploy script writes only the entry for the version being deployed. It never changes which version is current; that flip is an explicit, separate action taken after a deployment has been verified.
- `deployments.json` is kept for one release as a generated alias of the registry's current entries, regenerated after every registry write, so existing consumers keep working. Nothing new reads it, and removing it is a follow-up.
- Address resolution order in the SDK client stays explicit: a caller-supplied address wins; otherwise the registry is asked for the network and version.

Intentionally out of scope for this step:

- Indexer consumption of the registry, which is the next step.
- Any actual deployment.

## Changes

- `contracts/stellar/bindings/src/contracts.json` (new) — the registry, seeded with the two live contracts: testnet `CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP` and mainnet `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI`, each recorded as `v1` and marked current. Their deploy ledgers are recovered from the transaction hashes already stored in `deployments.json`.
- `contracts/stellar/bindings/src/registry.ts` (new) — typed accessors `contracts`, `getContractEntry(network, version?)`, `getContractId(network, version?)` and `listContracts(network)`, where the version defaults to the network's current. Asking for a version that is not registered throws with a message naming the version and network, rather than returning undefined.
- [`contracts/stellar/package.json`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/package.json) — publish the accessors as a `./registry` subpath export, plus a `typesVersions` entry. [`apps/horizon/tsconfig.json`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/tsconfig.json) compiles to CommonJS with no `moduleResolution`, which ignores subpath `exports`; without `typesVersions` the import in the next step fails to type-check.
- [`contracts/stellar/deploy.sh`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/deploy.sh) — write to the registry instead of `deployments.json`, behind a new `--version` flag that is required when deploying the protocol contract. The merge writes only the given network and version, and never touches the current marker. The deploy ledger and installed code hash are captured from the deploy transaction and stored alongside the address.
- `contracts/stellar/scripts/sync-deployments.sh` (new) — regenerates the `deployments.json` alias from each network's current entry; called after every registry write.
- `contracts/stellar/scripts/sync-networks.mjs` (new) — rewrites the `networks` block in [`contracts/stellar/bindings/src/protocol.ts`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/bindings/src/protocol.ts) (lines 34-47) from the registry, so regenerating the bindings can no longer drop a network.
- [`contracts/stellar/__test__/testutils.ts`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/__test__/testutils.ts) — the integration-test config loader reads its address from the registry, honouring a `CONTRACT_VERSION` environment override so the suite can be pointed at a newly deployed version before that version becomes current.
- [`contracts/stellar/bindings/README.md`](https://github.com/daccred/attestprotocol/blob/canary/contracts/stellar/bindings/README.md) — drop the references to the removed authority contract, document the new `--version` flag, and state that `deployments.json` is generated and should not be hand-edited.
- [`packages/stellar-sdk/src/types.ts`](https://github.com/daccred/attestprotocol/blob/canary/packages/stellar-sdk/src/types.ts) — client options gain an optional `contractVersion`.
- [`packages/stellar-sdk/src/client.ts`](https://github.com/daccred/attestprotocol/blob/canary/packages/stellar-sdk/src/client.ts) (lines 102-113) — replace the per-network address switch with a registry lookup, keeping the existing configuration-error guard.
- [`packages/stellar-sdk/src/index.ts`](https://github.com/daccred/attestprotocol/blob/canary/packages/stellar-sdk/src/index.ts) — re-export the registry accessors and types so SDK consumers can resolve addresses without depending on the contracts package directly.

## Verification

- [ ] From `apps/horizon`, `node -e "console.log(require('@attestprotocol/stellar-contracts/registry').getContractId('mainnet'))"` prints `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI` under Node 20, and the equivalent `import()` prints the same.
- [ ] A file under `apps/horizon/src` importing `getContractId` from `@attestprotocol/stellar-contracts/registry` passes `npx tsc --noEmit`.
- [ ] After `bash contracts/stellar/scripts/sync-deployments.sh`, `jq -r .testnet.protocol.id contracts/stellar/deployments.json` equals `jq -r '.testnet[.testnet.current].id' contracts/stellar/bindings/src/contracts.json`, and the same holds for mainnet.
- [ ] `node contracts/stellar/scripts/sync-networks.mjs` run against the seeded registry leaves `bindings/src/protocol.ts` unchanged apart from whitespace — the generator reproduces the file that is already committed.
- [ ] `bash -n contracts/stellar/deploy.sh` exits 0, and `--version` appears in both the usage text and the flag parser.
- [ ] Running the registry write with a version that already exists leaves the other version's entry and the current marker byte-identical.
- [ ] `grep -c deployments.json contracts/stellar/__test__/testutils.ts` returns 0; the only remaining references to that file are the deploy script's alias step and the published `files` list.
- [ ] A unit test asserts that a client constructed with `network: 'testnet'` and no explicit address resolves to `getContractId('testnet')`, and that requesting a version which is not registered throws `No v2 contract registered for testnet`.
- [ ] `pnpm --filter @attestprotocol/stellar-sdk build`, `typecheck`, `lint` and `test` all exit 0.

## Rollout

N/A — direct merge, no schema change. `deployments.json` keeps its current content and its place in the published files, so nothing downstream breaks on this commit.

## Risks

- The contracts package is an ES module and the indexer compiles to CommonJS on Node 20, so `require`-ing the registry relies on Node 20.19+ support for requiring ES modules together with the JSON import attribute. The first verification item proves it on Node 20; if it fails, the fix is to emit a CommonJS build of the registry alongside the ES module one. The residual risk is a deployment platform pinned to a Node 20 patch older than 20.19.
- The JSON import attribute may force the contracts package onto `NodeNext` module resolution; acceptable, but it should be called out in the pull request if it happens.
- The installed code hash for the two existing entries stays null — it is not recoverable from the deploy transaction without an archive query.
- The deploy script's new write path is only exercised against a real network in the deployment step. A syntax check plus the registry-write assertions above are the checks available here.
