# Research: patterns — 2026-08-29-soroban-sdk-27-v2-contracts

## Summary

- Contract IDs live in **four unsynchronised copies** today: `contracts/stellar/deployments.json` (written by `deploy.sh` via jq), the generated `networks` const in `contracts/stellar/bindings/src/protocol.ts:34-47` (hand-patched for mainnet in commit `be068a3`), horizon env vars `PROTOCOL_CONTRACT_ID`/`AUTHORITY_CONTRACT_ID` (`apps/horizon/src/common/constants.ts:35-38`), and literal tables in docs/README. Nothing reads `deployments.json` at runtime except the contracts integration tests (`contracts/stellar/__test__/testutils.ts:60-84`).
- Horizon's canonical router+repository+Prisma-filter shape is `registry.router.ts` → `schemas.repository.ts` (`SchemaFilters` → `where` object → parallel `findMany`/`count`); the `data.router.ts` endpoints skip the repository layer and build `where` inline. Both already accept a `contractId` filter on raw events/operations but **not** on `Attestation`/`Schema` (`attestations.repository.ts:131-135`, `schemas.repository.ts:122-125`), even though the columns and indexes exist (`prisma/schema.prisma:188,207,222,240`).
- The ledger cursor is a **single global row** in `HorizonIndexerState` (`apps/horizon/src/common/db.ts:16-60`, `prisma/schema.prisma:160-174`) — no per-contract cursor. One `getEvents` call with `contractIds: [...]` serves all contracts (`ingest.repository.ts:179`, `events.repository.ts:160`, `backfill.repository.ts:166`).
- Prior soroban-sdk history: workspace was at 23.0.2 and was **downgraded** to 22.0.8 (`e2ea656`, 2025-10-26) for `stellar-tokens` compatibility; that dependency was later removed with the token_reward/fee_collection resolvers (`cf59560`). `Cargo.lock` resolves to 22.0.11 (`contracts/stellar/Cargo.lock:1359-1360`), and `crypto.rs:133-146` has a comment pinned to that exact version.
- Stale references still in tree: `soroban-release.yml:24-32` builds `contracts/stellar/authority` (deleted in `ea10628`), `AUTHORITY_CONTRACT_ID` in `constants.ts:37` and `.env.example:7`, `tsconfig.json` excludes `authority`, `apps/horizon/README.md:29,47`, `apps/horizon/scripts/mainnet/README.md` (authority mainnet ID), `contracts/stellar/readme.txt` (whole authority section + `--authority` flag), `contracts/stellar/__test__/readme.md` ("Authority Contract Integration Tests"), `packages/cli/src/commands/authority.ts`.

## Findings

### Patterns & conventions — config/registry shape

**deployments.json (JSON, per-network → per-contract)** — `contracts/stellar/deployments.json:1-16`. Shape `{network: {contractName: {id, hash, timestamp}}}`. `hash` is the **deploy tx hash**, not the wasm hash (`deploy.sh:384,322-326`). Written atomically by `update_contracts_json` (`deploy.sh:291-373`) using `jq '.[$net] |= (if . == null then {} else . end) | .[$net][$name] = $data'` — it *overwrites* the contract entry, so redeploying loses the prior ID (history is only in git: `git log -- contracts/stellar/deployments.json`, e.g. `0a8c2df`, `e94f45f`, `283d558`, `1530dfa`). The file ships in the npm package (`contracts/stellar/package.json:28-31` `"files": ["dist/", "deployments.json"]`) but no `exports` entry exposes it (`package.json:17-23` exports only `./protocol`), so consumers can't import it under `exports` restrictions.

**bindings `networks` const (TS, per-network keyed)** — `contracts/stellar/bindings/src/protocol.ts:34-47`:
```ts
export const networks = { testnet: {networkPassphrase, contractId}, local: {..., contractId: undefined}, mainnet: {...} } as const
```
The stellar CLI only emits the network the bindings were generated against; `mainnet` was **hand-added** (`be068a3`, again `bceb6fb`). `local` with `contractId: undefined` is also non-CLI output. This is the pattern the SDK actually resolves against: `packages/stellar-sdk/src/client.ts:101-113` switches on `options.network` and reads `ProtocolNetworks.<net>.contractId`, then throws `ConfigurationError` when empty (`client.ts:115-119`). Re-exported as `ProtocolNetworks` from `packages/stellar-sdk/src/index.ts:81-89`.

