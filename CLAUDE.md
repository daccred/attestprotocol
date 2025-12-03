# CLAUDE.md

Guide for working with this repository.

## Project

Blockchain-based attestation infrastructure enabling verifiable claims across multiple chains.

**Supported Chains:** Stellar (active), Solana (dev), Starknet (planned), Aptos/Sui (research)

## Structure
```
apps/
  horizon/         # Stellar blockchain indexer (Express.js + MongoDB)
  docs/            # Documentation site (Mintlify)
contracts/
  solana/         # Anchor-based Solana contracts
  stellar/        # Soroban contracts (authority & protocol)
  starknet/       # Cairo contracts
  aptos/          # Move contracts
  sui/            # Move contracts
packages/
  sdk/            # TypeScript SDK for all chains
  cli/            # Unified CLI for all chains
  core/           # Core SDK abstractions
  stellar-sdk/    # Stellar-specific SDK implementation
  solana-sdk/     # Solana-specific SDK implementation  
  starknet-sdk/   # Starknet-specific SDK implementation
examples/         # Example implementations
```

## Commands

```bash
pnpm install    # Install (required: pnpm)
pnpm build      # Build all
pnpm dev        # Dev servers
pnpm test       # Run tests

# Workspace commands
pnpm --filter @attestprotocol/sdk build
pnpm run dev:docs  # Docs on :3001
```

**Contracts:**
```bash
# Stellar: cd contracts/stellar/protocol && make all
# Solana: cd contracts/solana && anchor build
# Starknet: cd contracts/starknet && scarb build
```

**Release:**
```bash
pnpm changeset                  # Version bump
pnpm release:stellar 1.0.0      # Release contracts
pnpm release                    # Full release
```

## Conventions

- No redundant prefixes: `contracts/solana/service/` not `contracts/solana/solana-service/`
- TypeScript strict mode, ESLint + Prettier
- Conventional commits (commitlint enforced)
- Tests: Vitest (TS/JS), cargo test (Rust), scarb test (Cairo)

## Requirements

Node.js + pnpm, Rust + Cargo, Scarb (Cairo), Anchor CLI (Solana)