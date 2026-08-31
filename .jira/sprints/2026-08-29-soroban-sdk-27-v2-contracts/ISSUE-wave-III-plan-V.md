---
shape: wave
domain: backend
wave: III
plan: V
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
covers: [D-03, D-04, D-11, D-12, D-13, D-14]
title: "Index every registered contract and expose the contract registry over the API"
status: pushed
issue: 116
url: https://github.com/daccred/attestprotocol/issues/116
pushed_at: 2026-08-29T23:10:26Z
---

Part of moving the Stellar contracts to soroban-sdk 27 and redeploying them as a versioned v2 — step 3 of 6.

**Domain**: backend
**Depends on**: #115 (versioned contract-address registry)
**Blocks**: both deployment steps, which fill in the addresses this service is configured with.

## Goal

Have the indexer service in [`apps/horizon`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon) index every contract listed in the registry rather than a single configured address, serve that registry at `GET /api/contracts`, and accept `contract` and `version` filters on its data endpoints.

## Background

The indexer watches Soroban contract events and stores attestations, schemas, transactions and raw events in Postgres. Its target addresses come from environment variables, and its exported constant is cast from a possibly-undefined value, so a missing variable becomes an empty index list at run time rather than a startup failure.

Once a second generation of contracts is deployed alongside the first, the service has to index both and consumers have to be able to ask which addresses exist and which is current. No database change is needed: every stored row already carries the contract it came from — `contractAddress` on attestations and schemas, `contractId` on transactions, events and operations.

Decisions already made that this step must respect:

- `INDEX_CONTRACT_IDS` is a comma-separated list of addresses to index. When it is unset, the service indexes every contract the registry lists for the configured network.
- `PROTOCOL_CONTRACT_ID` narrows to a single address only where one is structurally required — the attribution fallback in the ingestion and backfill repositories. When unset it defaults to the registry's current contract. `AUTHORITY_CONTRACT_ID` is removed; that contract is no longer part of the protocol.
- The exported constant keeps its existing name so the nine files that consume it are untouched by this change.
- The filter parameters are named `contract` (an address) and `version` (a registry key, resolved server-side against the configured network; an unknown version is a 400). No aliases.
- `GET /api/contracts` returns `{ success: true, data: { network, current, contracts: { … }, indexing: [ … ] } }`, and `GET /api/contracts/:version` returns a single entry or 404. This response shape is the contract that the separate front-end repository will read instead of its own build-time address variables.
- Deployment-platform environment changes are documented here with exact keys and values, and applied by a person — never by automation.
- Catching up a newly registered contract is done with one backfill from its recorded deploy ledger through the existing backfill endpoint. No per-contract cursor is introduced.

Intentionally out of scope for this step:

- Any database schema change, and any per-contract cursor model.
- Changes in the separate front-end repository; this step owes it the endpoint and its documented response shape.

## Changes

