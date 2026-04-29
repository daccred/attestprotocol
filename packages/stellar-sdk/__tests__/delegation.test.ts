/**
 * Regression tests for H-SDK-1.
 *
 * Pre-fix: getAttestDST / getRevokeDST swallowed every error from the
 * contract simulation and returned a hard-coded UTF-8 default DST. This
 * masked RPC outages, mis-deployed contracts, and any schema drift in
 * the on-chain DST emitter.
 *
 * Post-fix: errors from the underlying contract call propagate to the
 * caller. (In a follow-up commit these helpers are removed entirely as
 * the DST is no longer needed off-chain.)
 */

import { describe, it, expect, vi } from 'vitest'
import { getAttestDST, getRevokeDST } from '../src/delegation'

describe('H-SDK-1: DST fetch does not silently fall back', () => {
  it('getAttestDST propagates error when contract simulation fails', async () => {
    const mockClient = {
      get_dst_for_attestation: vi.fn().mockRejectedValue(new Error('RPC timeout')),
    } as any
    await expect(getAttestDST(mockClient)).rejects.toThrow('RPC timeout')
  })

  it('getRevokeDST propagates error when contract simulation fails', async () => {
    const mockClient = {
      get_dst_for_revocation: vi.fn().mockRejectedValue(new Error('network error')),
    } as any
    await expect(getRevokeDST(mockClient)).rejects.toThrow('network error')
  })

  it('getAttestDST propagates error from tx.simulate()', async () => {
    const mockClient = {
      get_dst_for_attestation: vi.fn().mockResolvedValue({
        simulate: vi.fn().mockRejectedValue(new Error('simulation reverted')),
      }),
    } as any
    await expect(getAttestDST(mockClient)).rejects.toThrow('simulation reverted')
  })
})
