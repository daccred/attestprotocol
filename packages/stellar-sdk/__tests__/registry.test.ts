/**
 * Contract address resolution goes through the registry, not hardcoded IDs.
 */

import { describe, it, expect } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import { getContractId } from '@attestprotocol/stellar-contracts/registry'
import { StellarAttestationClient } from '../src/client'

const publicKey = Keypair.random().publicKey()
const rpcUrl = 'https://soroban-testnet.stellar.org'

describe('registry-based contract resolution', () => {
  it("resolves the network's current contract when none is given", () => {
    const client = new StellarAttestationClient({ rpcUrl, network: 'testnet', publicKey })
    expect(client.resolvedContractId).toBe(getContractId('testnet'))
  })

  it('resolves mainnet separately', () => {
    const client = new StellarAttestationClient({ rpcUrl, network: 'mainnet', publicKey })
    expect(client.resolvedContractId).toBe(getContractId('mainnet'))
  })

  it('still prefers an explicit contractId', () => {
    const contractId = 'CDJG5ZH7MU7KREGS256QAWO2QDKQJEZHBUJRF6S6ACG5BIS3M4D5WPQT'
    const client = new StellarAttestationClient({ rpcUrl, network: 'testnet', publicKey, contractId })
    expect(client.resolvedContractId).toBe(contractId)
  })

  it('throws for a version that is not registered', () => {
    expect(
      () => new StellarAttestationClient({ rpcUrl, network: 'testnet', publicKey, contractVersion: 'v2' })
    ).toThrow('No v2 contract registered for testnet')
  })
})
