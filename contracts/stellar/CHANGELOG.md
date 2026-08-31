# @attestprotocol/stellar-contracts

## 3.0.0

### Major Changes

- 1d84f1b: Protocol contract v2 built on soroban-sdk 27; contract IDs are resolved from a versioned registry (`getContractId(network, version?)`, exported from `@attestprotocol/stellar-contracts/registry` and re-exported by the SDK) instead of being hardcoded. The `@stellar/stellar-sdk` peer range is now `>=16.0.0 <17`. v1 contract IDs remain available under the `v1` key.

  Two off-chain encoding bugs are fixed and change the values the SDK produces: attestation UIDs now encode the schema UID as `ScVal::Bytes` (matching the contract), and delegated attest/revoke messages bind to the sha256 of the contract address. UIDs and delegated signatures produced by earlier versions do not match on chain. The generated type `ResolverAttestation` is renamed `ResolverAttestationData`.

## 2.0.2

### Patch Changes

- b90b9e9: mainnet release version

## 2.0.1

### Patch Changes

- 4b56c67: SDK enhancements

## 2.0.0

### Major Changes

- 13e3f7f: prepare mainnet and setup graphs and rpc

## 1.7.6

### Patch Changes

- b14b837: integration refinements across SDK, horizon and schema deployer dApp

## 1.7.5

### Patch Changes

- 122527c: sdk references, update wash hash and contract spec with graph URL

## 1.7.4

### Patch Changes

- 1c2c8c2: fix npm resolution for sub-dependencies in stellar sdk

## 1.7.3

### Patch Changes

- 073bbc9: sdk export update with llm TXT doc gen

## 1.7.2

### Patch Changes

- 9f70611: sdk API standardization

## 1.7.1

### Patch Changes

- 8f14c2c: update sdk, standardize contract api and graph data

## 1.7.0

### Minor Changes

- 1989554: sdk bundle tooling and packages

## 1.6.0

### Minor Changes

- f319433: minor update

## 1.5.2

### Patch Changes

- efa55ba: bump

## 1.5.1

### Patch Changes

- 1b81be8: patch npm publish config for modules

## 1.5.0

### Minor Changes

- 77909d0: root package lockfile tracking and changelogs

### Patch Changes

- f832c6a: bump minor

## 1.4.1

### Patch Changes

- 33e4343: patch changeset config
- ceaebdf: patch changeset config

## 1.4.0

### Minor Changes

- 16e482d: changeset minor
- b2092fe: bump version
