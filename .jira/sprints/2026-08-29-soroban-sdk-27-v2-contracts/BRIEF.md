# Brief: 2026-08-29-soroban-sdk-27-v2-contracts

**Created:** 2026-08-29
**Source:** user-prompt
**Issue:** none

## Statement

Upgrade contracts/stellar from soroban-sdk 22.0.8 to 27.0.6 (latest stable), deploy new v2 contracts (no in-place upgrade path exists — neither protocol nor resolvers exposes update_current_contract_wasm), and make contract addresses a versioned, discoverable dataset instead of hardcoded values.

Five waves:

1. **Compile** — bump sdk, fix API breaks (env.crypto().bls12_381 first), 77 cargo tests green, wasm32v1-none build via stellar CLI.
2. **Registry + horizon** — replace contracts/stellar/deployments.json with a per-network versioned contracts.json registry (`{network: {v1: {id, sdk, deployedAt}, v2: ..., current}}`), export `getContractId(network, version?)` from @attestprotocol/stellar-sdk and bindings, make apps/horizon index every contract in the registry (Attestation/Schema/Transaction/HorizonEvent already carry contractAddress/contractId columns), add `GET /contracts` returning the registry with `current`, add `?contract=` / `?version=` filters on data endpoints; PROTOCOL_CONTRACT_ID Railway env becomes ingest target only, add INDEX_CONTRACT_IDS.
3. **Testnet v2** — deploy, register as testnet.v2, regenerate contracts/stellar/bindings, run the vitest integration suite in contracts/stellar/__test__ against the new ID, make attest.next stellar app read /contracts from horizon instead of NEXT_PUBLIC_*_CONTRACT_ID env.
4. **Mainnet v2** — deploy, register, document exact Railway env keys/values for the user to apply, flip `current`, release @attestprotocol/stellar-sdk major via changesets, close the soroban-env-host/stellar-xdr Dependabot alerts.
5. **Docs (apps/docs, Mintlify)** — render contract IDs from the registry on introduction.mdx, concepts/authorities.mdx, stellar/reference.mdx, stellar/getting-started.mdx; convert ~18 ASCII box-drawing diagrams across concepts/{attestations,authorities,delegates,how-it-works,resolvers,schemas}.mdx to native ```mermaid fences (Mintlify renders them); use agent-browser against `mintlify dev` for a visual QA pass on every touched page; screenshot into images/diagrams/ only as a fallback where Mintlify renders a diagram badly.

## Constraints

- Existing mainnet contract CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI and testnet CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP stay live as v1; existing state does not migrate.
- Root README.md, apps/horizon/.env.example, apps/horizon/scripts/mainnet/README.md also reference the old IDs.
- PR #112 (dependabot patches) is open on this repo.
- soroban-release.yml uses stellar-expert/soroban-build-workflow.
- Railway env changes cannot be applied by the agent; they must be documented for the user.
- Mainnet deployment requires the user's signing keys and explicit go-ahead.

## Out of scope

- Migrating existing v1 schemas/attestations/authorities to v2.
- Solana, Starknet, Aptos, Sui contracts.
- attest.next frontend changes beyond reading /contracts from horizon (that repo is separate: daccred/attest.next).
