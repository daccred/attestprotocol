---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
plan: IV
wave: II
goal: Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
worktree: false
branch: jira/2026-08-29-soroban-sdk-27-v2-contracts
issue: none
depends_on: [I]
parallel_with: [III]
files_modified:
  - contracts/stellar/bindings/src/contracts.json
  - contracts/stellar/bindings/src/registry.ts
  - contracts/stellar/bindings/src/protocol.ts
  - contracts/stellar/scripts/sync-networks.mjs
  - contracts/stellar/scripts/sync-deployments.sh
  - contracts/stellar/deployments.json
  - contracts/stellar/deploy.sh
  - contracts/stellar/package.json
  - contracts/stellar/__test__/testutils.ts
  - contracts/stellar/bindings/README.md
  - packages/stellar-sdk/src/client.ts
  - packages/stellar-sdk/src/types.ts
  - packages/stellar-sdk/src/index.ts
covers:
  - D-02
  - D-09
  - D-10
  - "RESEARCH: deployments.json overwrite loses v1; bindings regeneration drops mainnet; registry must live under a Dockerfile-copied path"
  - "RESEARCH: Don't Hand-Roll — atomic registry write (deploy.sh:291-373), test config loader (testutils.ts:57-84), network switch (client.ts:84-99)"
  - "GOAL: contract addresses as a versioned registry consumed by the SDK"
---

# Plan IV: Versioned contract registry, deploy.sh writer, SDK accessor

**Sprint goal:** Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
**Worktree:** false — sequential waves share `node_modules`, `target/` and `dist/` build caches on one checkout, and Plans VI/VII need the deployed registry state of that same checkout.
**This plan delivers:** `contracts.json` seeded with both v1 contracts, a typed `@attestprotocol/stellar-contracts/registry` export with `getContractId`, `deploy.sh` writing versioned entries, and `@attestprotocol/stellar-sdk` resolving contract IDs through the registry. Horizon consumption is Plan V (depends on this export).

## Tasks

### I. Create `contracts.json` and the `registry` export; turn `deployments.json` into a generated alias

