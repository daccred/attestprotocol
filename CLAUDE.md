# CLAUDE.md

Guide for working with this repository.

## Project

Blockchain-based attestation infrastructure enabling verifiable claims on Stellar.

**Supported Chain:** Stellar

## Structure
```
apps/
  horizon/         # Stellar blockchain indexer (Express.js + MongoDB)
  docs/            # Documentation site (Mintlify)
contracts/
  stellar/        # Soroban contracts (protocol & resolvers)
  solana/         # Anchor-based Solana contracts (dev)
  starknet/       # Cairo contracts (dev)
  sui/            # Move contracts (dev)
packages/
  sdk/            # TypeScript SDK (re-exports stellar-sdk + core)
  cli/            # CLI for Stellar
  core/           # Core SDK abstractions
  stellar-sdk/    # Stellar-specific SDK implementation
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
```

**Release:**
```bash
pnpm changeset                  # Version bump
pnpm release:stellar 1.0.0      # Release contracts
pnpm release                    # Full release
```

## Conventions

- No redundant prefixes: `contracts/stellar/protocol/` not `contracts/stellar/stellar-protocol/`
- TypeScript strict mode, ESLint + Prettier
- Conventional commits (commitlint enforced)
- Tests: Vitest (TS/JS), cargo test (Rust)

## Requirements

Node.js + pnpm, Rust + Cargo
