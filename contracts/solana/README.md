## Solana Attestation Service

This is a Solana program that allows users to attest to the authenticity of a Solana transaction.

### Setup

1. Install Rust and Anchor CLI

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --git https://github.com/coral-xyz/anchor --tag v0.25.0 anchor-cli --locked
```

2. Install Solana CLI

```bash
sh -c "$(curl -sSfL https://release.solana.com/v1.14.13/install)"
```

3. Add Solana to PATH

```bash
export PATH="/home/0x/.local/share/solana/install/active_release/bin:$PATH"
```

4. Create a new Solana keypair

```bash
solana-keygen new
```

5. Add the new keypair to the Solana config

```bash
solana config set --keypair ~/.config/solana/id.json
```

6.

7. Initialize the program

```bash
anchor idl init
anchor idl seed
anchor idl generate
anchor build
anchor deploy
```

## Program Methods

#### `Register a new authority`

```bash
solana airdrop 10 <AUTHORITY_PUBKEY>
anchor invoke --program-id <PROGRAM_ID> register --accounts <AUTHORITY_PUBKEY>
```

#### `Verify the authority`

```bash
anchor invoke --program-id <PROGRAM_ID> update-authority --accounts <AUTHORITY_PUBKEY>
```

#### `Register a new schema`

```bash
anchor invoke --program-id <PROGRAM_ID> register-schema --accounts <AUTHORITY_PUBKEY> --args <SCHEMA_NAME> <SCHEMA_CONTENT> <RESOLVER_ADDRESS> <REVOCABLE>
```

#### `Fetch an existing schema`

```bash
anchor idl seed <SCHEMA_NAME>
anchor idl generate
anchor build
anchor idl verify
anchor idl decode --filepath target/idl/attestso.json --uid <SCHEMA_UID>
```

## Thoughts on Resolvers

Resolvers should be CPI by default.

- Our internal resolvers are CPI
- Our external resolvers are CPI

> the logical flow will be one of such, if a schema provides us it's own custom resolver, we will use it, otherwise we will route the attestation to the internal resolver which implements the interface for resolvers.

### Removed Packages

The following packages were removed due to unpatched security vulnerabilities in their transitive dependency trees:

- **`@solana/spl-token`** — depends on `@solana/buffer-layout-utils` → `bigint-buffer@1.1.5`, which has a high-severity buffer overflow vulnerability ([GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg)) with no patched version available. Re-add when the upstream dependency is fixed or replaced.

### Deployments

```bash

RPC URL: https://api.devnet.solana.com
Program Id: 3zqb9TDPZXQW3EWWokmrZtW7ic13caVmKZsQq3PK66Gm

☁  solana-attest [canary] ⚡  solana program close
☁  solana-attest [canary] ⚡  anchor keys sync
All program id declarations are synced.
☁  solana-attest [canary] ⚡  solana program show 3zqb9TDPZXQW3EWWokmrZtW7ic13caVmKZsQq3PK66Gm

Program Id: 3zqb9TDPZXQW3EWWokmrZtW7ic13caVmKZsQq3PK66Gm
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: HnETAo2y8zMzfYAXuXAk6BAWqsDqqqbPqCcUqVTjDgF7
Authority: 5hswvHkD3hUuUrLdfVRM59BmR46muY3Tf2J7UsyvZ5DL
Last Deployed In Slot: 331534948
Data Length: 300184 (0x49498) bytes
```