- **Files:** `contracts/stellar/bindings/src/contracts.json` (new), `contracts/stellar/bindings/src/registry.ts` (new), `contracts/stellar/package.json`, `contracts/stellar/deployments.json` (regenerated alias), `contracts/stellar/__test__/testutils.ts`
- **Read first:** `contracts/stellar/deployments.json`, `contracts/stellar/package.json`, `contracts/stellar/tsconfig.json`, `contracts/stellar/__test__/testutils.ts` (lines 55-90), CONTEXT.md D-09/D-10, `research-patterns.md` "config/registry shape"
- **Action:**
  1. Look up the deploy ledger of each v1 contract from its deploy tx hash (`deployments.json` `hash`): `curl -s https://horizon-testnet.stellar.org/transactions/5f91a35f4629473c814c2e949a530f4d3dfe6b44a6426f0d26e69523d83f287d | jq .ledger` and `curl -s https://horizon.stellar.org/transactions/6eeaf6691748956417b7929951ff3789f499190b2c220d3e758e3b62ddc66e7f | jq .ledger`.
  2. Write `contracts/stellar/bindings/src/contracts.json` per D-09 with `testnet.v1` = `{ "id": "CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP", "sdk": "22.0.8", "deployedAt": "2025-11-07T12:44:26Z", "deployedLedger": <from step 1>, "txHash": "5f91a35f...", "wasmHash": null }`, `testnet.current = "v1"`, and `mainnet.v1` = `{ "id": "CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI", "sdk": "22.0.8", "deployedAt": "2025-11-05T07:12:13Z", "deployedLedger": <from step 1>, "txHash": "6eeaf669...", "wasmHash": null }`, `mainnet.current = "v1"`. Two-space indentation, keys in the order shown.
  3. Create `contracts/stellar/bindings/src/registry.ts`:
     ```ts
     import registry from './contracts.json' with { type: 'json' }

     export type Network = 'testnet' | 'mainnet'
     export type ContractVersion = 'v1' | 'v2'
     export interface ContractEntry { id: string; sdk: string; deployedAt: string; deployedLedger: number | null; txHash: string; wasmHash: string | null }
     export type NetworkRegistry = { current: ContractVersion } & Partial<Record<ContractVersion, ContractEntry>>

     export const contracts = registry as Record<Network, NetworkRegistry>
     export function getContractEntry(network: Network, version?: ContractVersion): ContractEntry
     export function getContractId(network: Network, version?: ContractVersion): string
     export function listContracts(network: Network): Array<ContractEntry & { version: ContractVersion }>
     ```
     `getContractEntry` resolves `version ?? contracts[network].current` and throws `new Error(\`No ${version} contract registered for ${network}\`)` when absent; `getContractId` returns `.id`; `listContracts` returns all non-`current` keys sorted `v1`, `v2`. If `tsc` rejects the `with { type: 'json' }` attribute under the current `module: "ESNext"` setting, keep the attribute and set `"module": "NodeNext", "moduleResolution": "NodeNext"` in `tsconfig.json` (note this in EXECUTION.md) — the attribute is required for Node ESM to load the JSON at runtime.
  4. `contracts/stellar/package.json`: add exports `"./registry": { "types": "./dist/registry.d.ts", "import": "./dist/registry.js", "require": "./dist/registry.js" }` and `"./contracts.json": "./dist/contracts.json"`; add `"typesVersions": { "*": { "registry": ["./dist/registry.d.ts"], "protocol": ["./dist/protocol.d.ts"] } }` — `apps/horizon/tsconfig.json` has `module: commonjs` with no `moduleResolution` (node10), which ignores `exports`, so without `typesVersions` the `@attestprotocol/stellar-contracts/registry` import in Plan V fails `tsc` with TS2307; keep `files` as `["dist/", "deployments.json"]` (D-09: alias retained for one release).
  5. Leave `deployments.json` in place with its current content — it is now a generated alias that task II's `scripts/sync-deployments.sh` rewrites from `contracts.json` `current` (the README note about this lives in task II step 6). `__test__/testutils.ts` `loadTestConfig()`: replace the `deployments.json` read with `import { getContractId } from '../bindings/src/registry'` and `protocolContractId = getContractId('testnet', process.env.CONTRACT_VERSION as ContractVersion | undefined)` (so Plan VI can run the suite against `v2` before `current` flips). Keep `ADMIN_SECRET_KEY` and the RPC URL as they are.
  6. `cd contracts/stellar && pnpm build` then `node -e "import('@attestprotocol/stellar-contracts/registry').then(m => console.log(m.getContractId('mainnet')))"` from `apps/horizon` (which depends on the package) must print `CBUUI7WK...`.
  7. CommonJS boundary check under Node 20. `apps/horizon` compiles to CommonJS (`apps/horizon/tsconfig.json` `"module": "commonjs"`) and its Dockerfile runs on `node:20-alpine`, while `@attestprotocol/stellar-contracts` is `"type": "module"` with an ESNext tsc build, so Plan V's `require('@attestprotocol/stellar-contracts/registry')` relies on Node 20.19+ `require(esm)` plus the `with { type: 'json' }` attribute. Run, from `apps/horizon`, under Node 20 (this machine's nvm at `~/.nvm` has only v24 installed and docker is absent): `source ~/.nvm/nvm.sh && nvm install 20 && nvm exec 20 node -e "console.log(require('@attestprotocol/stellar-contracts/registry').getContractId('mainnet'))"`; on a machine with docker, `docker run --rm -v "$PWD/../..:/w" -w /w/apps/horizon node:20-alpine node -e "..."` is equivalent. It must print `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI`. If it throws (`ERR_REQUIRE_ESM`, `ERR_IMPORT_ATTRIBUTE_MISSING`, or a JSON-import syntax error), the fix is: emit a CommonJS registry build — add `contracts/stellar/tsconfig.cjs.json` (`"extends": "./tsconfig.json"`, `"compilerOptions": { "module": "CommonJS", "moduleResolution": "Node", "outDir": "dist/cjs", "resolveJsonModule": true }`, `"include": ["src/registry.ts", "src/contracts.json"]`), append `&& tsc -p tsconfig.cjs.json` to the `build` script, write `dist/cjs/package.json` as `{"type":"commonjs"}` in the build script, and point the `./registry` export's `"require"` condition at `./dist/cjs/registry.js` (the JSON attribute is dropped in the CJS emit because `resolveJsonModule` inlines it). Re-run the Node 20 check until it prints the ID; record which path was taken in EXECUTION.md.
