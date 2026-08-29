---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
plan: V
wave: III
goal: Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
worktree: false
branch: jira/2026-08-29-soroban-sdk-27-v2-contracts
issue: none
depends_on: [IV]
parallel_with: []
files_modified:
  - apps/horizon/src/common/constants.ts
  - apps/horizon/src/common/registry.ts
  - apps/horizon/src/repository/ingest.repository.ts
  - apps/horizon/src/repository/backfill.repository.ts
  - apps/horizon/src/repository/attestations.repository.ts
  - apps/horizon/src/repository/schemas.repository.ts
  - apps/horizon/src/router/contracts.router.ts
  - apps/horizon/src/router/registry.router.ts
  - apps/horizon/src/router/data.router.ts
  - apps/horizon/src/app.ts
  - apps/horizon/__tests__/endpoints.unit.test.ts
  - apps/horizon/__tests__/indexer-sdk.unit.test.ts
  - apps/horizon/__tests__/contracts.unit.test.ts
  - apps/horizon/.env.example
  - apps/horizon/railway.toml
  - apps/horizon/README.md
covers:
  - D-03
  - D-04
  - D-11
  - D-12
  - D-13
  - D-14
  - "RESEARCH: constants.ts as-string casts; unit-test mocks replace the whole constants module; railway watchPatterns exclude contracts/stellar"
  - "RESEARCH: To imitate — registry.router.ts → schemas.repository.ts pattern; comma-list env parsing"
  - "GOAL: horizon indexes every registered contract and exposes the registry"
---

# Plan V: Horizon multi-contract indexing, `/api/contracts`, contract filters

**Sprint goal:** Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
**Worktree:** false — sequential waves share `node_modules`, `target/` and `dist/` build caches on one checkout, and Plans VI/VII need the deployed registry state of that same checkout.
**This plan delivers:** horizon reading the registry from `@attestprotocol/stellar-contracts/registry`, indexing every registered contract (or an explicit `INDEX_CONTRACT_IDS` list), a `/api/contracts` router, `contract`/`version` filters on the four data endpoints, updated unit tests, and the env/runbook documentation the user needs for Railway. No Prisma schema change (D-03/D-14), so no schema push task.

## Tasks

### I. Source the indexed contract set from the registry

- **Files:** `apps/horizon/src/common/constants.ts`, `apps/horizon/src/common/registry.ts` (new), `apps/horizon/src/repository/ingest.repository.ts`, `apps/horizon/src/repository/backfill.repository.ts`
- **Read first:** `apps/horizon/src/common/constants.ts` (whole file), `ingest.repository.ts` lines 1010-1030, `backfill.repository.ts` lines 1010-1030, `contracts/stellar/bindings/src/registry.ts`, CONTEXT.md D-11/D-14
- **Action:**
  1. Create `apps/horizon/src/common/registry.ts`:
     ```ts
     import { contracts, getContractId, getContractEntry, listContracts, type Network, type ContractVersion } from '@attestprotocol/stellar-contracts/registry'
     export function networkRegistry(network: Network) { return contracts[network] }
     export function resolveContractFilter(network: Network, contract?: string, version?: string): string | undefined
     export { getContractId, getContractEntry, listContracts, type Network, type ContractVersion }
     ```
     `resolveContractFilter` returns `contract` when given; else when `version` is given returns `getContractId(network, version as ContractVersion)` and throws `new RangeError(\`Unknown contract version '${version}' for ${network}\`)` when the registry has no such key; else `undefined`.
  2. `constants.ts`: per D-11 replace lines 27-38 with
     ```ts
     export const STELLAR_NETWORK = (process.env.STELLAR_NETWORK || 'testnet') as Network
     const indexFromEnv = (process.env.INDEX_CONTRACT_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
     export const CONTRACT_IDS_TO_INDEX: string[] = indexFromEnv.length > 0 ? indexFromEnv : listContracts(STELLAR_NETWORK).map(c => c.id)
     export const PROTOCOL_CONTRACT_ID: string = process.env.PROTOCOL_CONTRACT_ID || getContractId(STELLAR_NETWORK)
     ```
     Throw at module load if `STELLAR_NETWORK` is not `testnet` or `mainnet`, or if `PROTOCOL_CONTRACT_ID` is not in `CONTRACT_IDS_TO_INDEX`. Remove `AUTHORITY_CONTRACT_ID` and the `length === 0` warning (it can no longer be empty). Replace the emoji/banner `console.log` block (lines 88-101) with one `console.log` line: `horizon: network=${STELLAR_NETWORK} indexing=${CONTRACT_IDS_TO_INDEX.join(',')} target=${PROTOCOL_CONTRACT_ID}` (skip when `NODE_ENV === 'test'`).
  3. `ingest.repository.ts:1026` and `backfill.repository.ts:1023`: `return CONTRACT_IDS_TO_INDEX[0] || null` → `return PROTOCOL_CONTRACT_ID` (import it). No other consumer changes: the exported name `CONTRACT_IDS_TO_INDEX` is kept on purpose.
  4. `pnpm --filter horizon lint:ts` exits 0 (unit tests are updated in task III; they will fail in between, which is expected).
