import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import * as ProtocolContract from '../bindings/src/protocol'
import { getContractId, type ContractVersion } from '../bindings/src/registry'
import { keccak256 } from 'js-sha3';
import { bls12_381 } from '@noble/curves/bls12-381.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Defines the configuration required for running integration tests.
 * This includes contract IDs, RPC URL, and the admin's secret key.
 */
export interface TestConfig {
  adminSecretKey: string
  rpcUrl: string
  protocolContractId: string
}

/**
 * Check if a Stellar account exists on the network
 */
export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    const response = await fetch(`https://horizon-testnet.stellar.org/accounts/${publicKey}`)
    return response.ok
  } catch (error) {
    return false
  }
}

/**
 * Fund a Stellar account using Friendbot (testnet only)
 * Only funds if the account doesn't exist yet
 */
export async function fundAccountIfNeeded(publicKey: string): Promise<void> {
  const exists = await accountExists(publicKey)
  
  if (exists) {
    console.log(`Account ${publicKey} already exists, skipping funding`)
    return
  }
  
  try {
    console.log(`Funding new account: ${publicKey}`)
    const response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`)
    if (!response.ok) {
      console.warn(`Friendbot funding failed for ${publicKey}: ${response.statusText}`)
    } else {
      console.log(`Successfully funded account: ${publicKey}`)
    }
  } catch (error) {
    console.warn(`Error funding account ${publicKey}:`, error)
  }
}

/**
 * True when the environment carries the testnet credentials the
 * integration suites need. Used to skip them instead of failing.
 */
export const hasIntegrationTestEnv = Boolean(process.env.ADMIN_SECRET_KEY)

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
      `The integration tests run against a funded Stellar testnet account: ` +
      `copy contracts/stellar/.env.example to contracts/stellar/.env, fill in ` +
      `your keys, and source it (or export ${name}) before running vitest.`
    )
  }
  return value
}

/**
 * Load test configuration from the contract registry and environment
 */
export function loadTestConfig(): TestConfig {
  try {
    const protocolContractId = getContractId(
      'testnet',
      process.env.CONTRACT_VERSION as ContractVersion | undefined
    )

    /** MUST COME from .env file */
    const adminSecretKey = requireEnv('ADMIN_SECRET_KEY')
    const rpcUrl = 'https://soroban-testnet.stellar.org'

    return {
      adminSecretKey,
      rpcUrl,
      protocolContractId
    }
  } catch (error) {
    throw new Error(`Failed to load test configuration: ${error}`)
  }
}



/**
 * Utility function to create a simple XDR schema string for testing.
 * This function constructs a schema with metadata and a list of fields,
 * then serializes it to a base64 XDR string with the "XDR:" prefix.
 *
 * @param name - The name of the schema.
 * @param fields - An array of field objects, each with a name and type.
 * @returns A string representing the XDR schema, e.g., "XDR:AAAA...".
 */
export function createTestXDRSchema(name: string, fields: Array<{name: string, type: string}>): string {
  try {
    // Create field definitions in XDR format
    const fieldsXdr = fields.map(field => {
      return ProtocolContract.xdr.ScVal.scvMap([
        new ProtocolContract.xdr.ScMapEntry({
          key: ProtocolContract.xdr.ScVal.scvSymbol('name'),
          val: ProtocolContract.xdr.ScVal.scvString(field.name)
        }),
        new ProtocolContract.xdr.ScMapEntry({
          key: ProtocolContract.xdr.ScVal.scvSymbol('type'),
          val: ProtocolContract.xdr.ScVal.scvString(field.type)
        }),
        new ProtocolContract.xdr.ScMapEntry({
          key: ProtocolContract.xdr.ScVal.scvSymbol('optional'),
          val: ProtocolContract.xdr.ScVal.scvBool(false)
        })
      ])
    })

    // Create main schema XDR structure
    const schemaXdr = ProtocolContract.xdr.ScVal.scvMap([
      new ProtocolContract.xdr.ScMapEntry({
        key: ProtocolContract.xdr.ScVal.scvSymbol('name'),
        val: ProtocolContract.xdr.ScVal.scvString(name)
      }),
      new ProtocolContract.xdr.ScMapEntry({
        key: ProtocolContract.xdr.ScVal.scvSymbol('version'),
        val: ProtocolContract.xdr.ScVal.scvString('1.0')
      }),
      new ProtocolContract.xdr.ScMapEntry({
        key: ProtocolContract.xdr.ScVal.scvSymbol('description'),
        val: ProtocolContract.xdr.ScVal.scvString('Test schema for integration testing')
      }),
      new ProtocolContract.xdr.ScMapEntry({
        key: ProtocolContract.xdr.ScVal.scvSymbol('fields'),
        val: ProtocolContract.xdr.ScVal.scvVec(fieldsXdr)
      })
    ])

    // Convert to XDR string with prefix
    const xdrString = schemaXdr.toXDR('base64')
    return `XDR:${xdrString}`
  } catch (error) {
    throw new Error(`Failed to create XDR schema: ${error}`)
  }
}

/**
 * Utility function to parse an XDR schema string back into a JavaScript object.
 * It handles base64 decoding and parsing of the Soroban `ScVal` map structure.
 *
 * @param xdrSchemaString - A string containing the base64-encoded XDR schema, with or without the "XDR:" prefix.
 * @returns A JavaScript object representing the schema.
 */
export function parseXDRSchema(xdrSchemaString: string): {
  name: string
  version: string
  description: string
  fields: Array<{name: string, type: string, optional: boolean}>
} {
  try {
    // Remove XDR: prefix if present
    const xdrData = xdrSchemaString.startsWith('XDR:') 
      ? xdrSchemaString.substring(4) 
      : xdrSchemaString

    // Parse XDR back to ScVal
    const schemaScVal = ProtocolContract.xdr.ScVal.fromXDR(xdrData, 'base64')
    
    if (schemaScVal.switch() !== ProtocolContract.xdr.ScValType.scvMap()) {
      throw new Error('XDR data is not a map')
    }

    const schemaMap = schemaScVal.map()
    if (!schemaMap) {
      throw new Error('Invalid XDR schema map')
    }

    const result: any = {}

    // Extract schema properties from XDR map
    for (const entry of schemaMap) {
      const key = entry.key().sym().toString()
      const value = entry.val()

      switch (key) {
        case 'name':
        case 'version':
        case 'description':
          if (value.switch() === ProtocolContract.xdr.ScValType.scvString()) {
            result[key] = value.str().toString()
          }
          break
        case 'fields':
          if (value.switch() === ProtocolContract.xdr.ScValType.scvVec()) {
            const vec = value.vec()
            if (vec) {
              result.fields = parseFieldsFromXdr(vec)
            } else {
              result.fields = []
            }
          }
          break
      }
    }

    return result
  } catch (error) {
    throw new Error(`Failed to parse XDR schema: ${error}`)
  }
}

/**
 * Helper function to parse a vector of `ScVal` field maps into an array of JavaScript field objects.
 *
 * @param fieldsXdr - An array of `ScVal`s, where each element is a map representing a schema field.
 * @returns An array of field objects.
 */
function parseFieldsFromXdr(fieldsXdr: ProtocolContract.xdr.ScVal[]): Array<{name: string, type: string, optional: boolean}> {
  return fieldsXdr.map(fieldXdr => {
    if (fieldXdr.switch() !== ProtocolContract.xdr.ScValType.scvMap()) {
      throw new Error('Field is not a map')
    }

    const fieldMap = fieldXdr.map()
    if (!fieldMap) {
      throw new Error('Invalid field map')
    }

    const field: any = {}

    for (const entry of fieldMap) {
      const key = entry.key().sym().toString()
      const value = entry.val()

      switch (key) {
        case 'name':
        case 'type':
          if (value.switch() === ProtocolContract.xdr.ScValType.scvString()) {
            field[key] = value.str().toString()
          }
          break
        case 'optional':
          if (value.switch() === ProtocolContract.xdr.ScValType.scvBool()) {
            field.optional = value.b()
          }
          break
      }
    }

    return field
  })
}


/**
 * Generates an attestation UID exactly as `utils.rs::generate_attestation_uid` does.
 *
 * Wire layout (concatenated, then keccak256-hashed):
 *   "ATTEST_UID_V1" || contract_xdr || schema_uid_xdr_36 ||
 *   subject_xdr     || attester_xdr || nonce_be8
 *
 * The contract address keeps UIDs distinct across deployments and the attester
 * keeps two attesters from colliding on the same subject and nonce.
 *
 * @param contractAddress - The protocol contract the attestation lives in.
 * @param schemaUid - A 32-byte buffer representing the schema UID.
 * @param subject - The public key of the attestation subject.
 * @param attester - The public key of the attester.
 * @param nonce - The attester nonce, as a BigInt (Rust `u64`).
 * @returns A 32-byte buffer holding the attestation UID.
 */
export function generateAttestationUid(
  contractAddress: string,
  schemaUid: Buffer,
  subject: string,
  attester: string,
  nonce: bigint
): Buffer {
  if (!(schemaUid instanceof Buffer) || schemaUid.length !== 32) {
    throw new Error('schemaUid must be a 32-byte Buffer.');
  }
  if (typeof subject !== 'string' || !subject.startsWith('G')) {
    throw new Error('subject must be a valid Stellar public key string.');
  }
  if (typeof attester !== 'string' || !attester.startsWith('G')) {
    throw new Error('attester must be a valid Stellar public key string.');
  }
  if (typeof nonce !== 'bigint') {
    throw new Error('nonce must be a BigInt.');
  }

  const addressXdr = (address: string) => new Address(address).toScVal().toXDR()

  // `to_xdr` on the Rust side serializes the value as an ScVal, so a BytesN<32>
  // is ScVal::Bytes: discriminant, length, then the 32 raw bytes.
  const schemaUidXdr = nativeToScVal(schemaUid).toXDR()

  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64BE(nonce, 0);

  const hashInput = Buffer.concat([
    Buffer.from('ATTEST_UID_V1', 'utf8'),
    addressXdr(contractAddress),
    schemaUidXdr,
    addressXdr(subject),
    addressXdr(attester),
    nonceBuffer,
  ]);

  return Buffer.from(keccak256(hashInput), 'hex');
}


/**
 * SHA256 of an address in the XDR form the contract hashes
 * (`address.to_xdr(env)` over the ScVal wrapper).
 */
function hashAddress(address: string): Buffer {
  return Buffer.from(sha256(new Address(address).toScVal().toXDR()))
}

/** Big-endian u64, the encoding the contract uses for every numeric field. */
function be8(value: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(value, 0)
  return buf
}

/**
 * Creates the message to sign for delegated attestations.
 * Must match `delegation.rs::create_attestation_message` byte for byte:
 *
 *   DST || sha256(contract_xdr) || network_id || schema_uid ||
 *   sha256(subject_xdr) || nonce_be8 || deadline_be8 ||
 *   [expiration_be8] || sha256(value_xdr)
 *
 * The contract address and the network id are part of the preimage so a
 * signature minted against one deployment cannot be replayed on another.
 *
 * @param request - The delegated attestation request object from the contract bindings.
 * @param attestationDST - The domain separation tag for attestations.
 * @param contractId - The protocol contract the request will be submitted to.
 * @param networkPassphrase - The network passphrase that contract runs on.
 * @returns The G1 point to sign.
 */
export function createAttestationMessage(
  request: ProtocolContract.DelegatedAttestationRequest,
  attestationDST: Buffer,
  contractId: string,
  networkPassphrase: string
) {
  const components: Buffer[] = [
    attestationDST,
    hashAddress(contractId),
    Buffer.from(sha256(Buffer.from(networkPassphrase, 'utf8'))),
    Buffer.from(request.schema_uid),
    hashAddress(request.subject),
    be8(request.nonce),
    be8(request.deadline),
  ]

  if (request.expiration_time !== undefined) {
    components.push(be8(BigInt(request.expiration_time)))
  }

  components.push(Buffer.from(sha256(nativeToScVal(request.value, { type: 'string' }).toXDR())))

  return bls12_381.shortSignatures.hash(sha256(Buffer.concat(components)))
}

/**
 * Creates the message to sign for delegated revocations.
 * Must match `delegation.rs::create_revocation_message` byte for byte:
 *
 *   DST || sha256(contract_xdr) || network_id || schema_uid ||
 *   attestation_uid || sha256(subject_xdr) || nonce_be8 || deadline_be8
 *
 * @param request - The delegated revocation request object from the contract bindings.
 * @param revocationDST - The domain separation tag for revocations.
 * @param contractId - The protocol contract the request will be submitted to.
 * @param networkPassphrase - The network passphrase that contract runs on.
 * @returns The G1 point to sign.
 */
export function createRevocationMessage(
  request: ProtocolContract.DelegatedRevocationRequest,
  revocationDST: Buffer,
  contractId: string,
  networkPassphrase: string
) {
  const components: Buffer[] = [
    revocationDST,
    hashAddress(contractId),
    Buffer.from(sha256(Buffer.from(networkPassphrase, 'utf8'))),
    Buffer.from(request.schema_uid),
    Buffer.from(request.attestation_uid),
    hashAddress(request.subject),
    be8(request.nonce),
    be8(request.deadline),
  ]

  return bls12_381.shortSignatures.hash(sha256(Buffer.concat(components)))
}
