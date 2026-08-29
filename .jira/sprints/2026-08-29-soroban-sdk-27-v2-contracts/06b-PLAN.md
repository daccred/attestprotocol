---
sprint: 2026-08-29-soroban-sdk-27-v2-contracts
plan: IX
wave: IV-b
goal: Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.
worktree: false
branch: jira/2026-08-29-soroban-sdk-27-v2-contracts
issue: 117
depends_on: [VI]
parallel_with: []
files_modified:
  - packages/stellar-sdk/src/utils/uidGenerator.ts
  - packages/stellar-sdk/src/delegation.ts
  - packages/stellar-sdk/__tests__/delegation.test.ts
  - packages/stellar-sdk/__tests__/uid-parity.test.ts
  - packages/stellar-sdk/__tests__/delegation-parity.test.ts
  - packages/stellar-sdk/CHANGELOG.md
covers:
  - "EXECUTION Plan VI finding: stellar-sdk off-chain encodings diverge from the v2 contract (uidGenerator BytesN<32> XDR prefix; delegation message contract component)"
  - "User decision 2026-08-30: fix in the sprint before the Plan VII release, not as a follow-up issue"
---

# Plan IX: Align stellar-sdk off-chain encodings with the deployed v2 contract

**Sprint goal:** Stellar contracts run on soroban-sdk 27 as versioned v2 deployments whose addresses every consumer resolves from contracts.json.

**Worktree:** false — same checkout as Plan VI; needs the testnet v2 registry entry and the `attest-v2-testnet` identity in `contracts/stellar/env.sh`.

**This plan delivers:** `@attestprotocol/stellar-sdk` computes attestation UIDs and delegated attest/revoke messages byte-for-byte as `contracts/stellar/protocol/src/utils.rs` and `instructions/delegation.rs` do, proven by (a) parity tests against the already-correct helpers in `contracts/stellar/__test__/testutils.ts` and (b) a live round-trip against testnet v2. Inserted between Plans VI and VII so the coupled major in Plan VII does not ship the bug.

## Tasks

### I. Fix `encodeBytesN32Xdr` and the delegation contract component

- **Files:** `packages/stellar-sdk/src/utils/uidGenerator.ts`, `packages/stellar-sdk/src/delegation.ts`
- **Read first:** `contracts/stellar/__test__/testutils.ts` lines 255-400 (the corrected `generateAttestationUid`, `createAttestMessage`, `createRevokeMessage` — these are the reference implementations, proven against the deployed contract in Plan VI); `contracts/stellar/protocol/src/utils.rs` (`generate_attestation_uid`); `contracts/stellar/protocol/src/instructions/delegation.rs` lines 440-570 (message assembly); EXECUTION.md "### Plan VI" deviation notes on encoding.
- **Action:**
  1. `uidGenerator.ts:28` `encodeBytesN32Xdr`: replace the bare `0x00000020` length prefix with the ScVal::Bytes serialization — `nativeToScVal(buf).toXDR()` from `@stellar/stellar-sdk` (that is what `BytesN<32>::to_xdr` produces in soroban-sdk 27: `impl<T: IntoVal<Env,Val>> ToXdr for T` converts to `Val` then `serialize_to_bytes`). Confirm `encodeAddressXdr` at `:41` already yields `new Address(addr).toScVal().toXDR()`; if it uses any other layout, align it the same way.
  2. `delegation.ts:83-140` `createAttestMessage` / `createRevokeMessage`: the contract appends `sha256(contract_xdr)` for the contract component (see the message layout comment in `testutils.ts:324-326` and `delegation.rs`), not the raw address XDR. Replace `encodeAddressXdr(contractId)` at `:94` and `:138` with `Buffer.from(sha256(encodeAddressXdr(contractId)))` (the existing `sha256`-of-address helper at `:50` is the same shape used for the subject). Do not change any other component order.
  3. Delete any now-unused helper. `pnpm --filter @attestprotocol/stellar-sdk typecheck && lint` exit 0.
- **Done when:** `grep -n "0x00000020\|writeUInt32BE(32" packages/stellar-sdk/src/utils/uidGenerator.ts` returns nothing; `grep -n "sha256(encodeAddressXdr(contractId))" packages/stellar-sdk/src/delegation.ts` matches twice; typecheck and lint exit 0.
- **Covers:** Plan VI finding

### II. Parity tests against the reference helpers

