# TypeScript Contract Bindings

This directory contains TypeScript bindings for our Stellar smart contracts,
plus the contract registry that every consumer resolves addresses from.

## Structure

- `src/` - Generated TypeScript binding files
  - `protocol.ts` - Protocol contract bindings
  - `protocol.md` - Protocol contract documentation
  - `contracts.json` - Per-network contract registry, keyed by version
  - `registry.ts` - Typed accessors over the registry

## Registry

`src/contracts.json` records every deployed contract per network:

```json
{
  "testnet": {
    "v1": { "id": "C...", "sdk": "22.0.8", "deployedAt": "...", "deployedLedger": null, "txHash": "...", "wasmHash": null },
    "current": "v1"
  }
}
```

`current` names the version consumers get by default. A deploy never changes it —
flipping `current` is a deliberate step once the new deployment has been verified.

Read it through the package export rather than the file:

```typescript
import { getContractId, getContractEntry, listContracts } from '@attestprotocol/stellar-contracts/registry'

getContractId('mainnet')       // current mainnet contract
getContractId('testnet', 'v2') // a specific version
```

`deployments.json` is generated from `bindings/src/contracts.json` by `scripts/sync-deployments.sh`; edit the registry, not this file.

The `networks` const in `src/protocol.ts` is likewise generated, by
`scripts/sync-networks.mjs`, after every bindings generation — regenerated
bindings only know the contract they were generated from, so hand-editing that
block silently drops the other networks.

## Generation

Bindings are generated when you run the deploy script with the `--bindings` flag:

```bash
# Deploy the protocol contract as v2 and regenerate bindings
./deploy.sh --protocol --version v2 --bindings --source <your-identity> --network testnet
```

The bindings are generated from the deployed contract specs and organized
automatically in the `src/` directory.

## Usage

Import the generated bindings in your TypeScript projects:

```typescript
import { Client as ProtocolClient } from './bindings/src/protocol';
```

## Notes

- Bindings are generated using the `stellar contract bindings typescript` command
- The original npm package structure is cleaned up and only the essential TypeScript files are kept
- Documentation files are converted from README.md to .md format for each contract
