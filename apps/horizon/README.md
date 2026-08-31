# Stellar Horizon Indexer

## Setup

```bash
pnpm install
```

# Overview

The Stellar Horizon Indexer is a specialized Express.js server designed to comprehensively ingest and process data from the Stellar blockchain for contract-specific operations. It serves as a critical infrastructure component that bridges the gap between the Stellar blockchain (both testnet and mainnet) and our internal applications by maintaining a synchronized PostgreSQL database of **complete contract interaction data**.

## Purpose

This indexer was developed to address the need for a unified and comprehensive source of truth across our various client applications that interact with our attestation service on the Stellar/Soroban network. Our ecosystem includes:

- SDK implementations  
- Command-line interface (CLI) tools
- No-code deployer applications

By maintaining a centralized database of **all contract interactions** (not just events), the indexer ensures consistent data access and synchronization across all client applications, providing the complete picture needed for optimal user experience.

## Enhanced Strategy

Unlike traditional event-only indexers, our enhanced approach provides comprehensive contract visibility through multiple data collection pathways:

### 🎯 **Contract-Specific Focus**
- Indexes data for specific smart contracts only (not global blockchain data)
- Tracks every protocol contract version registered in the contract registry (`contracts.json`)
- Optimized for attestation protocol interactions

### 📊 **Multi-Source Data Collection**
1. **Events** - Contract events with transaction context
2. **Operations** - ALL operations involving contracts (including those without events)  
3. **Transactions** - Complete transaction details and metadata
4. **Account States** - Account information for contract participants
5. **Failed Operations** - Tracking of unsuccessful operations for debugging

### ⚡ **Queue-Based Processing**
- Background job processing with retry logic
- Multiple job types: events, operations, comprehensive data collection
- Configurable backoff and rate limiting

## Key Features

- **Comprehensive Contract Indexing** - Goes beyond events to capture all contract interactions
- **Multi-Contract Support** - Simultaneous indexing of every registered protocol contract version
- **Enhanced Database Schema** - Optimized models for contract-specific operations tracking
- **Queue-Based Job Processing** - Reliable background processing with retry logic
- **Failed Operation Tracking** - Complete visibility including unsuccessful operations
- **RESTful API Endpoints** - Rich APIs for querying contract data and analytics
- **Real-time Analytics** - Contract performance dashboards and metrics

## Architecture

The indexer follows an enhanced modular architecture:

1. **Multi-Source Data Collector**: Fetches events, operations, and transactions
2. **Contract-Specific Processor**: Filters and processes only relevant contract data
3. **Enhanced Database Layer**: PostgreSQL with optimized contract operation models
4. **Queue Management System**: Background job processing with retry logic
5. **Comprehensive API Server**: Rich endpoints for contract data and analytics
6. **Analytics Engine**: Real-time contract performance metrics

## Development

### Start the Development Server

```bash
pnpm dev
```

Server runs on `http://localhost:3001` (development) or `https://horizon.attest.so` (production)

### Enhanced Indexing Commands

#### 1. Comprehensive Contract Indexing (Recommended)
Indexes ALL contract data: events + operations + transactions + accounts
```bash
curl -X POST https://horizon.attest.so/api/ingest/contracts/comprehensive \
  -H 'Content-Type: application/json' \
  -d '{"startLedger": 880500}'
```

#### 2. Contract Operations Only
Focuses on operations involving your contracts (including failed ones)
```bash
curl -X POST https://horizon.attest.so/api/ingest/contracts/operations \
  -H 'Content-Type: application/json' \
  -d '{"startLedger": 880500, "includeFailedTx": true}'
```

#### 3. Events Only (Legacy)
Traditional event-based indexing
```bash
curl -X POST https://horizon.attest.so/api/ingest/events \
  -H 'Content-Type: application/json' \
  -d '{"startLedger": 880500}'
```

### Query Contract Data

#### Get Contract Operations
```bash
curl "https://horizon.attest.so/api/data/operations?limit=10&type=invoke_host_function"
```

#### View Contract Analytics
```bash
curl "https://horizon.attest.so/api/analytics/contracts"
```

#### Check Queue Status
```bash
curl "https://horizon.attest.so/api/queue/status"
```

### Monitor Health
```bash
curl "https://horizon.attest.so/api/health"
```

## Prerequisites

- Node.js 16+
- PostgreSQL 13+
- Stellar/Soroban RPC access

## Environment Setup

1. Copy `.env.sample` to `.env`
2. Configure database and RPC endpoint settings:
   ```bash
   DATABASE_URL=postgresql://username:password@host:port/database
   STELLAR_NETWORK=testnet  # or 'mainnet'
   # Contract addresses come from the registry; see "Tracked Contracts" below
   ```
3. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

## Tracked Contracts