**stellar-sdk `ClientOptions`** — `packages/stellar-sdk/src/types.ts:61` has `contractId?: string`; override precedence is explicit-`contractId` > `network` lookup (`client.ts:102-113`). Network passphrase resolution is a parallel switch (`client.ts:84-99`) including `futurenet`, which `networks` does not have — a pre-existing asymmetry.

**horizon constants (env → module consts, no validation)** — `apps/horizon/src/common/constants.ts`. `dotenv.config()` at line 2; `CONTRACT_IDS_TO_INDEX` is a 2-element array built from `PROTOCOL_CONTRACT_ID` and `AUTHORITY_CONTRACT_ID` with `as string` casts (`:35-38`), so an unset var yields `undefined` inside the array and the `length === 0` guard at `:93` never fires. Console-log banner at module load (`:88-101`). `STELLAR_NETWORK` defaults to `'testnet'` (`:25`); RPC URL is a hardcoded if/else (`:69-74`, mainnet → `rpc.lightsail.network`). No zod/env schema anywhere in horizon (`grep process.env apps/horizon/src` → only `PORT`, `DATABASE_URL`, `PRISMA_DEBUG`, `QUEUE_LOG_*`, `NODE_ENV`).

**Contracts integration test config** — `contracts/stellar/__test__/testutils.ts:57-84` `loadTestConfig()` reads `deployments.json` with `fs.readFileSync` relative to `__dirname`, picks `deployments.testnet.protocol.id`, takes `ADMIN_SECRET_KEY` from env, hardcodes the testnet RPC URL. All four test files pass `contractId: config.protocolContractId` plus `ProtocolContract.networks.testnet.networkPassphrase` (e.g. `protocol.integration.test.ts:46-47`). This is the one place a JSON registry is already the source of truth.

### Patterns & conventions — horizon router / repository / Prisma filter

Canonical model to copy: **`GET /api/registry/schemas`**.
- Router: `apps/horizon/src/router/registry.router.ts:302-360`. Destructures `req.query`, validates `limit`/`offset` (`:316-325`), returns `400 {success:false,error}` on bad numeric param (`:333-339`), accepts alias params (`authority ?? deployer`, `context ?? type`, `:345-346`), builds a typed `filters` object, calls repository, maps through `transformSchemaForAPI` (`:75-95`), responds `{success, data, pagination}`.
- Repository: `apps/horizon/src/repository/schemas.repository.ts:28-35` (`SchemaFilters` interface), `:102-160` (`getSchemas`): builds `where: any` conditionally, omits `where` entirely when empty ("for exact test expectations", `:127-137`), runs `findMany` + `count` in `Promise.all`, caps `take` at 200.
- Route constants at the top of each router (`registry.router.ts:29-34`), mounted in `apps/horizon/src/app.ts:30-34` under `/api/<name>` and echoed to `logRouter` (`:39-43`). A new `/contracts` router would follow the same two-line mount + log.
- Contrast: `data.router.ts:52-100` (`/data/events`) does the Prisma query inline in the router with no repository; it already supports `?contractId=` (`:70`). `system.router.ts:133` exposes `indexing_contracts: CONTRACT_IDS_TO_INDEX` in the health/status payload — an existing place the registry is surfaced.
- Prisma columns already present: `Attestation.contractAddress` (`prisma/schema.prisma:188`, index `:207`), `Schema.contractAddress` (`:222`, index `:240`), `Transaction.contractId` (`:250`, `:265`), `HorizonEvent.contractId` (`:15`, `:36`), `HorizonOperation.contractId` (`:135`, `:152`). Populated from `ev.contractId` on ingest (`events.repository.ts:515,548,582`; `backfill.repository.ts:646,699,755`).

### Patterns & conventions — env loading and unit-test mocking

