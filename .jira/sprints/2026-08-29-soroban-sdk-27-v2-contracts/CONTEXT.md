---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
created: 2026-08-29
status: ready_for_planning
---

# Context: 2026-08-29-soroban-sdk-27-v2-contracts

User's locked decisions for this sprint. Once written here, decisions are NON-NEGOTIABLE for downstream agents.

## Phase boundary

Delivers: `contracts/stellar` on soroban-sdk 27.0.6 with 77 cargo tests green and a `wasm32v1-none` build via stellar-cli 27.1.0; a per-network versioned contract registry consumed by `@attestprotocol/stellar-contracts`, `@attestprotocol/stellar-sdk`, `apps/horizon` and `apps/docs`; horizon indexing every registered contract with `GET /api/contracts` and `?contract=`/`?version=` filters; v2 deployed and registered on testnet (executor) and mainnet (user, at a human checkpoint); `@attestprotocol/stellar-sdk` + `@attestprotocol/stellar-contracts` major via changesets; docs contract IDs from one snippet and the 7 ASCII diagrams as native mermaid with visual QA in light and dark.

Does not deliver: migration of v1 state, Solana/Starknet/Aptos/Sui, code changes in the separate `daccred/attest.next` repo, `#[contractevent]` adoption.

## Decisions

### Locked by the user (conversation before planning)

