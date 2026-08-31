# @attestprotocol/stellar-sdk

## 3.0.0

### Major Changes

- 1d84f1b: Protocol contract v2 built on soroban-sdk 27; contract IDs are resolved from a versioned registry (`getContractId(network, version?)`, exported from `@attestprotocol/stellar-contracts/registry` and re-exported by the SDK) instead of being hardcoded. The `@stellar/stellar-sdk` peer range is now `>=16.0.0 <17`. v1 contract IDs remain available under the `v1` key.

  Two off-chain encoding bugs are fixed and change the values the SDK produces: attestation UIDs now encode the schema UID as `ScVal::Bytes` (matching the contract), and delegated attest/revoke messages bind to the sha256 of the contract address. UIDs and delegated signatures produced by earlier versions do not match on chain. The generated type `ResolverAttestation` is renamed `ResolverAttestationData`.

### Fixed

- Attestation UIDs and delegated attest/revoke messages now match the formula the
  Soroban contract uses. Two encodings were wrong: 32-byte values were serialized
  with a bare 4-byte length prefix instead of the full `ScVal::Bytes` form that
  `BytesN<32>::to_xdr` produces, and the delegated message bound the contract by its
  raw XDR address instead of the SHA-256 of it.

  **Breaking for consumers:** UIDs computed by earlier versions of this package do
  not match the UIDs stored on chain, so lookups built from them fail. Recompute any
  cached UID. Delegated signatures produced by earlier versions are rejected by the
  contract and must be re-signed.

### Patch Changes

- Updated dependencies [1d84f1b]
  - @attestprotocol/stellar-contracts@3.0.0

## 2.0.2

### Patch Changes

- b90b9e9: mainnet release version
- Updated dependencies [b90b9e9]
  - @attestprotocol/stellar-contracts@2.0.2
  - @attestprotocol/core@2.0.2

## 2.0.1

### Patch Changes

- 4b56c67: SDK enhancements
- Updated dependencies [4b56c67]
  - @attestprotocol/stellar-contracts@2.0.1
  - @attestprotocol/core@2.0.1

## 2.0.0

### Major Changes

- 13e3f7f: prepare mainnet and setup graphs and rpc

### Patch Changes

- Updated dependencies [13e3f7f]
  - @attestprotocol/stellar-contracts@2.0.0
  - @attestprotocol/core@2.0.0

## 1.7.5

### Patch Changes

- b14b837: integration refinements across SDK, horizon and schema deployer dApp
- Updated dependencies [b14b837]
  - @attestprotocol/stellar-contracts@1.7.6
  - @attestprotocol/core@1.7.6

## 1.7.5

### Patch Changes

- 122527c: sdk references, update wash hash and contract spec with graph URL
- Updated dependencies [122527c]
  - @attestprotocol/stellar-contracts@1.7.5
  - @attestprotocol/core@1.7.5

## 1.7.4

### Patch Changes

- 1c2c8c2: fix npm resolution for sub-dependencies in stellar sdk
- Updated dependencies [1c2c8c2]
  - @attestprotocol/stellar-contracts@1.7.4
  - @attestprotocol/core@1.7.4

## 1.7.3

### Patch Changes

- 073bbc9: sdk export update with llm TXT doc gen
- Updated dependencies [073bbc9]
  - @attestprotocol/stellar-contracts@1.7.3
  - @attestprotocol/core@1.7.3

## 1.7.2

### Patch Changes

- 9f70611: sdk API standardization
- Updated dependencies [9f70611]
  - @attestprotocol/stellar-contracts@1.7.2
  - @attestprotocol/core@1.7.2

## 1.7.1

### Patch Changes

- 8f14c2c: update sdk, standardize contract api and graph data
- Updated dependencies [8f14c2c]
  - @attestprotocol/stellar-contracts@1.7.1
  - @attestprotocol/core@1.7.1

## 1.7.0

### Minor Changes

- 1989554: sdk bundle tooling and packages

### Patch Changes

- Updated dependencies [1989554]
  - @attestprotocol/stellar-contracts@1.7.0
  - @attestprotocol/core@1.7.0

## 0.2.0

### Minor Changes

- f319433: minor update

### Patch Changes

- Updated dependencies [f319433]
  - @attestprotocol/core@0.2.0
