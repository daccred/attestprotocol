---
"@attestprotocol/stellar-contracts": major
"@attestprotocol/stellar-sdk": major
---

Protocol contract v2 built on soroban-sdk 27; contract IDs are resolved from a versioned registry (`getContractId(network, version?)`, exported from `@attestprotocol/stellar-contracts/registry` and re-exported by the SDK) instead of being hardcoded. The `@stellar/stellar-sdk` peer range is now `>=16.0.0 <17`. v1 contract IDs remain available under the `v1` key.

Two off-chain encoding bugs are fixed and change the values the SDK produces: attestation UIDs now encode the schema UID as `ScVal::Bytes` (matching the contract), and delegated attest/revoke messages bind to the sha256 of the contract address. UIDs and delegated signatures produced by earlier versions do not match on chain. The generated type `ResolverAttestation` is renamed `ResolverAttestationData`.