- **D-01:** New v2 contracts are deployed; there is no in-place upgrade. Mainnet `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI` and testnet `CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP` stay live as `v1`; existing state does not migrate.
- **D-02:** Contract addresses become a versioned registry keyed `{network: {v1: {...}, v2: {...}, current}}`, consumed by the SDK, horizon and docs. No hardcoded IDs remain in runtime code; README/docs render from the registry or a snippet fed by it.
- **D-03:** Horizon pins datasets to the contract address (columns `Attestation.contractAddress`, `Schema.contractAddress`, `Transaction.contractId`, `HorizonEvent.contractId`, `HorizonOperation.contractId` already exist — no Prisma schema change). Horizon exposes `GET /api/contracts` returning the registry for `STELLAR_NETWORK` with `current`, and accepts `?contract=` and `?version=` on data endpoints. The attest.next frontend (separate repo) will read `/api/contracts` instead of `NEXT_PUBLIC_*_CONTRACT_ID`; this repo's obligation is the endpoint plus its documented response shape.
- **D-04:** Railway environment changes are documented (exact keys and values) for the user to apply. The agent never applies them.
- **D-05:** Docs: convert the ASCII box-drawing diagrams to native ```` ```mermaid ```` fences (Mintlify renders them). Visual QA with `agent-browser` against `mintlify dev` in both colour schemes on every touched page. Screenshots into `apps/docs/images/diagrams/` only as a fallback where a mermaid diagram renders badly (light/dark `<img>` pair, pattern from `apps/docs/chains/stellar/overview.mdx:6-16`). Contract IDs on docs pages come from one reusable snippet.
- **D-06:** Logical waves: (1) Compile, (2) Registry + horizon, (3) Testnet v2, (4) Mainnet v2, (5) Docs. Wave 5 diagrams run in parallel with wave 2 (they are scheduled in execution wave I here, which is earlier and equally safe); only the docs ID change depends on waves 3/4. Wave 4 (mainnet deploy, `current` flip, SDK major) requires the user's signing keys and explicit go-ahead: it is planned as tasks with an explicit human checkpoint, never executed unattended.

### Locked from RESEARCH.md recommendations (rationale recorded)

- **D-07:** Keep `env.events().publish` in v2 with `#[allow(deprecated)]` on each call site in `protocol/src/events.rs` and a comment tying the layout to horizon's decoders (`ingest.repository.ts:632-649`, `backfill.repository.ts:626-643`, `events.repository.ts:512`). `#[contractevent]` changes the topic/data wire layout horizon decodes and is deferred (RESEARCH "Common Pitfalls", "Open questions for planner" #1).
- **D-08:** Toolchain: soroban-sdk `27.0.6`, stellar-cli `27.1.0` (SDF's mainnet pairing; 27.0.0's TS template pins the wrong JS SDK, 28 is unverified against sdk 27), Rust stable (1.97.1 local, sdk MSRV 1.91), target `wasm32v1-none`. Build wasm with `stellar contract build`, not bare `cargo build`. None of stellar-cli, the wasm target, or agent-browser are installed on this machine — installation is a planned task.
- **D-09:** Registry location and shape. File: `contracts/stellar/bindings/src/contracts.json` (inside the `tsconfig.json` `include` and therefore inside `dist/`, which `apps/horizon/Dockerfile:59` copies). Typed accessor: `contracts/stellar/bindings/src/registry.ts`, published as the `@attestprotocol/stellar-contracts/registry` export. `contracts/stellar/deployments.json` is **kept for one release as a generated alias** (user decision 2026-08-29): `deploy.sh` regenerates it from `contracts.json` (`{network: {protocol: {id, hash, timestamp}}}` using each network's `current` entry) after every registry write, it stays in `package.json` `files`, and nothing new reads it. Removal is deferred (see Deferred ideas). Shape:
  ```json
  {
    "testnet": {
      "v1": { "id": "C...", "sdk": "22.0.8", "deployedAt": "2025-11-07T12:44:26Z", "deployedLedger": 123, "txHash": "5f91...", "wasmHash": null },
      "v2": { "id": "C...", "sdk": "27.0.6", "deployedAt": "...", "deployedLedger": 456, "txHash": "...", "wasmHash": "..." },
      "current": "v1"
    },
    "mainnet": { "...": "..." }
  }
  ```
  `deployedLedger` exists so horizon can backfill a newly registered contract from its own start (global cursor, D-14). `wasmHash` is the installed wasm hash (source validation); `txHash` is the deploy transaction hash (what `deploy.sh` already captures). `deploy.sh` writes `.[$net][$version]` and never touches `current`; `current` is flipped explicitly with `jq` in the wave that verified the deployment.
- **D-10:** `getContractId(network, version?)` (version defaults to `current`) is exported from `@attestprotocol/stellar-contracts/registry` together with `contracts`, `getContractEntry`, `listContracts`, and re-exported from `@attestprotocol/stellar-sdk`. `ClientOptions` gains `contractVersion?: 'v1' | 'v2'`; resolution order in `client.ts` stays explicit `contractId` > registry lookup by `network` + `contractVersion`. The bindings `networks` const in `protocol.ts` is regenerated from `contracts.json` by a script (`contracts/stellar/scripts/sync-networks.mjs`) after every bindings generation — never hand-edited (RESEARCH "To deliberately not imitate").
- **D-11:** Horizon env semantics. `INDEX_CONTRACT_IDS` is a comma-separated list of addresses to index; when unset, horizon indexes every entry of the registry for `STELLAR_NETWORK`. `PROTOCOL_CONTRACT_ID` is the ingest attribution target only (the address used where a single contract is required: the `[0]` fallbacks in `ingest.repository.ts:1026` and `backfill.repository.ts:1023`); when unset it defaults to `getContractId(STELLAR_NETWORK)`. `AUTHORITY_CONTRACT_ID` is removed. The exported const keeps the name `CONTRACT_IDS_TO_INDEX` so the nine consumer files are untouched; the `as string` casts go away.
- **D-12:** Filter parameter names are `contract` (address) and `version` (registry key resolved server-side against `STELLAR_NETWORK`; unknown version → 400). Applied to `/api/registry/attestations`, `/api/registry/schemas`, `/api/data/events`, `/api/data/operations`. No alias parameters.
- **D-13:** `GET /api/contracts` response: `{ success: true, data: { network, current, contracts: { v1?: entry, v2?: entry }, indexing: string[] } }`; `GET /api/contracts/:version` returns one entry or 404. Mounted like the other routers in `app.ts`.
- **D-14:** Cursor: no new Prisma model (no schema push in this sprint). After registering a new contract, run one backfill from its `deployedLedger` via the existing `POST /api/ingest/backfill { startLedger }`. The instruction is part of the deploy tasks and the Railway runbook.
- **D-15:** JS SDK: regenerated bindings target `@stellar/stellar-sdk` 16.x. In the testnet wave, `contracts/stellar/package.json` and `packages/stellar-sdk/package.json` peer range become `>=16.0.0 <17` and `apps/horizon/package.json` moves to `^16.3.0`. v17 is excluded (XDR API overhaul). The coupled major of `@attestprotocol/stellar-contracts` and `@attestprotocol/stellar-sdk` ships in the mainnet wave.
- **D-16:** `.github/workflows/soroban-release.yml`: pin `stellar-expert/soroban-build-workflow` to `@v27.0.0` and delete the `release-authority` job (its directory no longer exists).
- **D-17:** `.changeset/config.json` `baseBranch` becomes `canary` (the default branch) in the mainnet wave; the changeset names both `@attestprotocol/stellar-contracts: major` and `@attestprotocol/stellar-sdk: major` (`updateInternalDependencies: "patch"` would otherwise only patch-bump the SDK).
- **D-18:** Docs scope: the 7 box-drawing blocks identified in research-codebase.md (attestations L27-31, authorities L24-44, delegates L10-29 and L191-195, how-it-works L8-16, resolvers L25-53, schemas L10-27). Code fences with language tags and prose tree-text are not diagrams and are untouched. Contract IDs come from `apps/docs/snippets/contracts.mdx` exporting `testnetV1`, `testnetV2`, `mainnetV1`, `mainnetV2`, `testnetCurrent`, `mainnetCurrent` constants, imported on `introduction.mdx`, `stellar/reference.mdx`, `stellar/getting-started.mdx`, `concepts/authorities.mdx`.
- **D-19:** HAL-07 residual: v2 adds the sdk-26 host checks after `from_bytes` — `g1_is_on_curve` + `g1_is_in_subgroup` on the caller-supplied signature and `g2_is_on_curve` + `g2_is_in_subgroup` on the public key at registration — returning `Error::InvalidSignaturePoint` instead of trapping. The flag-byte pre-checks stay (cheap, still useful). The version-pinned comment block in `crypto.rs:127-168,314-320,355-357` is rewritten as behavioural statements without sdk line numbers.
- **D-20:** Cargo workspace version becomes `2.0.0` (`contracts/stellar/Cargo.toml` `[workspace.package] version`), matching the "v2" contract generation.
- **D-21:** Testnet deployer identity: if `contracts/stellar/env.sh` provides `SOURCE_IDENTITY`, use it; otherwise the executor generates and funds `attest-v2-testnet` with `stellar keys generate attest-v2-testnet --network testnet --fund` and records the identity name in EXECUTION.md. That identity is the v2 testnet admin and supplies `ADMIN_SECRET_KEY` for the vitest integration suite (`stellar keys show attest-v2-testnet`).

## Claude's discretion

- Mermaid diagram type per block (flowchart / sequenceDiagram / stateDiagram-v2) and any `%%{init: {...}}%%` theme directive chosen during the dark-mode QA pass.
- Per-test handling of sdk-25 resource limits: optimise or `env.cost_estimate().disable_resource_limits()` on that test only; never blanket-disable in `testutils.rs`. Any BLS entrypoint that exceeds mainnet limits in a test is recorded in EXECUTION.md as a mainnet finding.
- Shape of the `registry.ts` TypeScript types and the helper `resolveContractFilter` in horizon.
- Wording of README / runbook updates.

- **D-22:** (2026-08-30, user) The stellar-sdk off-chain encoding bugs found in Plan VI (`uidGenerator.ts` BytesN<32> XDR prefix; `delegation.ts` contract component must be `sha256(contract_xdr)`) are fixed inside this sprint as Plan IX (wave IV-b), before the Plan VII release — not deferred to a follow-up issue.

## Deferred ideas

- Remove `contracts/stellar/deployments.json` and its `files` entry one release after the registry ships (it is a generated alias of `contracts.json` `current` until then).

- `#[contractevent]` migration with coordinated horizon decoder change → next sprint.
- Code changes in `daccred/attest.next` to read `/api/contracts` → separate repo, after this sprint.
- Per-contract cursor model (`IndexedContract` with `startLedger`) → future; D-14 covers this sprint.
- Migrating v1 schemas/attestations/authorities to v2 → never (brief).
- Solana, Starknet, Aptos, Sui contracts → out of scope (brief).
- Removing the stale `packages/cli` authority command surface and `contracts/stellar/readme.txt` authority section → future cleanup; not touched here.

## Canonical references

- `.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/BRIEF.md` — scope and constraints.
- `.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/RESEARCH.md` — primary recommendation, pitfalls, migration checklist.
- `.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/research-codebase.md` — every `path:line` cited in plans.
- `.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/research-patterns.md` — router/repository pattern, deploy.sh registry writer, changeset convention.
- `.jira/sprints/2026-08-29-soroban-sdk-27-v2-contracts/research-external.md` — sdk 22→27 migration checklist, stellar-cli bindings output, Mintlify mermaid/snippets, Railway env.
- https://docs.rs/soroban-sdk/27.0.6/soroban_sdk/_migrating/index.html — official migration guide.
