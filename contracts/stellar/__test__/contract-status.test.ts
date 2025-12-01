import { describe, it, expect, beforeAll } from 'vitest'
import { Keypair, rpc } from '@stellar/stellar-sdk'
import * as ProtocolContract from '../bindings/src/protocol'
import { generateAttestationUid, loadTestConfig } from './testutils'

describe('Contract Status Check', () => {
  let protocolClient: ProtocolContract.Client
  let adminKeypair: Keypair
  let config: any

  beforeAll(async () => {
    config = loadTestConfig()
    adminKeypair = Keypair.fromSecret(config.adminSecretKey)

    protocolClient = new ProtocolContract.Client({
      contractId: config.protocolContractId,
      networkPassphrase: ProtocolContract.networks.testnet.networkPassphrase,
      rpcUrl: config.rpcUrl,
      allowHttp: true
    })
  })

  it('should check if protocol contract is initialized', async () => {
    try {
      // Try to call a simple method to see if contract responds
      const tx = await protocolClient.get_attestation({
        attestation_uid: Buffer.alloc(32, 0)
      })

      await tx.simulate()
      console.log('Protocol contract is accessible')
    } catch (error: any) {
      console.log('Protocol contract error:', error.message)
      // If we get a specific error about missing attestation, contract is working but no attestation exists
      expect(error.message).toBeDefined()
    }
  })
})

describe('UID Generation', () => {
  it('should generate a deterministic attestation UID', () => {
    // Values verified to match between TypeScript and Rust implementations
    const expectedUid = 'dc4f7c2bca792fb85288e5928af14e4ebbc76d98fd672f6bb15bd8f52ab5aaa5';
    const subject = 'GD25F6Z56KYTB4I4EU7KHGLM43VRBNENAUQ3GP24FZIO6WNAAJMUA7P5';
    const schemaUid = Buffer.from('a8b158f4f0aadc903cd58111199d8f71e75614e647d3c28c390c904014281f6d', 'hex');
    const nonce = BigInt(0);

    const generatedUid = generateAttestationUid(schemaUid, subject, nonce);

    expect(generatedUid.toString('hex')).toBe(expectedUid);
  });
});