- **Done when:** `ls contracts/stellar/dist/contracts.json contracts/stellar/dist/registry.js` lists both; the ESM `node -e` command in step 6 prints `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI`; the CommonJS `require(...)` check in step 7 prints the same ID under Node 20 (`nvm exec 20`); from `apps/horizon`, a probe file `src/__probe.ts` containing `import { getContractId } from '@attestprotocol/stellar-contracts/registry'; console.log(getContractId('mainnet'))` passes `npx tsc --noEmit` (then delete the probe); `test -f contracts/stellar/deployments.json`; `grep -c deployments.json contracts/stellar/__test__/testutils.ts` = 0; `grep -c deployments.json contracts/stellar/package.json` = 1.
- **Covers:** D-02, D-09, RESEARCH registry-in-image pitfall

### II. Make `deploy.sh` write versioned entries and regenerate `networks` from the registry

- **Files:** `contracts/stellar/deploy.sh`, `contracts/stellar/scripts/sync-deployments.sh` (new), `contracts/stellar/deployments.json` (regenerated), `contracts/stellar/scripts/sync-networks.mjs` (new), `contracts/stellar/bindings/src/protocol.ts` (only the `networks` block, regenerated by the script), `contracts/stellar/bindings/README.md`
- **Read first:** `contracts/stellar/deploy.sh` lines 30-80 (config), 291-373 (`update_contracts_json`), 414-476 (bindings), 480-540 (flag parsing), 655-737 (`deploy_contract`); `contracts/stellar/bindings/src/protocol.ts` lines 34-47; `contracts/stellar/bindings/README.md`
- **Action:** Per D-09/D-10.
  1. `deploy.sh:35`: `CONTRACTS_JSON_FILE="bindings/src/contracts.json"`. Add a `--version <v1|v2|...>` flag (variable `contract_version`, required when `--protocol` is set; validate with `^v[0-9]+$`). Add `SDK_VERSION` read from `Cargo.toml`: `grep -oP 'soroban-sdk = \{ version = "\K[^"]+' Cargo.toml`.
  2. `update_contracts_json`: signature becomes `(network, version, contract_id, tx_hash, timestamp, ledger, wasm_hash)`. The jq data becomes `{id, sdk: $sdk, deployedAt: $ts, deployedLedger: ($ledger|tonumber), txHash: $hash, wasmHash: $wasm}` and the merge filter `.[$net] |= (if . == null then {current: $ver} else . end) | .[$net][$ver] = $data` — it never overwrites another version and never changes an existing `current` (flipping `current` is an explicit step in Plans VI/VII). Keep the mktemp / verify / `mv -f` structure unchanged. Create `contracts/stellar/scripts/sync-deployments.sh` (`#!/usr/bin/env bash`, `set -euo pipefail`, `cd "$(dirname "$0")/.."`) that regenerates the `deployments.json` alias from the registry: `tmp=$(mktemp)`; `jq 'with_entries(select(.value.current != null and .value[.value.current] != null)) | map_values({protocol: (.[.current] | {id, hash: .txHash, timestamp: .deployedAt})})' bindings/src/contracts.json > "$tmp"`; `jq -e . "$tmp" >/dev/null`; `mv -f "$tmp" deployments.json` (a network with no entries is skipped by the `select`). `chmod +x` it and add `"sync-deployments": "bash scripts/sync-deployments.sh"` to `contracts/stellar/package.json` scripts. In `deploy.sh`, call `bash scripts/sync-deployments.sh` immediately after every successful `update_contracts_json` write. Plans VI and VII call the same script after flipping `current`.
  3. `deploy_contract`: after extracting `tx_hash`, obtain the ledger with `stellar tx fetch --hash "$tx_hash" --network "$network_name" --output json | jq -r .ledger` (fall back to `curl -s <horizon>/transactions/<hash> | jq .ledger` where horizon is `https://horizon-testnet.stellar.org` or `https://horizon.stellar.org`; if both fail store `null` and warn). Obtain `wasm_hash` from the `stellar contract deploy` output line containing the wasm hash, or `stellar contract info meta`/`sha256sum "$wasm_path"` when absent. Pass both to `update_contracts_json`.
  4. Create `contracts/stellar/scripts/sync-networks.mjs`: reads `bindings/src/contracts.json`, resolves `current` per network, and rewrites the `export const networks = { ... } as const` block in `bindings/src/protocol.ts` to exactly
     ```ts
     export const networks = {
       testnet: { networkPassphrase: "Test SDF Network ; September 2015", contractId: "<testnet current id>" },
       local: { networkPassphrase: "Test SDF Network ; September 2015", contractId: undefined },
       mainnet: { networkPassphrase: "Public Global Stellar Network ; September 2015", contractId: "<mainnet current id>" },
     } as const
     ```
     using a regex on `export const networks = \{[\s\S]*?\} as const`. Exit 1 if the block is not found. Add `"sync-networks": "node scripts/sync-networks.mjs"` to `contracts/stellar/package.json` scripts.
  5. In `generate_single_contract_bindings`, after moving `index.ts` → `bindings/src/protocol.ts`, run `node scripts/sync-networks.mjs`. Bindings generation must pass `--contract-id` of the version being deployed and `--overwrite`.
  6. `bindings/README.md`: remove the `--authority` references (lines 9-10, 17-21), document `--protocol --version v2 --bindings`, and add the sentence: "`deployments.json` is generated from `bindings/src/contracts.json` by `scripts/sync-deployments.sh`; edit the registry, not this file." 
  7. Run `node scripts/sync-networks.mjs` now (v1 IDs) and confirm `protocol.ts` is byte-identical except whitespace to the current block; run `bash scripts/sync-deployments.sh` now and confirm `deployments.json` still carries both v1 IDs; `bash -n deploy.sh` passes.
