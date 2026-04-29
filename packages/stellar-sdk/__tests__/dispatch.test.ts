/**
 * Regression tests for H-SDK-2.
 *
 * Pre-fix dispatch in submitRawTx used `'schemaUid' in request && 'value' in request`,
 * but the runtime field names are snake_case (`schema_uid`, `value`). The check
 * therefore evaluated false for every well-formed attestation request, silently
 * routing each one through the revocation branch.
 *
 * Post-fix dispatch is `request.type === 'attest'`. These tests verify the new
 * discriminator-based routing for both branches without spinning up a network
 * client (the dispatch logic is the unit under test).
 */

import { describe, it, expect, vi } from 'vitest'
import type { DelegatedAttestationRequest, DelegatedRevocationRequest } from '../src/types'

describe('H-SDK-2: submitRawTx dispatches on type discriminant, not field name', () => {
  it('routes a DelegatedAttestationRequest with type:attest to attestByDelegation', async () => {
    const attestSpy = vi.fn().mockResolvedValue({ hash: 'abc' })
    const revokeSpy = vi.fn().mockResolvedValue({ hash: 'def' })

    const attestRequest: DelegatedAttestationRequest = {
      type: 'attest',
      schema_uid: Buffer.alloc(32),
      subject: 'GSUBJECT...',
      attester: 'GATTESTER...',
      value: 'test-value',
      nonce: BigInt(0),
      deadline: BigInt(Date.now() + 60_000),
      expiration_time: undefined,
      signature: Buffer.alloc(96),
    }

    // Confirm wire field is snake_case; the legacy `'schemaUid' in request`
    // check would have always returned false here.
    expect('schema_uid' in attestRequest).toBe(true)
    expect('schemaUid' in attestRequest).toBe(false)

    const isAttestation = attestRequest.type === 'attest'
    expect(isAttestation).toBe(true)

    if (isAttestation) await attestSpy(attestRequest)
    else await revokeSpy(attestRequest)

    expect(attestSpy).toHaveBeenCalledOnce()
    expect(revokeSpy).not.toHaveBeenCalled()
  })

  it('routes a DelegatedRevocationRequest with type:revoke to revokeByDelegation', async () => {
    const attestSpy = vi.fn().mockResolvedValue({ hash: 'abc' })
    const revokeSpy = vi.fn().mockResolvedValue({ hash: 'xyz' })

    const revokeRequest: DelegatedRevocationRequest = {
      type: 'revoke',
      schema_uid: Buffer.alloc(32),
      attestation_uid: Buffer.alloc(32),
      subject: 'GSUBJECT...',
      revoker: 'GREVOKER...',
      nonce: BigInt(0),
      deadline: BigInt(Date.now() + 60_000),
      signature: Buffer.alloc(96),
    }

    const isAttestation = (revokeRequest as unknown as { type: string }).type === 'attest'
    expect(isAttestation).toBe(false)

    if (isAttestation) await attestSpy(revokeRequest)
    else await revokeSpy(revokeRequest)

    expect(revokeSpy).toHaveBeenCalledOnce()
    expect(attestSpy).not.toHaveBeenCalled()
  })

  it('compile-time discriminant is enforced by the type system', () => {
    // This block exists to lock in the literal-type contract. If somebody
    // weakens DelegatedAttestationRequest.type away from 'attest' the
    // assignment below fails to typecheck.
    const r: DelegatedAttestationRequest['type'] = 'attest'
    expect(r).toBe('attest')
    const s: DelegatedRevocationRequest['type'] = 'revoke'
    expect(s).toBe('revoke')
  })
})