- Unit tests mock the whole constants module: `apps/horizon/__tests__/endpoints.unit.test.ts:19-23` and `indexer-sdk.unit.test.ts:13-17` do `vi.mock('../src/common/constants', () => ({ STELLAR_NETWORK, CONTRACT_IDS_TO_INDEX: ['CAAAAA','CBBBBB'], sorobanRpcUrl }))`. Any new export from `constants.ts` (e.g. `INDEX_CONTRACT_IDS`, a registry loader) will be `undefined` in these tests unless the mock factories are updated — vitest module mocks replace the whole module.
- `getDB` is mocked and given a hand-built `mockDb` with per-model `findMany`/`count` (`endpoints.unit.test.ts:5-17`, `indexer-sdk.unit.test.ts:5-11`). Adding a new Prisma model to a route means adding it to `mockDb`.
- `@stellar/stellar-sdk` `rpc.Server` is globally mocked for unit mode in `apps/horizon/__tests__/fixtures/unit-setup.ts:13-31`; `vitest.config.ts:7-11` swaps setup file by `VITEST_MODE`. `process.env.STELLAR_NETWORK` is set in `beforeAll` (`unit-setup.ts:37`) but constants.ts has already evaluated by then when imported via `app` — env mutation in setup does not affect module-level consts.
- `test` script runs integration before unit (`apps/horizon/package.json:13`); integration needs a real Postgres (`unit-setup.ts:8`).

### Patterns & conventions — indexer contract selection and cursor

- Contract set: `CONTRACT_IDS_TO_INDEX` used verbatim as the `getEvents` filter in three places — `ingest.repository.ts:96,179`, `events.repository.ts:79-80,160`, `backfill.repository.ts:98,166`. `POST /ingest/recurring` accepts an optional `contractIds` body override (`ingest.router.ts:182-184`).
- Cursor: single-row `HorizonIndexerState` (`prisma/schema.prisma:160-174`); reads `findFirst orderBy updatedAt desc` (`db.ts:22-25`), writes `findFirst` then update-or-create (`db.ts:41-60`). Cursor is not keyed by contract or network. Ingest resumes at `lastProcessedLedger + 1` or ledger 1 (`ingest.repository.ts:152-158`). A newly deployed v2 contract on the same network would be picked up from the current cursor onward, not from its deploy ledger — historical v2 events before the cursor only come via the backfill path (`backfill.repository.ts`, `LEDGER_HISTORY_LIMIT_DAYS = 7` at `constants.ts:60`).

### Patterns & conventions — bindings generation and commit

- Generated by `deploy.sh --bindings` (`deploy.sh:414-476`): runs `stellar contract bindings typescript --network --contract-id --output-dir <tmp>`, then **moves** `src/index.ts` → `bindings/src/protocol.ts` and `README.md` → `bindings/src/protocol.md`. Only the freshly deployed contract's network ends up in `networks`; other networks must be re-added by hand (evidence: `be068a3`, `bceb6fb`; the bindings README itself invites this at `bindings/src/protocol.md:17`).
- Hand edits present in `protocol.ts`: `local` entry (`:39-42`), `mainnet` entry (`:43-46`); `types.ts` sits alongside and is not CLI output. Commit `92871cf` "remove authority references from tests and bindings" also hand-edited generated files.
- Build: `contracts/stellar/tsconfig.json` includes only `bindings/src/*`, emits to `dist/`, `package.json` exports `./protocol` → `dist/protocol.js`. Horizon's Dockerfile builds `@attestprotocol/stellar-contracts` before stellar-sdk (`apps/horizon/Dockerfile:24-27`), so a registry file placed under `bindings/src/` would ship automatically; one placed at `contracts/stellar/` root would need `resolveJsonModule` (already on, `tsconfig.json:22`) plus an `include` entry or a new `exports` key.

### Patterns & conventions — changesets and semantic-release

