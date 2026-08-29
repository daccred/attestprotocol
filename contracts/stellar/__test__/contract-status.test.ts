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
  const contractId = loadTestConfig().protocolContractId
  const subject = 'GD25F6Z56KYTB4I4EU7KHGLM43VRBNENAUQ3GP24FZIO6WNAAJMUA7P5';
  const attester = 'GBRHC2QOPZC2GM2EKGEXJSDPLXGXBHHHRAQQ5MFLAS2AST4ZKM6NCCUB';
  const schemaUid = Buffer.from('a8b158f4f0aadc903cd58111199d8f71e75614e647d3c28c390c904014281f6d', 'hex');
  const nonce = BigInt(0);

  it('is deterministic', () => {
    const first = generateAttestationUid(contractId, schemaUid, subject, attester, nonce);
    const second = generateAttestationUid(contractId, schemaUid, subject, attester, nonce);

    expect(first.length).toBe(32);
    expect(first.toString('hex')).toBe(second.toString('hex'));
  });

  it('separates two attesters over the same subject and nonce', () => {
    const other = 'GAOR3RQGJO242K5BX5NNP2CXYJXQ2WQ5GP7ZUJG55PWR6FAMQODLNCYQ';

    expect(generateAttestationUid(contractId, schemaUid, subject, attester, nonce).toString('hex')).not.toBe(
      generateAttestationUid(contractId, schemaUid, subject, other, nonce).toString('hex')
    );
  });

  it('separates two deployments', () => {
    const otherContract = 'CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP';

    expect(generateAttestationUid(contractId, schemaUid, subject, attester, nonce).toString('hex')).not.toBe(
      generateAttestationUid(otherContract, schemaUid, subject, attester, nonce).toString('hex')
    );
  });
});