- `apps/horizon/src/common/registry.ts` (new) — wraps the registry accessors and adds `resolveContractFilter(network, contract?, version?)`, which returns the address when one is given, resolves a version through the registry otherwise, and throws a range error naming the unknown version.
- [`apps/horizon/src/common/constants.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/common/constants.ts) (lines 27-38) — derive the indexed address list from `INDEX_CONTRACT_IDS` or, when empty, from the registry; default the attribution address to the registry's current contract; fail at module load if the network is neither testnet nor mainnet, or if the attribution address is not among the indexed addresses. The `as string` casts and `AUTHORITY_CONTRACT_ID` go away, and the multi-line startup banner becomes one line naming the network, the indexed addresses and the attribution target.
- [`apps/horizon/src/repository/ingest.repository.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/repository/ingest.repository.ts) (line 1026) and [`apps/horizon/src/repository/backfill.repository.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/repository/backfill.repository.ts) (line 1023) — the "first indexed address, or null" fallback becomes the explicit attribution address, so attribution no longer depends on list order.
- `apps/horizon/src/router/contracts.router.ts` (new) and [`apps/horizon/src/app.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/app.ts) — the two registry endpoints, mounted and logged like the existing routers.
- [`apps/horizon/src/repository/attestations.repository.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/repository/attestations.repository.ts) and [`apps/horizon/src/repository/schemas.repository.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/repository/schemas.repository.ts) — filters gain an optional contract address, applied to the query only when set.
- [`apps/horizon/src/router/registry.router.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/router/registry.router.ts) and [`apps/horizon/src/router/data.router.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/src/router/data.router.ts) — the attestations, schemas, events and operations handlers accept `contract` and `version`, resolve them, and map an unknown version to a 400. The events and operations endpoints keep accepting their existing `contractId` parameter for compatibility; the new parameters take precedence.
- `apps/horizon/__tests__/contracts.unit.test.ts` (new), plus the constants mocks in [`endpoints.unit.test.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/__tests__/endpoints.unit.test.ts) and [`indexer-sdk.unit.test.ts`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/__tests__/indexer-sdk.unit.test.ts) — those mocks replace the whole constants module, so a new export is silently undefined in tests unless the mock is updated.
- [`apps/horizon/.env.example`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/.env.example) — drop the authority variable, document the two remaining ones.
- [`apps/horizon/railway.toml`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/railway.toml) — watch `contracts/stellar/**` so a registry change rebuilds the image; today it does not, and a registry edit would not reach the deployed service.
- [`apps/horizon/README.md`](https://github.com/daccred/attestprotocol/blob/canary/apps/horizon/README.md) (lines 136-149) — replace the hardcoded "Tracked Contracts" list with the registry path, the variable semantics, the `/api/contracts` response shape, the filter parameters, a "registering a new contract" procedure ending in the backfill call, and a deployment-variables section stating the exact keys and values for a person to apply.

## Verification

- [ ] `pnpm --filter horizon lint:ts`, `pnpm --filter horizon lint` and `pnpm --filter horizon test:unit` all exit 0.
- [ ] With `INDEX_CONTRACT_IDS` unset, the indexed address list equals every address the registry lists for the configured network — asserted in a unit test.
- [ ] Starting the service with an attribution address that is not among the indexed addresses fails at startup with a message naming both, rather than starting and mis-attributing rows.
- [ ] `GET /api/contracts` returns 200 with `data.current` equal to the registry's current version and `data.indexing` equal to the indexed address list; `GET /api/contracts/v9` returns 404.
- [ ] `GET /api/registry/attestations?version=v1` queries with the contract address the registry maps `v1` to; `?version=v9` returns 400; `?contract=<address>` filters on that address verbatim. The same for schemas, events and operations.
- [ ] `grep -n 'AUTHORITY_CONTRACT_ID\|as string' apps/horizon/src/common/constants.ts` returns nothing, and `grep -rn 'CONTRACT_IDS_TO_INDEX\[0\]' apps/horizon/src` returns nothing.
- [ ] `grep -n 'contracts/stellar/\*\*' apps/horizon/railway.toml` matches.
- [ ] The README documents `/api/contracts` and contains no hardcoded contract address.

## Rollout

Requires an operator action after merge: set `STELLAR_NETWORK`, `INDEX_CONTRACT_IDS` and `PROTOCOL_CONTRACT_ID` on the deployed indexer services, and remove `AUTHORITY_CONTRACT_ID`. The exact values are written into the service README by the two deployment steps that follow; until they are applied, the deployed service keeps indexing the existing contract, which is the current behaviour.

## Risks

- The integration test suite needs a Postgres instance and is not run here; the unit tests cover the routing and filter logic, not the database round trip.
- The ingestion cursor stays global, so a newly registered contract is only caught up by the explicit backfill call in the procedure above. Missing that step means the new contract's early history is absent while everything still looks healthy.
- The indexer's CommonJS build imports the registry from an ES module package. The previous step proves that boundary on Node 20; if the build or image nonetheless fails on it, the fallback is a cached dynamic import in the registry wrapper.
