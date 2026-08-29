# attest.so

<div align="center">

![attest.so Logo](https://github.com/user-attachments/assets/520b21ee-c8d7-4bda-9809-999c489551b9)

**A Unified Trust Framework for Blockchain-Based Attestation Infrastructure**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Issues](https://img.shields.io/github/issues/daccred/attest.so)](https://github.com/daccred/attest.so/issues)

---

<table>
<tr>
<td width="50%" valign="top">

### Website & Docs
- **[Website](https://attestprotocol.org)**
  Official attestprotocol.org home
- **[Developer Docs](https://docs.attestprotocol.org)**
  Complete integration guides & API reference

### Live Environments

| Network | Stellar |
|---------|---------|
| **Sandbox** | [Try it now](https://sandbox.attest.so) |
| **Testnet** | [Launch](https://testnet.attestprotocol.org) |
| **Mainnet** | [Launch](https://stellar.attestprotocol.org) |

</td>
<td width="50%" valign="top">

### Smart Contracts

**Stellar (Mainnet)** · [View on Stellar.Expert](https://stellar.expert/explorer/public)
<!-- Protocol v2 (current) is added here once the mainnet v2 deployment lands; see contracts.json. -->
- [Protocol v1 (current)](https://stellar.expert/explorer/public/contract/CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI) · `CBUUI...`

**Stellar (Testnet)** · [View on Stellar.Expert](https://stellar.expert/explorer/testnet)
- [Protocol v2 (current)](https://stellar.expert/explorer/testnet/contract/CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD) · `CA2QE...`
- [Protocol v1 (legacy)](https://stellar.expert/explorer/testnet/contract/CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP) · `CBFE5...`

The canonical list is `contracts/stellar/bindings/src/contracts.json`, served by horizon at `/api/contracts`.

### NPM Packages

```bash
npm install @attestprotocol/stellar-sdk
npm install @attestprotocol/cli
```

**Browse on npm:**
[stellar-sdk](https://www.npmjs.com/package/@attestprotocol/stellar-sdk) ·
[cli](https://www.npmjs.com/package/@attestprotocol/cli)

</td>
</tr>
</table>

---

</div>

## Overview

**attest.so** provides enterprise-grade infrastructure for builders to create "Reputation Authorities" on-chain with verifiable and comprehensive identity proofs on Stellar.

Our framework addresses critical challenges in Web3:

- **Identity Verification**: Robust mechanisms for verifying identities across blockchain ecosystems
- **Interoperable Trust**: Consistent attestation standards on Stellar
- **Reputation Management**: Infrastructure for building and maintaining on-chain reputation
- **Scalable Solutions**: Enterprise-ready attestation infrastructure for builders

## Architecture

### Core Concepts

- **Attestations**: Verifiable, cryptographically signed claims made by an `Authority` about a `Subject`. They are structured according to a `Schema` and recorded on-chain.
- **Schemas**: Structured templates that define the format and data types for an attestation. They act as a blueprint, ensuring that attestations are consistent and machine-readable.
- **Authorities**: Trusted entities with the permission to issue, manage, and revoke attestations. Authorities are registered on-chain, and their integrity is verifiable.
- **Subjects**: The entities (e.g., users, smart contracts, organizations) about which attestations are made.
- **Resolvers**: On-chain programs responsible for interpreting and verifying attestations. They provide a standardized interface to locate, decode, and validate attestation data, and can be designed to handle complex logic such as dynamic schema resolution, revocation checks, and integration with off-chain data sources.

## Key Components

### 1. Smart Contracts

Our Stellar implementation, built with Soroban, provides a robust framework for on-chain attestations. It leverages Rust for performance and safety, and is designed to integrate seamlessly with the Stellar ecosystem, including Horizon and the Stellar SDK.

```
contracts/stellar/
├── protocol/         # Core attestation protocol logic
├── resolvers/        # Schema and attestation resolvers
└── ...               # Other configuration and build files
```

**Key Features:**

- **Authority Management**: Contracts for registering, verifying, and managing attestation authorities.
- **Core Protocol**: The central logic for creating, revoking, and managing attestations.
- **Resolvers**: Efficient on-chain logic to resolve schemas and attestations.
- **Soroban Integration**: Fully leverages Soroban's features for storage, authorization, and events.
- **Fee and Levy System**: Optional fee collection mechanism for monetizing attestation services.

### 2. SDK (Software Development Kit)

A TypeScript SDK that provides a unified interface for interacting with our attestation infrastructure on Stellar.

```typescript
// Example: Interacting with Stellar contracts via the SDK
import { AttestClient } from '@attestprotocol/sdk';
import { Keypair } from '@stellar/stellar-sdk';

// Initialize client for Stellar
const keypair = Keypair.fromSecret('YOUR_STELLAR_SECRET_KEY');
const client = new AttestClient({
  chain: 'stellar',
  network: 'testnet',
  secretKey: keypair.secret(),
});

// Create an attestation on Stellar
const attestation = await client.attest({
  schema: 'did:attest:identity',
  subject: 'G...', // Subject's Stellar public key
  claims: { verified: true, level: 'premium' },
});
```

**Core Functionality:**

- Blockchain connection management
- Schema creation and registration
- Attestation lifecycle management
- TypeScript-first for a better developer experience

### 3. CLI (Command Line Interface)

A powerful command-line tool for developers and administrators to interact with the protocol directly from the terminal.

```bash
# Install CLI
npm install -g @attestprotocol/cli

# Create a new attestation on the Stellar testnet
attest create \
  --schema did:attest:identity \
  --subject G... \
  --chain stellar \
  --network testnet \
  --claims '{"verified": true}'
```

### 4. Documentation and Examples

Comprehensive documentation and example implementations to facilitate integration:

- Interactive API reference
- Integration guides
- Example applications
- Best practices

## Project Structure

The repository follows a monorepo structure using pnpm workspaces:

```
attest.so/
├── apps/
│   ├── docs/          # Documentation site (Mintlify)
│   └── horizon/       # Stellar blockchain indexer (Express.js + MongoDB)
├── contracts/
│   └── stellar/       # Soroban contracts (protocol, resolvers)
├── packages/
│   ├── sdk/           # Unified TypeScript SDK
│   ├── stellar-sdk/   # Stellar-specific SDK implementation
│   ├── cli/           # CLI tool
│   └── core/          # Core SDK abstractions
└── examples/
```

See [NAMING.md](./NAMING.md) for detailed information about naming conventions and directory structure standards.

## Technical Stack

- **SDK/CLI**: TypeScript, Node.js, Stellar SDK, Horizon Client
- **Smart Contracts**: Rust with Soroban
- **Developer Experience**:
  - pnpm workspaces for monorepo management
  - TypeScript
  - ESLint/Prettier
  - Vitest for testing

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/daccred/attest.so.git
cd attest.so

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Running the Development Environment

```bash
# Start the documentation site
pnpm run dev:docs

# Run tests
pnpm test
```

### Working with Contracts

```bash
# Build Soroban contracts
cd contracts/stellar
soroban contract build

# Deploy to Stellar testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/authority.wasm \
  --network testnet \
  --source <YOUR_ACCOUNT>
```

## Contributing

Contributions are welcome! Please see our [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Setting up Rust Analyzer

With Rust Analyzer installed, you can configure it to recognize our Rust-based contract project:

```json
{
  "rust-analyzer.linkedProjects": [
    "contracts/stellar/Cargo.toml"
  ]
}
```

---

## Resources & Links

- [Product Development Log](https://daccred.notion.site/We-re-building-https-on-the-blockchain-df20b05cb5a04e379a165714aab024fb?pvs=4)
- [Technical Documentation](https://attest.so) (Coming Soon)
- [API Reference](https://attest.so) (Coming Soon)

---

## Awards & Recognition

<div align="center">

<table>
<tr>
<td align="center" width="50%">
<img src="https://cryptologos.cc/logos/solana-sol-logo.png" width="80" alt="Solana Logo"/>
<h3>Solana Radar Hackathon</h3>
<p><b>Public Goods Award Winner</b></p>
<p>Recognized for building critical public infrastructure for the Solana ecosystem</p>
<a href="https://x.com/solana/status/1856362113561964676">
  <img src="https://img.shields.io/badge/View%20Announcement-black?style=for-the-badge&logo=x" alt="View on X"/>
</a>
</td>
<td align="center" width="50%">
<img src="https://cryptologos.cc/logos/stellar-xlm-logo.png" width="80" alt="Stellar Logo"/>
<h3>Stellar Community Fund</h3>
<p><b>SCF Award Recipient</b></p>
<p>Selected for advancing attestation infrastructure on the Stellar network</p>
<a href="https://communityfund.stellar.org/submissions/recIHN98Ja7MMb4DX">
  <img src="https://img.shields.io/badge/View%20Submission-090020?style=for-the-badge&logo=stellar" alt="View on SCF"/>
</a>
</td>
</tr>
</table>

</div>

---

## License

This project is licensed under the [MIT License](./LICENSE).