Contract addresses live in one versioned registry, `contracts/stellar/bindings/src/contracts.json`,
published as the `@attestprotocol/stellar-contracts/registry` export. Nothing in this app
hardcodes an address.

Two variables control what gets indexed:

- `INDEX_CONTRACT_IDS` — comma-separated allowlist of contract addresses. Leave it empty
  to index every contract registered for `STELLAR_NETWORK`, which is the normal setup:
  a new deployment is picked up as soon as the registry ships.
- `PROTOCOL_CONTRACT_ID` — the attribution target used where ingest needs to name a single
  contract. Defaults to the registry's `current` version for the network. It must be one of
  the indexed addresses; the process refuses to start otherwise.

### GET /api/contracts

Returns the registry for the configured network. This is the documented contract the
attest.so frontend reads instead of carrying its own `NEXT_PUBLIC_*_CONTRACT_ID` values.

```json
{
  "success": true,
  "data": {
    "network": "testnet",
    "current": "v1",
    "contracts": {
      "v1": {
        "id": "C...",
        "sdk": "22.0.8",
        "deployedAt": "2025-11-07T12:44:26Z",
        "deployedLedger": null,
        "txHash": "5f91...",
        "wasmHash": null
      }
    },
    "indexing": ["C..."]
  }
}
```

`GET /api/contracts/:version` returns a single entry, or 404 if that version is not
registered on this network.

### Filtering by contract

`/api/registry/attestations`, `/api/registry/schemas`, `/api/data/events` and
`/api/data/operations` accept:

- `?contract=<address>` — filter to one contract address.
- `?version=<v1|v2>` — same thing, resolved against the registry for `STELLAR_NETWORK`.
  An unregistered version is a `400`.

```bash
curl "$HORIZON/api/registry/attestations?version=v2&limit=50"
```

### Registering a new contract

1. Add the entry under the network in `contracts/stellar/bindings/src/contracts.json`
   (`deploy.sh --version vN` does this for you) and release the package.
2. Deploy the indexer so it picks up the new registry.
3. Backfill the new contract from the ledger it was deployed in — the ingest cursor is
   global, so a newly registered contract has no history until you ask for it:

   ```bash
   curl -X POST $HORIZON/api/ingest/backfill \
     -H 'content-type: application/json' \
     -d '{"startLedger": <deployedLedger>}'
   ```

   `deployedLedger` is the field on the registry entry. For the current testnet
   deployment that is ledger `4404453`:

   ```bash
   curl -X POST $HORIZON/api/ingest/backfill \
     -H 'content-type: application/json' \
     -d '{"startLedger": 4404453}'
   ```

### Railway variables

Railway environment changes are documented here and applied by a maintainer in the Railway
dashboard; deploys never set them automatically. After each contract deployment, set:

| Key | Testnet | Mainnet |
| --- | --- | --- |
| `STELLAR_NETWORK` | `testnet` | `mainnet` |
| `INDEX_CONTRACT_IDS` | `CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP,CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD` | `CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI,CAMZUXDEMJ4BDEA2FCTXPRQW3VPEJLFOV5IB3NKKJB2G4CV7ANHNSF2N` |
| `PROTOCOL_CONTRACT_ID` | `CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD` | `CAMZUXDEMJ4BDEA2FCTXPRQW3VPEJLFOV5IB3NKKJB2G4CV7ANHNSF2N` |

`AUTHORITY_CONTRACT_ID` is no longer read by the indexer — delete it from both services.

Leaving `INDEX_CONTRACT_IDS` unset achieves the same result once the registry contains both
versions; set it explicitly only to index a subset.

After applying the variables and redeploying, backfill each service from the ledger its new
contract was deployed in:

```bash
# production (mainnet), protocol v2 deployed in ledger 64212659
curl -X POST https://graph.attest.so/api/ingest/backfill \
  -H 'content-type: application/json' \
  -d '{"startLedger": 64212659}'

# testnet, protocol v2 deployed in ledger 4404453
curl -X POST $HORIZON_TESTNET/api/ingest/backfill \
  -H 'content-type: application/json' \
  -d '{"startLedger": 4404453}'
```

Confirm the redeployed service resolves the new contract:

```bash
curl https://graph.attest.so/api/contracts | jq .data.current   # -> "v2"
```

## Running the Indexer

### Development:
```bash
pnpm dev
```

### Production:
```bash
pnpm start
```

## Database Schema

The enhanced schema includes optimized models for contract-specific tracking:

- `HorizonContractOperation` - Enhanced contract operations with success tracking
- `HorizonEvent` - Contract events with transaction relations
- `HorizonTransaction` - Complete transaction metadata
- `HorizonAccount` - Account states for contract participants
- `HorizonEffect` - Operation effects and outcomes

## API Documentation

See [API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md) for complete endpoint documentation.

## Testing

See [TESTING.md](./docs/TESTING.md) for testing procedures and examples.