- **Done when:** `grep -n 'CONTRACTS_JSON_FILE="bindings/src/contracts.json"' contracts/stellar/deploy.sh` matches; `grep -c "deployedLedger\|wasmHash" contracts/stellar/deploy.sh` ≥ 2; `grep -n -- '--version' contracts/stellar/deploy.sh` matches in the usage text and the flag parser; `bash -n contracts/stellar/deploy.sh` exits 0; `grep -n "sync-deployments.sh" contracts/stellar/deploy.sh` matches; `test -x contracts/stellar/scripts/sync-deployments.sh`; `bash contracts/stellar/scripts/sync-deployments.sh && test "$(jq -r .testnet.protocol.id contracts/stellar/deployments.json)" = "$(jq -r '.testnet[.testnet.current].id' contracts/stellar/bindings/src/contracts.json)"` and the same equality for `mainnet`; `node contracts/stellar/scripts/sync-networks.mjs && git diff --stat contracts/stellar/bindings/src/protocol.ts` shows no substantive change; `grep -c "authority" contracts/stellar/bindings/README.md` = 0; `grep -n "sync-deployments" contracts/stellar/bindings/README.md` matches.
- **Covers:** D-09, D-10, RESEARCH overwrite pitfall, RESEARCH "bindings drop mainnet" pitfall

### III. Resolve contract IDs in `@attestprotocol/stellar-sdk` through the registry