- **Done when:** `grep -n "AUTHORITY_CONTRACT_ID\|as string" apps/horizon/src/common/constants.ts` returns nothing; `grep -n "INDEX_CONTRACT_IDS" apps/horizon/src/common/constants.ts` matches; `grep -rn "CONTRACT_IDS_TO_INDEX\[0\]" apps/horizon/src` returns nothing; `pnpm --filter horizon lint:ts` exits 0.
- **Covers:** D-11, D-14, RESEARCH as-string pitfall

### II. Add `/api/contracts` and `contract`/`version` filters

- **Files:** `apps/horizon/src/router/contracts.router.ts` (new), `apps/horizon/src/app.ts`, `apps/horizon/src/router/registry.router.ts`, `apps/horizon/src/router/data.router.ts`, `apps/horizon/src/repository/attestations.repository.ts`, `apps/horizon/src/repository/schemas.repository.ts`
- **Read first:** `registry.router.ts` lines 100-180 and 300-360, `data.router.ts` lines 50-110 and 200-240, `attestations.repository.ts` lines 100-160, `schemas.repository.ts` lines 25-40 and 100-160, `app.ts` lines 25-45, `research-patterns.md` "router / repository / Prisma filter"
- **Action:** Per D-12/D-13.
  1. `contracts.router.ts`: `GET /` responds `{ success: true, data: { network: STELLAR_NETWORK, current: registry.current, contracts: { v1?, v2? }, indexing: CONTRACT_IDS_TO_INDEX } }` built from `networkRegistry(STELLAR_NETWORK)`; `GET /:version` responds `{ success: true, data: entry }` or `404 { success: false, error: "Unknown contract version 'vX' for <network>" }`. Route constants at the top like `registry.router.ts:29-34`. Mount in `app.ts` as `app.use('/api/contracts', contractsRouter)` plus the matching `logRouter` line.
  2. `attestations.repository.ts` `AttestationFilters` gains `contractAddress?: string`; `schemas.repository.ts` `SchemaFilters` gains `contractAddress?: string`; both `where` builders add `if (contractAddress) where.contractAddress = contractAddress` (preserving the "omit empty where" behaviour).
  3. `registry.router.ts` attestations and schemas handlers: destructure `contract` and `version` from `req.query`; `const contractAddress = resolveContractFilter(STELLAR_NETWORK, contract, version)` inside a try; a `RangeError` maps to `400 { success: false, error: err.message }`; set `filters.contractAddress` when defined. No alias names.
  4. `data.router.ts` `/events` (~line 70) and `/operations` (~line 211): accept `contract` and `version` the same way and feed the resolved address into the existing `contractId` where clause (keep accepting the existing `contractId` query parameter for compatibility; `contract`/`version` take precedence).
  5. `pnpm --filter horizon lint:ts` exits 0.
- **Done when:** `grep -n "'/api/contracts'" apps/horizon/src/app.ts` shows the `use` and `logRouter` lines; `grep -c "contractAddress" apps/horizon/src/repository/attestations.repository.ts apps/horizon/src/repository/schemas.repository.ts` ≥ 2 each; `grep -n "resolveContractFilter" apps/horizon/src/router/registry.router.ts apps/horizon/src/router/data.router.ts` shows 2 uses each; `pnpm --filter horizon lint:ts` exits 0.
- **Covers:** D-03, D-12, D-13, RESEARCH "To imitate" pattern

### III. Unit tests, env example, Railway runbook, README

