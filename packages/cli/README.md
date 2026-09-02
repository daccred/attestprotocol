# @attestprotocol/cli

Unified CLI for Attest Protocol across all supported blockchains (Stellar, Solana, Starknet).

## Installation

```bash
npm install -g @attestprotocol/cli
```

## Usage

The CLI provides a unified interface for interacting with the Attest Protocol across different blockchains. All commands require a `--chain` parameter to specify which blockchain to use.

### Basic Syntax

```bash
attest <command> --chain=<stellar|solana|starknet> [options]
```

### Commands

#### Schema Management

Create a schema:
```bash
attest schema --chain=stellar --action=create --json-file=schema.json --key-file=stellar-key.json
```

Fetch a schema:
```bash
attest schema --chain=stellar --action=fetch --uid=<schema-uid> --key-file=stellar-key.json
```

#### Authority Management

Register as an authority:
```bash
attest authority --chain=stellar --action=register --key-file=stellar-key.json
```

Fetch authority information:
```bash
attest authority --chain=stellar --action=fetch --uid=<authority-id> --key-file=stellar-key.json
```

#### Attestation Management

Create an attestation:
```bash
attest attestation --chain=stellar --action=create --json-file=attestation.json --key-file=stellar-key.json
```

Fetch an attestation:
```bash
attest attestation --chain=stellar --action=fetch --uid=<attestation-uid> --key-file=stellar-key.json
```

Revoke an attestation:
```bash
attest attestation --chain=stellar --action=revoke --uid=<attestation-uid> --key-file=stellar-key.json
```

### Chain-Specific Key Formats

#### Stellar
Key file should contain the secret key:
```json
{
  "secret": "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
}
```

#### Solana  
Key file should contain the keypair as an array:
```json
[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64]
```

#### Starknet
Key file should contain account address and private key:
```json
{
  "accountAddress": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "privateKey": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
}
```

### Sample Files

The CLI package includes sample files to help you get started:

- `sample-schema.json` - Example schema definition
- `sample-attestation.json` - Example attestation data
- `sample-stellar-key.json` - Example Stellar key format
- `sample-solana-key.json` - Example Solana keypair format  
- `sample-starknet-key.json` - Example Starknet key format

### Custom RPC URLs

You can specify a custom RPC URL using the `--url` parameter:

```bash
attest schema --chain=stellar --action=create --json-file=schema.json --key-file=stellar-key.json --url=https://custom-rpc-url.com
```

### Environment Variables

You can set the following environment variables:

- `SOLANA_PROGRAM_ID` - Custom Solana program ID
- `STARKNET_CONTRACT_ADDRESS` - Custom Starknet contract address

## Examples

### Complete Workflow

1. Register as an authority:
```bash
attest authority --chain=stellar --action=register --key-file=my-stellar-key.json
```

2. Create a schema:
```bash
attest schema --chain=stellar --action=create --json-file=identity-schema.json --key-file=my-stellar-key.json
```

3. Create an attestation:
```bash
attest attestation --chain=stellar --action=create --json-file=identity-attestation.json --key-file=my-stellar-key.json
```

### Cross-Chain Usage

The same commands work across all supported chains by changing the `--chain` parameter:

```bash
# Stellar
attest-protocol schema --chain=stellar --action=create --json-file=schema.json --key-file=stellar-key.json

# Solana  
attest-protocol schema --chain=solana --action=create --json-file=schema.json --key-file=solana-key.json

# Starknet
attest-protocol schema --chain=starknet --action=create --json-file=schema.json --key-file=starknet-key.json
```

## Development

```bash
# Install dependencies
npm install

# Build the CLI
npm run build

# Run in development mode
npm run start

# Run tests
npm test
```

## Support

- [Documentation](https://docs.attestprotocol.org)
- [GitHub Issues](https://github.com/daccred/attest.so/issues)
- [Discord Community](https://discord.gg/attestso)