- **Files:** `packages/stellar-sdk/src/client.ts`, `packages/stellar-sdk/src/types.ts`, `packages/stellar-sdk/src/index.ts`
- **Read first:** `packages/stellar-sdk/src/client.ts` lines 80-135, `packages/stellar-sdk/src/types.ts` lines 30-70, `packages/stellar-sdk/src/index.ts` lines 75-95, `contracts/stellar/bindings/src/registry.ts` (from task I)
- **Action:** Per D-10.
  1. `types.ts` `ClientOptions`: add `/** Registry version to resolve when contractId is not given; defaults to the network's current */ contractVersion?: 'v1' | 'v2'`. Remove the unused `contractAddresses?: {protocol?, authority?}` option at `types.ts:36-42` only if `grep -rn contractAddresses packages/ apps/` shows no other reference (record the result).
  2. `client.ts:102-113`: replace the `ProtocolNetworks.<net>.contractId` switch with
     ```ts
     let contractId = options.contractId
     if (!contractId) {
       const network = options.network === 'mainnet' ? 'mainnet' : 'testnet'
       contractId = getContractId(network, options.contractVersion)
     }
     ```
     (`futurenet`/`local` fall through to testnet exactly as today). Keep the `ConfigurationError` guard. Import `getContractId` from `@attestprotocol/stellar-contracts/registry`. Expose `this.resolvedContractId` unchanged.
  3. `index.ts`: add `export { contracts as ProtocolContracts, getContractId, getContractEntry, listContracts, type ContractEntry, type ContractVersion, type Network as ContractNetwork } from '@attestprotocol/stellar-contracts/registry'`. Keep the existing `ProtocolNetworks` re-export.
  4. `pnpm --filter @attestprotocol/stellar-sdk build && pnpm --filter @attestprotocol/stellar-sdk typecheck && pnpm --filter @attestprotocol/stellar-sdk lint` all exit 0. Add a unit test in the existing vitest setup asserting `new StellarAttestationClient({ rpcUrl: 'https://soroban-testnet.stellar.org', network: 'testnet', publicKey: 'G...' }).resolvedContractId === getContractId('testnet')` and that `contractVersion: 'v2'` before v2 exists throws `No v2 contract registered for testnet`.
- **Done when:** `grep -n "getContractId(network, options.contractVersion)" packages/stellar-sdk/src/client.ts` matches; `grep -c "ProtocolNetworks\.\(mainnet\|testnet\)\.contractId" packages/stellar-sdk/src/client.ts` = 0; `grep -n "contractVersion" packages/stellar-sdk/src/types.ts` matches; `pnpm --filter @attestprotocol/stellar-sdk typecheck` and `... test` exit 0.
- **Covers:** D-02, D-10, RESEARCH "Don't Hand-Roll: network switch"

## Nyquist criteria for this plan

- [ ] `@attestprotocol/stellar-contracts/registry` resolves from `apps/horizon` at runtime and returns the v1 mainnet ID.
- [ ] `deployments.json` is byte-identical to what `deploy.sh`'s alias step generates from `contracts.json` (run the jq once against the seeded registry and diff); only `package.json` `files` and `deploy.sh` reference it.
- [ ] `deploy.sh` syntax-checks and writes `.[$net][$version]` without touching `current`.
- [ ] `sync-networks.mjs` is idempotent on the current `protocol.ts`.
- [ ] stellar-sdk typecheck, lint and tests pass with registry-based resolution.

## Risks accepted in this plan

- `deploy.sh` changes are exercised for real only in Plan VI (testnet); `bash -n` plus a dry read are the checks here.
- The JSON import attribute may force `module: NodeNext` in `contracts/stellar/tsconfig.json`; accepted, recorded if it happens.
- `wasmHash` for v1 entries stays `null` (not recoverable from the deploy tx without an archive query).
- ESM-into-CJS boundary: `@attestprotocol/stellar-contracts` is ESM (`"type": "module"`) and horizon is CommonJS on Node 20; `require('@attestprotocol/stellar-contracts/registry')` works only via Node 20.19+ `require(esm)` with the JSON import attribute. Task I step 7 verifies it under Node 20 and prescribes a CJS emit if it fails; the residual risk is a Node 20 patch level on Railway older than 20.19.