- **Files:** `packages/stellar-sdk/__tests__/uid-parity.test.ts` (new), `packages/stellar-sdk/__tests__/delegation-parity.test.ts` (new), `packages/stellar-sdk/__tests__/delegation.test.ts`
- **Read first:** `contracts/stellar/__test__/testutils.ts` (import path from the package is `../../../contracts/stellar/__test__/testutils` — if that import drags in vitest-incompatible deps, copy the three reference functions verbatim into `packages/stellar-sdk/__tests__/testutils/reference-encodings.ts` with a header comment naming their source and commit hash); existing `__tests__/delegation.test.ts` (asserts determinism only).
- **Action:**
  1. `uid-parity.test.ts`: for three fixed inputs (contract `CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD`, a 32-byte schema UID, two G-addresses, nonce 0 / 1 / 2^40), assert `generateAttestationUid(...)` from the SDK equals the reference helper's output byte-for-byte. Add one regression vector: the value the old (bare-prefix) implementation produced must *not* equal the new one for nonce 0.
  2. `delegation-parity.test.ts`: same for `createAttestMessage` and `createRevokeMessage` across attest/revoke, with and without `expiration`, on the testnet passphrase.
  3. `delegation.test.ts`: keep the determinism assertions; add one assertion that the contract component of the message is 32 bytes (a sha256 digest), located at offset `len(DST)`.
  4. `pnpm --filter @attestprotocol/stellar-sdk test -- uid-parity delegation-parity delegation` all green; the pre-existing `indexer.test.ts` live-HTTP 404s remain out of scope (documented in Plan IV).
- **Done when:** the three test files pass; `grep -c "reference" packages/stellar-sdk/__tests__/uid-parity.test.ts` ≥ 1.
- **Covers:** Plan VI finding

### III. Live round-trip against testnet v2 and changelog entry

- **Files:** `packages/stellar-sdk/CHANGELOG.md`
- **Read first:** `contracts/stellar/__test__/delegated-attestation.integration.test.ts` and `protocol.integration.test.ts` (how they source `ADMIN_SECRET_KEY` and the registry), `contracts/stellar/env.sh` (do not print secrets), EXECUTION.md Plan VI "Integration suite" section.
- **Action:**
  1. Write a throwaway script under `$CLAUDE_JOB_DIR/tmp` (not committed) that uses **the SDK's** `generateAttestationUid` and `createAttestMessage` (not the test helpers) to: register a per-run schema, attest once via `attest`, then fetch it via `get_attestation` using the SDK-computed UID; and perform one `attest_by_delegation` with a BLS key registered for the run, signing the SDK-computed message. Source `ADMIN_SECRET_KEY` from `contracts/stellar/env.sh` via `source` in the shell, never echo it.
  2. Both calls must succeed on `CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD`. Record the two transaction hashes in EXECUTION.md.
  3. Add an "Unreleased" entry to `packages/stellar-sdk/CHANGELOG.md` under a "Fixed" heading: attestation UIDs and delegated attest/revoke messages now match the on-chain formula (BytesN XDR encoding; contract component hashed). State that UIDs computed by earlier SDK versions do not match on-chain UIDs. Plan VII's changeset will consume this.
- **Done when:** EXECUTION.md lists two testnet tx hashes that resolve on `https://stellar.expert/explorer/testnet/tx/<hash>`; `grep -n "Unreleased" packages/stellar-sdk/CHANGELOG.md` matches.
- **Covers:** Plan VI finding

## Nyquist criteria for this plan

- [ ] SDK `generateAttestationUid` output equals the reference helper for every fixture (uid-parity).
- [ ] SDK `createAttestMessage`/`createRevokeMessage` equal the reference helper for every fixture (delegation-parity).
- [ ] A `get_attestation` lookup on testnet v2 using an SDK-computed UID returns the attestation just written.
- [ ] An `attest_by_delegation` on testnet v2 with an SDK-computed message and a BLS signature over it succeeds.
- [ ] CHANGELOG records the behavioural change for consumers.

## Risks accepted in this plan

- The reference helpers live in the contracts test tree; if they cannot be imported cleanly, a verbatim copy with provenance is acceptable — drift is caught by the live round-trip.
- Live tests depend on testnet availability and the funded `attest-v2-testnet` account; if testnet is unreachable, task III is `blocked`, not skipped.