- **Files:** `apps/horizon/__tests__/endpoints.unit.test.ts`, `apps/horizon/__tests__/indexer-sdk.unit.test.ts`, `apps/horizon/__tests__/contracts.unit.test.ts` (new), `apps/horizon/.env.example`, `apps/horizon/railway.toml`, `apps/horizon/README.md`
- **Read first:** both existing unit tests (lines 1-40), `apps/horizon/__tests__/fixtures/unit-setup.ts`, `apps/horizon/.env.example`, `apps/horizon/railway.toml`, `apps/horizon/README.md` lines 120-160, RESEARCH.md "Unit-test mocks silently drop new exports"
- **Action:**
  1. Update both `vi.mock('../src/common/constants', ...)` factories to also export `PROTOCOL_CONTRACT_ID: 'CAAAAA'`. Add `vi.mock('../src/common/registry', ...)` in the new `contracts.unit.test.ts` returning a fixed registry (`{ current: 'v1', v1: { id: 'CAAAAA', ... } }`) and `resolveContractFilter` implemented against it; tests: `GET /api/contracts` → 200 with `data.current === 'v1'` and `data.indexing` equal to the mocked list; `GET /api/contracts/v9` → 404; `GET /api/registry/attestations?version=v1` → `attestation.findMany` called with `where.contractAddress === 'CAAAAA'`; `?version=v9` → 400; `?contract=CZZZ` → `where.contractAddress === 'CZZZ'`. Reuse the `mockDb` shape from `indexer-sdk.unit.test.ts:5-11`.
  2. `.env.example`: remove `AUTHORITY_CONTRACT_ID`; set `PROTOCOL_CONTRACT_ID` to the testnet v1 ID with the comment `# ingest attribution target; must be one of INDEX_CONTRACT_IDS; defaults to the registry's current`; add `INDEX_CONTRACT_IDS=` with the comment `# comma-separated; empty = every contract in the registry for STELLAR_NETWORK`.
  3. `railway.toml` `watchPatterns = ["apps/horizon/**", "contracts/stellar/**", "packages/stellar-sdk/**", "packages/core/**"]` so registry changes rebuild the image.
  4. `README.md`: replace the "Tracked Contracts" section (lines 136-149, stale IDs) with: the registry file path, the `INDEX_CONTRACT_IDS`/`PROTOCOL_CONTRACT_ID` semantics, the `/api/contracts` response shape (the JSON from task II, stated as the contract the attest.next frontend reads per D-03), the `contract`/`version` filters, and a "Registering a new contract" procedure: edit registry → deploy → `curl -X POST $HORIZON/api/ingest/backfill -H 'content-type: application/json' -d '{"startLedger": <deployedLedger>}'` (D-14). Add a "Railway variables" subsection stating that the agent documents and the user applies (D-04), listing `STELLAR_NETWORK`, `INDEX_CONTRACT_IDS`, `PROTOCOL_CONTRACT_ID` with the values to set after each deployment (written as `<testnet v2 id>` / `<mainnet v2 id>` here; Plans VI and VII replace them with the deployed IDs).
  5. `pnpm --filter horizon test:unit` and `pnpm --filter horizon lint` exit 0.
- **Done when:** `pnpm --filter horizon test:unit` exits 0 including `contracts.unit.test.ts`; `grep -c "AUTHORITY_CONTRACT_ID" apps/horizon/.env.example apps/horizon/README.md` = 0 for both; `grep -n "contracts/stellar/\*\*" apps/horizon/railway.toml` matches; `grep -n "/api/contracts" apps/horizon/README.md` matches; `grep -n "CADB73\|CAD6YM" apps/horizon/README.md` returns nothing.
- **Covers:** D-03, D-04, D-14, RESEARCH mocks pitfall, RESEARCH watchPatterns pitfall

## Nyquist criteria for this plan

- [ ] `pnpm --filter horizon lint:ts`, `lint`, `test:unit` all exit 0.
- [ ] With no `INDEX_CONTRACT_IDS`, `CONTRACT_IDS_TO_INDEX` equals the registry's IDs for `STELLAR_NETWORK` (assert in a unit test or a `node -e` check recorded in EXECUTION.md).
- [ ] `/api/contracts`, `/api/contracts/:version`, and the four filtered endpoints behave per D-12/D-13 in unit tests.
- [ ] README and `.env.example` describe the new variables; `railway.toml` watches `contracts/stellar/**`.

## Risks accepted in this plan

- Integration tests (`test:integration`) need a Postgres and are not run here; unit tests cover the routing and filter logic.
- The global ingest cursor remains (D-14); the backfill-from-`deployedLedger` step is procedural, documented in the README and executed in Plans VI/VII.
- Railway variables are applied by the user (D-04); horizon on Railway keeps indexing v1 until then.
- ESM-into-CJS boundary: horizon's CommonJS build `require`s the ESM `@attestprotocol/stellar-contracts/registry` export. Plan IV task I step 7 proved this under Node 20 (or shipped a CJS emit); if `pnpm --filter horizon build` or the Docker image fails with `ERR_REQUIRE_ESM`, switch `apps/horizon/src/common/registry.ts` to load the registry with `await import('@attestprotocol/stellar-contracts/registry')` behind a cached promise and record it in EXECUTION.md.
