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
 * Load test configuration from the contract registry and environment
 */
export function loadTestConfig(): TestConfig {
  try {
    const protocolContractId = getContractId(
      'testnet',
      process.env.CONTRACT_VERSION as ContractVersion | undefined
    )

    /** MUST COME from .env file */
    const adminSecretKey = process.env.ADMIN_SECRET_KEY as string;
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
 * Generates an attestation UID in JavaScript, replicating the logic from the Soroban smart contract.
 *
 * This function takes the same inputs as the Rust `generate_attestation_uid` function,
 * serializes them in the specific way Soroban expects, concatenates them, and then
 * computes the Keccak-256 hash to produce a unique 32-byte identifier.
 *
 * @param {Buffer} schemaUid - A 32-byte buffer representing the schema UID.
 * @param {string} subject - The public key string of the subject (e.g., "G...").
 * @param {bigint} nonce - The nonce as a BigInt, which corresponds to a Rust `u64`.
 * @returns {Buffer} A 32-byte buffer representing the calculated attestation UID.
 */
export function generateAttestationUid(schemaUid: Buffer, subject: string, nonce: bigint): Buffer {
  if (!(schemaUid instanceof Buffer) || schemaUid.length !== 32) {
    throw new Error('schemaUid must be a 32-byte Buffer.');
  }
  if (typeof subject !== 'string' || !subject.startsWith('G')) {
    throw new Error('subject must be a valid Stellar public key string.');
  }
  if (typeof nonce !== 'bigint') {
    throw new Error('nonce must be a BigInt.');
  }

  // 1. Convert schema_uid (BytesN<32>) to its XDR representation.
  // In Rust: hash_input.append(&schema_uid.to_xdr(env));
  const schemaUidScVal = nativeToScVal(schemaUid);
  const schemaUidXdr = schemaUidScVal.toXDR();

  // 2. Convert subject address (Address) to its XDR representation.
  // In Rust: hash_input.append(&subject.clone().to_xdr(env));
  const subjectAddress = new Address(subject);
  const subjectScVal = subjectAddress.toScVal();
  const subjectXdr = subjectScVal.toXDR();

  // 3. Convert nonce (u64) to an 8-byte big-endian buffer.
  // In Rust: let nonce_bytes = nonce.to_be_bytes();
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64BE(nonce, 0);

  // 4. Concatenate all parts in the correct order.
  // The Rust code appends the XDR of schema_uid, the XDR of the subject,
  // and finally the raw bytes of the nonce.
  const hashInput = Buffer.concat([
    schemaUidXdr,
    subjectXdr,
    nonceBuffer,
  ]);

  // 5. Compute the Keccak-256 hash of the concatenated buffer.
  // In Rust: env.crypto().keccak256(&hash_input).into()
  const hash = keccak256(hashInput);

  console.log(`========Hash=======:`, {uid: hash, uidBytes: Buffer.from(hash, 'hex'), schemaUid: schemaUid.toString('hex'), subject: subject, nonce: nonce})

  // 6. Return the resulting hash as a Buffer.
  return Buffer.from(hash, 'hex');
}
 


/**
 * Creates the message to sign for delegated attestations.
 * Must match the exact format from `delegation.rs::create_attestation_message`.
 * The message is a concatenation of domain separator, schema UID, nonce, deadline,
 * and value length, which is then hashed.
 *
 * @param request - The delegated attestation request object from the contract bindings.
 * @param attestationDST - The domain separation tag for attestations.
 * @returns A hash of the message, ready to be signed.
 */
export function createAttestationMessage(request: ProtocolContract.DelegatedAttestationRequest, attestationDST: Buffer) {
  // Match exact format from Rust contract: 
  // Domain Separator + Schema UID + Nonce + Deadline + [Expiration Time] + Value Length
  const components: Buffer[] = []
  
  // Domain separation (ATTEST_PROTOCOL_V1_DELEGATED)
  components.push(attestationDST)
  
  // Schema UID (32 bytes)
  components.push(Buffer.from(request.schema_uid))
  
  // Nonce (8 bytes, big-endian u64)
  const nonceBuffer = Buffer.allocUnsafe(8)
  nonceBuffer.writeBigUInt64BE(request.nonce, 0)
  components.push(nonceBuffer)
  
  // Deadline (8 bytes, big-endian u64) 
  const deadlineBuffer = Buffer.allocUnsafe(8)
  deadlineBuffer.writeBigUInt64BE(request.deadline, 0)
  components.push(deadlineBuffer)
  
  // Optional expiration time - skip since request doesn't have it
  
  // Value length (8 bytes, big-endian u64)
  const valueLenBuffer = Buffer.allocUnsafe(8)
  valueLenBuffer.writeBigUInt64BE(BigInt(request.value.length), 0)
  components.push(valueLenBuffer)
  
  const message = Buffer.concat(components)
  return bls12_381.shortSignatures.hash(sha256(message))
}

/**
 * Creates the message to sign for delegated revocations.
 * Must match the exact format from `delegation.rs::create_revocation_message`.
 * The message is a concatenation of domain separator, schema UID, nonce, and deadline,
 * which is then hashed.
 *
 * @param request - The delegated revocation request object from the contract bindings.
 * @param revocationDST - The domain separation tag for revocations.
 * @returns A hash of the message, ready to be signed.
 */
export function createRevocationMessage(request: ProtocolContract.DelegatedRevocationRequest, revocationDST: Buffer) {
  const components: Buffer[] = []
  
  // Domain separation (REVOKE_PROTOCOL_V1_DELEGATED)
  components.push(revocationDST)
  
  // Schema UID (32 bytes)
  components.push(Buffer.from(request.schema_uid))
  
  // Nonce (8 bytes, big-endian u64)
  const nonceBuffer = Buffer.allocUnsafe(8)
  nonceBuffer.writeBigUInt64BE(request.nonce, 0)
  components.push(nonceBuffer)
  
  // Deadline (8 bytes, big-endian u64)
  const deadlineBuffer = Buffer.allocUnsafe(8)
  deadlineBuffer.writeBigUInt64BE(request.deadline, 0)
  components.push(deadlineBuffer)
  
  const message = Buffer.concat(components)
  return bls12_381.shortSignatures.hash(sha256(message))
}


