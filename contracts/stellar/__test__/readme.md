# Protocol Contract Integration Tests

These tests run against a deployed protocol contract on testnet. Nothing here
uses a local host environment — every assertion is a real simulation or a real
transaction, so a failure means the deployed contract, the TypeScript bindings
and the off-chain helpers actually disagree.

## Suites

| File | What it covers |
| --- | --- |
| `protocol.integration.test.ts` | Schema registration (JSON and XDR definitions), attestation creation and retrieval, revocation. |
| `delegated-attestation.integration.test.ts` | BLS key registration, the attestation and revocation message layouts, nonce handling, and delegated submission paid for by a relayer. |
| `protocol-resolver.integration.test.ts` | Resolver dispatch. Currently a list of `todo` cases. |
| `contract-status.test.ts` | Contract reachability and off-chain attestation UID derivation. |

## Which contract the tests hit

The contract address comes from the registry, `bindings/src/contracts.json` —
never from a hardcoded ID and never from `deployments.json`. By default the
tests use the `current` entry for testnet; set `CONTRACT_VERSION` to pin a
specific one, which is how a freshly deployed version is validated before
`current` moves to it.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `ADMIN_SECRET_KEY` | yes | Secret key of the contract admin. It registers schemas and pays for the setup transactions. Keep it out of the repository — `env.sh` is gitignored. |
| `CONTRACT_VERSION` | no | Registry version to test against (`v1`, `v2`, …). Defaults to the network's `current`. |

Test accounts other than the admin are generated per run and funded by
Friendbot, so no further setup is needed.

## Running

```bash
# against the current testnet deployment
ADMIN_SECRET_KEY=$(stellar keys show <identity>) pnpm test

# against a specific version, before promoting it
ADMIN_SECRET_KEY=$(stellar keys show <identity>) CONTRACT_VERSION=v2 pnpm test
```

Suites run single-threaded with a 120 s timeout per test, because they share
testnet state and wait on ledger close times.

## Off-chain parity

`testutils.ts` mirrors three contract-side computations byte for byte. When a
contract changes any of them, these helpers must change with it or the tests
fail with an opaque contract error:

- `generateAttestationUid` — `utils.rs::generate_attestation_uid`, keyed on the
  contract address and the attester so UIDs cannot collide across deployments
  or attesters (contract error 5, `AttestationNotFound`, when it drifts).
- `createAttestationMessage` — `delegation.rs::create_attestation_message`.
- `createRevocationMessage` — `delegation.rs::create_revocation_message`.

Both message builders bind the signature to the contract address and the
network passphrase, so a signature made for one deployment is rejected by every
other one (contract error 21, `InvalidSignature`, when it drifts).