- Two release systems coexist. `.changeset/config.json` (`baseBranch: "main"`, `commit: true`, packages `packages/*` + `contracts/stellar/*`) drives `pnpm release:version` → `changeset version` → `release-it` (`package.json:35-36`). `semantic-release` runs on push to `canary`/`main` (`.github/workflows/semantic-release.yml:3-7`) and tags the repo (`v2.0.1` etc.), which in turn triggers `soroban-release.yml` on `v*` tags.
- Changeset file convention: frontmatter listing packages + bump, one-line body (`git show efa55ba`: `.changeset/true-crabs-clap.md`). Historic major: `13e3f7f` "prepare mainnet and setup graphs and rpc" produced `@attestprotocol/stellar-contracts@2.0.0` and `stellar-sdk@2.0.0` together (`contracts/stellar/CHANGELOG.md:13-17`, `packages/stellar-sdk/CHANGELOG.md`). `updateInternalDependencies: "patch"` means a stellar-contracts major will only patch-bump stellar-sdk unless the changeset names both.
- `.changeset/` currently contains only `README.md` and `config.json` — no pending changesets. `baseBranch: "main"` in config while the working branch is `canary` (`semantic-release.yml:5-7` targets both).
- Rust: `pnpm release:stellar <ver>` → `cargo release --execute` (`package.json:34`), config in `contracts/stellar/Release.toml`. Workspace version `1.3.6` (`Cargo.toml:8`); tags like `v2.0.1_contracts_stellar_protocol_protocol_pkg1.3.6_cli22.8.1` show the stellar-expert workflow encodes the CLI version (`cli22.8.1`) into the tag.

### Patterns & conventions — deploy history

- `deploy.sh` flow: source `env.sh` (`:41-57`) → verify/add stellar network (`:84-235`) → build → `stellar contract deploy` → parse ID from the stellar.expert URL in CLI output (`:387`) and tx hash from "Transaction hash is" (`:384`) → jq-merge into `deployments.json`. Fee default 1 XLM (`:65`). Mainnet deploy commit `283d558` added `--fee` and the mainnet entry in one commit; `readme.txt` bottom section shows the exact mainnet invocation used (`--rpc-url https://soroban-rpc.mainnet.stellar.gateway.fm ... --initialize`).
- Security hardening commits on deploy.sh worth keeping: `980d74f` (mktemp), `e3c36e5`/`433b055` (no credential logging; see comment at `deploy.sh:113-118` referencing "Finding 231e977a").

### Patterns & conventions — Mintlify docs

- `apps/docs/docs.json` is a plain Mintlify v2 config (`theme: aspen`, `navigation.tabs[].groups[].pages`, `contextual.options`). No `snippets/` directory, no `<Snippet>` usage, no `export const` MDX variables, no `mermaid` fences anywhere in `apps/docs` (grep confirmed). Contract IDs are literal markdown tables in `introduction.mdx:80-83`, `stellar/getting-started.mdx:149-152`, `stellar/reference.mdx:14-17`, and an inline code sample in `concepts/authorities.mdx:64`.
- Images: only `<img src="/images/..." className="... dark:hidden">` light/dark pairs in `chains/stellar/overview.mdx:6-16,521-522`; no `<Frame>`, no `images/diagrams/`. `images/` holds logos/favicons/og only.
- ASCII diagrams are bare ```` ``` ```` fences with no language tag (`concepts/how-it-works.mdx:8-16`, `concepts/authorities.mdx:25-46`, etc.). Box-drawing line counts: resolvers 26, delegates 21, authorities 19, schemas 16, how-it-works 7, attestations 3. Some fences with box chars are inside `rust`/`typescript` code blocks as comments — a converter must distinguish diagram fences from code.
- Components in use: `<Card>`, `<CardGroup>`, `<Note>`, `<Warning>` (`introduction.mdx:26-37`, `concepts/authorities.mdx:10,53`). Docs `build` script is a no-op echo (`apps/docs/package.json:8`); `mintlify dev` is the only local check.

### Don't Hand-Roll (local)

- Atomic JSON registry merge with jq + temp file + verify-before-mv: `deploy.sh:291-373`.
- Contract ID / tx-hash validation regexes: `deploy.sh:393,400`.
- Paginated `{success,data,pagination}` response + `take`≤200 cap: `schemas.repository.ts:128-131`, `registry.router.ts:353-360`.
- Stellar network → passphrase/RPC switching: `client.ts:84-99`, `constants.ts:69-86`.
- Test config from `deployments.json`: `testutils.ts:57-84` (extend rather than duplicate).
- RPC retry with timeout/backoff: `ingest.repository.ts:116-149`.

### Anti-patterns not to carry forward

- `as string` casts on env vars producing `[undefined, undefined]` arrays that pass emptiness checks (`constants.ts:35-38,93`).
- Hand-editing CLI-generated bindings to add networks (`be068a3`); `deployments.json` overwrite-on-redeploy losing prior IDs (`deploy.sh:337`).
- Module-level `console.log` banners and emoji logging in `constants.ts:88-101`, `ingest.repository.ts:32,196-198` (dumps the raw `Response` object).
- Inline Prisma queries in routers (`data.router.ts`) versus repository layer (`registry.router.ts`) — two conventions for the same thing.
- Alias query params (`authority`/`deployer`, `by_ledger`/`ledger`, `context`/`type`) accumulating in `registry.router.ts:305-346`.
- Duplicated event-decoding logic across `ingest.repository.ts:632-649`, `backfill.repository.ts:626-643`, `events.repository.ts:512`.
- Fake JS in a Rust file's doc comment (`crypto.rs:27-78` contains TypeScript) and version-pinned comments that will rot on SDK bump (`crypto.rs:133-146` names `soroban-sdk-22.0.11` line numbers).

### Common Pitfalls (local near-misses)

- `e2ea656`: the last soroban-sdk bump attempt (23.0.2) was reverted because a third-party crate pinned 22.x — check every `[dependencies]` in `protocol/Cargo.toml` and `resolvers/Cargo.toml` for SDK-coupled crates before bumping (currently only `soroban-sdk` itself plus dev-deps `bls12_381`, `blst`, `hex` — `protocol/Cargo.toml:17-25`).
- `crypto.rs:133-146` and `ad6c1d3` (HAL-07): `G1Affine::from_bytes` traps on invalid points; the pre-validation helpers exist because 22.x had no fallible constructor. If 27.x adds one, the helpers and the comment need revisiting.
- `unit-setup.ts:25` comment: `rpc.Server` mock "must be a `function` (not arrow) so `new rpc.Server()` works under vitest 4".
- `schemas.repository.ts:127-137`: tests assert exact Prisma call args (no `where` key when empty) — adding a default `contractAddress` filter would break `indexer-sdk.unit.test.ts` expectations.
- `apps/horizon/README.md:136` says contract IDs are configured in `constants.ts` as an array; `.env.example:7-8` says env vars; both are half right.
- `contracts/stellar/vitest.config.ts:10` and `tsconfig.json:27` still exclude a non-existent `authority` directory — harmless but signals the removal was partial.

### Stale references inventory

| Location | What |
|---|---|
| `.github/workflows/soroban-release.yml:24-32,49` | `release-authority` job pointing at deleted `contracts/stellar/authority` |
| `apps/horizon/src/common/constants.ts:37`, `apps/horizon/.env.example:7` | `AUTHORITY_CONTRACT_ID` |
| `apps/horizon/README.md:29,47` | "protocol and authority contracts" |
| `apps/horizon/scripts/mainnet/README.md` (Mainnet Contract Addresses table) | Authority mainnet ID `CBKOB6...`, RPC `soroban-rpc.mainnet.stellar.gateway.fm` |
| `contracts/stellar/readme.txt` | Authority contract section, `--authority` flag, old bindings IDs `CC673T...`/`CCJDGG...`, removed `export-token-reward-resolver`/`export-fee-collection-resolver` features |
| `contracts/stellar/__test__/readme.md` | Titled "Authority Contract Integration Tests", references `.mjs` files that don't exist |
| `contracts/stellar/protocol/Makefile:14` | Example contract ID `CB3NF4...` (old testnet) |
| `packages/cli/src/commands/authority.ts`, `packages/cli/src/handlers/stellar.ts` | CLI authority command surface |
| `contracts/stellar/bindings/src/protocol.ts` `DataKey.Authority`, `Authority` interface | Generated from current contract — verify whether protocol still stores authorities before assuming stale |
| `apps/docs/concepts/how-it-works.mdx:45-47` | "Authority Contract: Trust management / registration with payment" |
| `CLAUDE.md` structure block | Lists `contracts/solana`, `starknet`, `sui` and `packages/sdk`, `packages/cli`; `ls contracts` / `ls packages` should be checked against it (011d373 "remove dead and orphaned packages") |

## Open questions

- Should the registry be a JSON file (matches `deployments.json` + `testutils.ts` loader, shippable via `files`) or a TS module (matches `networks` const, tree-shakeable, typed)? Both patterns exist; no precedent for one file feeding both bindings and horizon.
- Cursor semantics for a newly registered contract: single global `HorizonIndexerState` means v2 events between deploy ledger and current cursor are only reachable via backfill. Does the plan need a per-contract `startLedger` in the registry (`deployedAt` ledger vs timestamp)?
- `soroban-release.yml` tags: the stellar-expert workflow encodes `cli22.8.1` into tag names — does the v2 tag scheme need to differ, and does that workflow's `@main` ref support wasm32v1-none with sdk 27? (external focus)
- `updateInternalDependencies: "patch"` in changeset config — a stellar-sdk major with stellar-contracts major requires both named in the changeset; confirm intended bump for `@attestprotocol/core`/`horizon` (horizon is not in `packages: [...]`).
- Mintlify mermaid support and `<Snippet>`/`export const` variable support are external-focus questions; nothing in-repo to imitate.

## Sources

### Primary (HIGH confidence)
- `contracts/stellar/deployments.json`, `contracts/stellar/deploy.sh`, `contracts/stellar/package.json`, `contracts/stellar/tsconfig.json`, `contracts/stellar/Cargo.toml`, `contracts/stellar/Cargo.lock`, `contracts/stellar/protocol/Cargo.toml`, `contracts/stellar/resolvers/Cargo.toml`, `contracts/stellar/protocol/src/instructions/crypto.rs`, `contracts/stellar/bindings/src/protocol.ts`, `contracts/stellar/bindings/src/protocol.md`, `contracts/stellar/__test__/testutils.ts`, `contracts/stellar/vitest.config.ts`, `contracts/stellar/readme.txt` — read directly.
- `apps/horizon/src/common/constants.ts`, `db.ts`, `app.ts`, `router/registry.router.ts`, `router/data.router.ts`, `router/ingest.router.ts`, `repository/schemas.repository.ts`, `repository/attestations.repository.ts`, `repository/ingest.repository.ts`, `prisma/schema.prisma`, `__tests__/endpoints.unit.test.ts`, `__tests__/indexer-sdk.unit.test.ts`, `__tests__/fixtures/unit-setup.ts`, `vitest.config.ts`, `package.json`, `Dockerfile`, `railway.toml`, `.env.example` — read directly.
- `packages/stellar-sdk/src/client.ts`, `src/index.ts`, `src/types.ts`, `package.json`, `tsup.config.ts` — read directly.
- `.changeset/config.json`, `package.json` (root), `.github/workflows/semantic-release.yml`, `.github/workflows/soroban-release.yml`, `contracts/stellar/CHANGELOG.md`, `packages/stellar-sdk/CHANGELOG.md` — read directly.
- `apps/docs/docs.json`, `apps/docs/package.json`, `apps/docs/introduction.mdx`, `concepts/how-it-works.mdx`, `concepts/authorities.mdx`, grep over all `.mdx` — read directly.
- Git history on `canary`: `e2ea656`, `ea10628`, `1530dfa`, `283d558`, `be068a3`, `bceb6fb`, `92871cf`, `efa55ba`, `13e3f7f`, `3dbddc4`, `a6d0b01`, `ad6c1d3`, `cf59560` — inspected with `git show`/`git log -S`.

### Secondary (MEDIUM confidence)
- Inference that `deployments.json` is not read by any runtime code: based on grep for the filename across `apps/`, `packages/`, `contracts/` (only `testutils.ts` and `deploy.sh` hit). A dynamic `require` with a constructed path would evade this.
- Tag naming `v2.0.1_contracts_stellar_protocol_protocol_pkg1.3.6_cli22.8.1` attributed to stellar-expert workflow — inferred from tag shape plus `soroban-release.yml`; workflow source not read.

### Tertiary (LOW confidence)
- Claim that Mintlify renders mermaid and that no snippet mechanism is in use beyond what's greppable — in-repo evidence only shows absence; capability itself is for the external researcher to confirm.
