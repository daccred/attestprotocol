import { Buffer } from "buffer";
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Typepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk'
export * as contract from '@stellar/stellar-sdk/contract'
export * as rpc from '@stellar/stellar-sdk/rpc'

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: { networkPassphrase: "Test SDF Network ; September 2015", contractId: "CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP" },
  local: { networkPassphrase: "Test SDF Network ; September 2015", contractId: undefined },
  mainnet: { networkPassphrase: "Public Global Stellar Network ; September 2015", contractId: "CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI" },
} as const
 

export interface ResolverAttestation {
  attester: string;
  data: Buffer;
  expiration_time: u64;
  recipient: string;
  ref_uid: Buffer;
  revocable: boolean;
  revocation_time: u64;
  schema_uid: Buffer;
  time: u64;
  uid: Buffer;
  value: i128;
}


/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                                 Schema                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Represents a schema definition that attestations can follow.
 * 
 * Schemas define the structure and validation rules for attestations.
 * The definition field supports multiple formats:
 * - XDR-encoded: Stellar-native binary format for structured data
 * - JSON: Human-readable structured format
 */
export interface Schema {
  /**
 * The address of the authority that created this schema
 */
authority: string;
  /**
 * The schema definition in any supported format
 * 
 * Supports XDR-encoded structured data or JSON
 */
definition: string;
  /**
 * Optional address of a resolver contract for this schema
 * 
 * If present, this contract will be called to handle attestation operations.
 */
resolver: Option<string>;
  /**
 * Whether attestations using this schema can be revoked
 */
revocable: boolean;
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                                 DataKey                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Represents the keys used for data storage in the contract.
 * 
 * Each variant corresponds to a different type of data that can be stored
 * in the contract's persistent storage.
 */
export type DataKey = {tag: "Admin", values: void} | {tag: "Authority", values: readonly [string]} | {tag: "Schema", values: readonly [Buffer]} | {tag: "AttestationUID", values: readonly [Buffer]} | {tag: "AttesterNonce", values: readonly [string]} | {tag: "AttesterPublicKey", values: readonly [string]};


/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                               Authority                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Represents an authority that can create schemas and attestations.
 * 
 * Authorities are registered entities with specific permissions in the system
 * that can create schemas and issue attestations.
 */
export interface Authority {
  /**
 * The Stellar address of the authority
 */
address: string;
  /**
 * Metadata describing the authority
 * 
 * Typically in JSON format, containing information about the authority.
 */
metadata: string;
}


/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                            Attestation                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Represents an attestation with support for both direct and delegated attestations.
 * 
 * Used for tracking attestations and supporting multiple attestations per schema/subject
 * pair through nonces.
 */
export interface Attestation {
  /**
 * The address of the entity that created this attestation
 * 
 * In direct attestations, this is the caller.
 * In delegated attestations, this is the original signer.
 */
attester: string;
  /**
 * Optional expiration timestamp
 * 
 * If set, the attestation is considered invalid after this time.
 */
expiration_time: Option<u64>;
  /**
 * Unique nonce for this attestation
 * 
 * Allows for multiple attestations of the same schema for the same subject,
 * and prevents replay attacks in delegated attestations.
 */
nonce: u64;
  /**
 * Optional timestamp when the attestation was revoked
 */
revocation_time: Option<u64>;
  /**
 * Whether this attestation has been revoked
 */
revoked: boolean;
  /**
 * The unique identifier of the schema this attestation follows
 */
schema_uid: Buffer;
  /**
 * The address of the entity that is the subject of this attestation
 */
subject: string;
  /**
 * Timestamp when the attestation was created
 */
timestamp: u64;
  /**
 * The unique identifier of the attestation
 */
uid: Buffer;
  /**
 * The value or content of the attestation
 */
value: string;
}


/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                            BLS Public Key                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Represents a BLS12-381 public key for an attester.
 * 
 * Each wallet address can have exactly one BLS public key. No updates or revocations.
 */
export interface BlsPublicKey {
  /**
 * The BLS12-381 G2 public key (192 bytes compressed)
 */
key: Buffer;
  /**
 * Timestamp when this key was registered
 */
registered_at: u64;
}


/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      DelegatedRevocationRequest                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Represents a request for delegated revocation.
 * 
 * This allows an attester to sign a revocation off-chain, which can then be
 * submitted on-chain by any party.
 */
export interface DelegatedRevocationRequest {
  /**
 * The unique identifier of the attestation to revoke
 */
attestation_uid: Buffer;
  /**
 * Expiration timestamp for this signed request
 */
deadline: u64;
  /**
 * The nonce of the attestation to revoke
 */
nonce: u64;
  /**
 * The address of the original attester (who signed off-chain)
 */
revoker: string;
  /**
 * The unique identifier of the schema
 */
schema_uid: Buffer;
  /**
 * BLS12-381 G1 signature of the request data (96 bytes)
 */
signature: Buffer;
  /**
 * The address of the entity that is the subject of the attestation to revoke
 */
subject: string;
}


/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                      DelegatedAttestationRequest                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Represents a request for delegated attestations.
 * 
 * This allows an attester to sign an attestation off-chain, which can then be
 * submitted on-chain by any party (who will pay the transaction fees).
 */
export interface DelegatedAttestationRequest {
  /**
 * The address of the original attester (who signed off-chain)
 */
attester: string;
  /**
 * Expiration timestamp for this signed request
 * 
 * After this time, the signature is no longer valid and cannot be submitted.
 */
deadline: u64;
  /**
 * Optional expiration time for the attestation itself
 */
expiration_time: Option<u64>;
  /**
 * The nonce for this attestation (must be the next expected nonce for the attester)
 */
nonce: u64;
  /**
 * The unique identifier of the schema this attestation follows
 */
schema_uid: Buffer;
  /**
 * BLS12-381 G1 signature of the request data (96 bytes)
 */
signature: Buffer;
  /**
 * The address of the entity that is the subject of this attestation
 */
subject: string;
  /**
 * The value or content of the attestation
 */
value: string;
}

export const Errors = {
  1: {message:"TransferFailed"},
  2: {message:"AuthorityNotRegistered"},
  3: {message:"SchemaNotFound"},
  4: {message:"AttestationExists"},
  5: {message:"AttestationNotFound"},
  6: {message:"NotAuthorized"},
  7: {message:"StorageFailed"},
  9: {message:"InvalidUid"},
  10: {message:"ResolverError"},
  11: {message:"SchemaHasNoResolver"},
  12: {message:"AdminNotSet"},
  13: {message:"AlreadyInitialized"},
  14: {message:"NotInitialized"},
  15: {message:"AttestationNotRevocable"},
  16: {message:"InvalidSchemaDefinition"},
  17: {message:"InvalidAttestationValue"},
  18: {message:"InvalidReference"},
  19: {message:"InvalidNonce"},
  20: {message:"ExpiredSignature"},
  21: {message:"InvalidSignature"},
  22: {message:"AttestationExpired"},
  23: {message:"InvalidDeadline"},
  24: {message:"ResolverCallFailed"},
  25: {message:"InvalidSignaturePoint"},
  26: {message:"BlsPubKeyNotRegistered"},
  27: {message:"IntegerOverflow"}
}

export interface Client {
  /**
   * Construct and simulate a attest transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates an attestation where the attester is also the subject.
   * 
   * This function creates a new attestation based on a specified schema. The `attester`
   * must authorize this operation by signing the transaction, and they will also be the subject of the attestation.
   * 
   * # Arguments
   * 
   * * `attester` - The address of the entity making the attestation. Must be the transaction signer.
   * * `schema_uid` - The UID of the schema for which the attestation is being made.
   * * `value` - The value of the attestation, conforming to the schema's definition.
   * * `expiration_time` - An optional Unix timestamp indicating when the attestation expires.
   * 
   * # Returns
   * 
   * Returns a `Result` containing the 32-byte UID of the newly created attestation,
   * or an error if the process fails.
   */
  attest: ({attester, schema_uid, value, expiration_time}: {attester: string, schema_uid: Buffer, value: string, expiration_time: Option<u64>}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revokes an existing attestation.
   * 
   * Only the original attester or an authorized party (as defined by the schema) can
   * revoke an attestation. The schema must also permit revocations.
   * 
   * # Arguments
   * 
   * * `revoker` - The address of the entity revoking the attestation. Must be authorized to perform this action.
   * * `attestation_uid` - The UID of the attestation to be revoked.
   * 
   * # Returns
   * 
   * Returns `Ok(())` on successful revocation, or an error if the revocation fails.
   */
  revoke: ({revoker, attestation_uid}: {revoker: string, attestation_uid: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a new attestation schema.
   * 
   * A schema defines the structure and rules for attestations. Each schema is
   * identified by a unique UID, which is derived from its definition.
   * 
   * # Arguments
   * 
   * * `caller` - The address of the entity registering the schema. The caller is designated as the schema's creator.
   * * `schema_definition` - A string defining the schema. The format of this string is up to the implementer.
   * * `resolver` - An optional address of a contract that can resolve or validate attestations against this schema.
   * * `revocable` - A boolean indicating whether attestations made against this schema can be revoked.
   * 
   * # Returns
   * 
   * Returns a `Result` containing the 32-byte UID of the newly registered schema,
   * or an error if the registration fails.
   */
  register: ({caller, schema_definition, resolver, revocable}: {caller: string, schema_definition: string, resolver: Option<string>, revocable: boolean}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a get_schema transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves a registered schema by its UID.
   * 
   * # Arguments
   * 
   * * `schema_uid` - The 32-byte unique identifier of the schema to retrieve.
   * 
   * # Returns
   * 
   * Returns a `Result` containing the `Schema` struct if found, or an error
   * if no schema with the given UID exists.
   */
  get_schema: ({schema_uid}: {schema_uid: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Schema>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initializes the contract with an administrative address.
   * 
   * This function can only be called once. Subsequent calls will result in an
   * `AlreadyInitialized` error.
   * 
   * # Arguments
   * 
   * * `admin` - The address to be set as the contract administrator.
   * 
   * # Errors
   * 
   * Returns `Err(errors::Error::AlreadyInitialized)` if the contract has already been initialized.
   */
  initialize: ({admin}: {admin: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_bls_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gets the BLS public key for an attester.
   * 
   * # Arguments
   * 
   * * `attester` - The address of the attester.
   * 
   * # Returns
   * 
   * Returns a `Result` containing the `BlsPublicKey` if found, or an error if no key
   * is registered for the given attester.
   */
  get_bls_key: ({attester}: {attester: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<BlsPublicKey>>>

  /**
   * Construct and simulate a get_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Retrieves an attestation by its UID.
   * 
   * # Arguments
   * 
   * * `attestation_uid` - The 32-byte unique identifier of the attestation to retrieve.
   * 
   * # Returns
   * 
   * Returns a `Result` containing the `Attestation` struct if found, or an error
   * if no attestation with the given UID exists.
   */
  get_attestation: ({attestation_uid}: {attestation_uid: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<Attestation>>>

  /**
   * Construct and simulate a register_bls_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers a BLS public key for an attester.
   * 
   * This public key can be used to verify delegated attestations and revocations,
   * enabling more advanced cryptographic operations. The attester must authorize this registration.
   * 
   * # Arguments
   * 
   * * `attester` - The address of the attester for whom the BLS key is being registered. Must authorize transaction.
   * * `public_key` - The 192-byte BLS public key.
   * 
   * # Returns
   * 
   * Returns `Ok(())` on successful registration, or an error if one already exists or registration fails.
   */
  register_bls_key: ({attester, public_key}: {attester: string, public_key: Buffer}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_attester_nonce transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gets the next nonce for an attester.
   * 
   * Nonces are used in delegated requests to prevent replay attacks. Each delegated
   * request from an attester must have a unique, sequential nonce.
   * 
   * # Arguments
   * 
   * * `attester` - The address of the attester.
   * 
   * # Returns
   * 
   * Returns the next expected nonce (`u64`) for the given attester.
   */
  get_attester_nonce: ({attester}: {attester: string}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a attest_by_delegation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Creates an attestation using a delegated signature.
   * 
   * This method allows for gas-less attestations where a `submitter` can post an
   * attestation on behalf of an `attester`. The `attester`'s authorization is
   * verified through a signed `DelegatedAttestationRequest`. The attestation UID
   * can be derived off-chain from the request parameters.
   * 
   * Anyone can submit this transaction, paying the fees.
   * 
   * # Arguments
   * 
   * * `submitter` - The address submitting the transaction, which must authorize the invocation.
   * * `request` - The `DelegatedAttestationRequest` struct containing the attestation details and the attester's signature.
   * 
   * # Returns
   * 
   * Returns `Ok(())` on success, or an error if the request is invalid or signature verification fails.
   */
  attest_by_delegation: ({submitter, request}: {submitter: string, request: DelegatedAttestationRequest}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a revoke_by_delegation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Revokes an attestation using a delegated signature.
   * 
   * This method allows for gas-less revocations where a `submitter` can post a
   * revocation on behalf of a `revoker`. The `revoker`'s authorization is
   * verified through a signed `DelegatedRevocationRequest`.
   * 
   * # Arguments
   * 
   * * `submitter` - The address submitting the transaction, which must authorize the invocation.
   * * `request` - The `DelegatedRevocationRequest` struct containing the revocation details and the revoker's signature.
   * 
   * # Returns
   * 
   * Returns `Ok(())` on success, or an error if the request is invalid or signature verification fails.
   */
  revoke_by_delegation: ({submitter, request}: {submitter: string, request: DelegatedRevocationRequest}, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_dst_for_revocation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gets the domain separation tag (DST) for delegated revocations.
   * 
   * The DST is a unique byte string used to ensure that signatures created for one
   * purpose cannot be repurposed for another. This is crucial for the security of
   * delegated operations.
   * 
   * # Returns
   * 
   * Returns the `Bytes` slice representing the DST for delegated revocations.
   */
  get_dst_for_revocation: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a get_dst_for_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Gets the domain separation tag (DST) for delegated attestations.
   * 
   * The DST is a unique byte string used to ensure that signatures created for one
   * purpose cannot be repurposed for another. This is crucial for the security of
   * delegated operations.
   * 
   * # Returns
   * 
   * Returns the `Bytes` slice representing the DST for delegated attestations.
   */
  get_dst_for_attestation: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Buffer>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAAE1Jlc29sdmVyQXR0ZXN0YXRpb24AAAAACwAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAAAAAARkYXRhAAAADgAAAAAAAAAPZXhwaXJhdGlvbl90aW1lAAAAAAYAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAAB3JlZl91aWQAAAAADgAAAAAAAAAJcmV2b2NhYmxlAAAAAAAAAQAAAAAAAAAPcmV2b2NhdGlvbl90aW1lAAAAAAYAAAAAAAAACnNjaGVtYV91aWQAAAAAA+4AAAAgAAAAAAAAAAR0aW1lAAAABgAAAAAAAAADdWlkAAAAA+4AAAAgAAAAAAAAAAV2YWx1ZQAAAAAAAAs=",
        "AAAAAAAAAutDcmVhdGVzIGFuIGF0dGVzdGF0aW9uIHdoZXJlIHRoZSBhdHRlc3RlciBpcyBhbHNvIHRoZSBzdWJqZWN0LgoKVGhpcyBmdW5jdGlvbiBjcmVhdGVzIGEgbmV3IGF0dGVzdGF0aW9uIGJhc2VkIG9uIGEgc3BlY2lmaWVkIHNjaGVtYS4gVGhlIGBhdHRlc3RlcmAKbXVzdCBhdXRob3JpemUgdGhpcyBvcGVyYXRpb24gYnkgc2lnbmluZyB0aGUgdHJhbnNhY3Rpb24sIGFuZCB0aGV5IHdpbGwgYWxzbyBiZSB0aGUgc3ViamVjdCBvZiB0aGUgYXR0ZXN0YXRpb24uCgojIEFyZ3VtZW50cwoKKiBgYXR0ZXN0ZXJgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIGVudGl0eSBtYWtpbmcgdGhlIGF0dGVzdGF0aW9uLiBNdXN0IGJlIHRoZSB0cmFuc2FjdGlvbiBzaWduZXIuCiogYHNjaGVtYV91aWRgIC0gVGhlIFVJRCBvZiB0aGUgc2NoZW1hIGZvciB3aGljaCB0aGUgYXR0ZXN0YXRpb24gaXMgYmVpbmcgbWFkZS4KKiBgdmFsdWVgIC0gVGhlIHZhbHVlIG9mIHRoZSBhdHRlc3RhdGlvbiwgY29uZm9ybWluZyB0byB0aGUgc2NoZW1hJ3MgZGVmaW5pdGlvbi4KKiBgZXhwaXJhdGlvbl90aW1lYCAtIEFuIG9wdGlvbmFsIFVuaXggdGltZXN0YW1wIGluZGljYXRpbmcgd2hlbiB0aGUgYXR0ZXN0YXRpb24gZXhwaXJlcy4KCiMgUmV0dXJucwoKUmV0dXJucyBhIGBSZXN1bHRgIGNvbnRhaW5pbmcgdGhlIDMyLWJ5dGUgVUlEIG9mIHRoZSBuZXdseSBjcmVhdGVkIGF0dGVzdGF0aW9uLApvciBhbiBlcnJvciBpZiB0aGUgcHJvY2VzcyBmYWlscy4AAAAABmF0dGVzdAAAAAAABAAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAAAAAApzY2hlbWFfdWlkAAAAAAPuAAAAIAAAAAAAAAAFdmFsdWUAAAAAAAAQAAAAAAAAAA9leHBpcmF0aW9uX3RpbWUAAAAD6AAAAAYAAAABAAAD6QAAA+4AAAAgAAAAAw==",
        "AAAAAAAAAclSZXZva2VzIGFuIGV4aXN0aW5nIGF0dGVzdGF0aW9uLgoKT25seSB0aGUgb3JpZ2luYWwgYXR0ZXN0ZXIgb3IgYW4gYXV0aG9yaXplZCBwYXJ0eSAoYXMgZGVmaW5lZCBieSB0aGUgc2NoZW1hKSBjYW4KcmV2b2tlIGFuIGF0dGVzdGF0aW9uLiBUaGUgc2NoZW1hIG11c3QgYWxzbyBwZXJtaXQgcmV2b2NhdGlvbnMuCgojIEFyZ3VtZW50cwoKKiBgcmV2b2tlcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgZW50aXR5IHJldm9raW5nIHRoZSBhdHRlc3RhdGlvbi4gTXVzdCBiZSBhdXRob3JpemVkIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24uCiogYGF0dGVzdGF0aW9uX3VpZGAgLSBUaGUgVUlEIG9mIHRoZSBhdHRlc3RhdGlvbiB0byBiZSByZXZva2VkLgoKIyBSZXR1cm5zCgpSZXR1cm5zIGBPaygoKSlgIG9uIHN1Y2Nlc3NmdWwgcmV2b2NhdGlvbiwgb3IgYW4gZXJyb3IgaWYgdGhlIHJldm9jYXRpb24gZmFpbHMuAAAAAAAABnJldm9rZQAAAAAAAgAAAAAAAAAHcmV2b2tlcgAAAAATAAAAAAAAAA9hdHRlc3RhdGlvbl91aWQAAAAD7gAAACAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAu1SZWdpc3RlcnMgYSBuZXcgYXR0ZXN0YXRpb24gc2NoZW1hLgoKQSBzY2hlbWEgZGVmaW5lcyB0aGUgc3RydWN0dXJlIGFuZCBydWxlcyBmb3IgYXR0ZXN0YXRpb25zLiBFYWNoIHNjaGVtYSBpcwppZGVudGlmaWVkIGJ5IGEgdW5pcXVlIFVJRCwgd2hpY2ggaXMgZGVyaXZlZCBmcm9tIGl0cyBkZWZpbml0aW9uLgoKIyBBcmd1bWVudHMKCiogYGNhbGxlcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgZW50aXR5IHJlZ2lzdGVyaW5nIHRoZSBzY2hlbWEuIFRoZSBjYWxsZXIgaXMgZGVzaWduYXRlZCBhcyB0aGUgc2NoZW1hJ3MgY3JlYXRvci4KKiBgc2NoZW1hX2RlZmluaXRpb25gIC0gQSBzdHJpbmcgZGVmaW5pbmcgdGhlIHNjaGVtYS4gVGhlIGZvcm1hdCBvZiB0aGlzIHN0cmluZyBpcyB1cCB0byB0aGUgaW1wbGVtZW50ZXIuCiogYHJlc29sdmVyYCAtIEFuIG9wdGlvbmFsIGFkZHJlc3Mgb2YgYSBjb250cmFjdCB0aGF0IGNhbiByZXNvbHZlIG9yIHZhbGlkYXRlIGF0dGVzdGF0aW9ucyBhZ2FpbnN0IHRoaXMgc2NoZW1hLgoqIGByZXZvY2FibGVgIC0gQSBib29sZWFuIGluZGljYXRpbmcgd2hldGhlciBhdHRlc3RhdGlvbnMgbWFkZSBhZ2FpbnN0IHRoaXMgc2NoZW1hIGNhbiBiZSByZXZva2VkLgoKIyBSZXR1cm5zCgpSZXR1cm5zIGEgYFJlc3VsdGAgY29udGFpbmluZyB0aGUgMzItYnl0ZSBVSUQgb2YgdGhlIG5ld2x5IHJlZ2lzdGVyZWQgc2NoZW1hLApvciBhbiBlcnJvciBpZiB0aGUgcmVnaXN0cmF0aW9uIGZhaWxzLgAAAAAAAAhyZWdpc3RlcgAAAAQAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAARc2NoZW1hX2RlZmluaXRpb24AAAAAAAAQAAAAAAAAAAhyZXNvbHZlcgAAA+gAAAATAAAAAAAAAAlyZXZvY2FibGUAAAAAAAABAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAAP1SZXRyaWV2ZXMgYSByZWdpc3RlcmVkIHNjaGVtYSBieSBpdHMgVUlELgoKIyBBcmd1bWVudHMKCiogYHNjaGVtYV91aWRgIC0gVGhlIDMyLWJ5dGUgdW5pcXVlIGlkZW50aWZpZXIgb2YgdGhlIHNjaGVtYSB0byByZXRyaWV2ZS4KCiMgUmV0dXJucwoKUmV0dXJucyBhIGBSZXN1bHRgIGNvbnRhaW5pbmcgdGhlIGBTY2hlbWFgIHN0cnVjdCBpZiBmb3VuZCwgb3IgYW4gZXJyb3IKaWYgbm8gc2NoZW1hIHdpdGggdGhlIGdpdmVuIFVJRCBleGlzdHMuAAAAAAAACmdldF9zY2hlbWEAAAAAAAEAAAAAAAAACnNjaGVtYV91aWQAAAAAA+4AAAAgAAAAAQAAA+kAAAfQAAAABlNjaGVtYQAAAAAAAw==",
        "AAAAAAAAAVhJbml0aWFsaXplcyB0aGUgY29udHJhY3Qgd2l0aCBhbiBhZG1pbmlzdHJhdGl2ZSBhZGRyZXNzLgoKVGhpcyBmdW5jdGlvbiBjYW4gb25seSBiZSBjYWxsZWQgb25jZS4gU3Vic2VxdWVudCBjYWxscyB3aWxsIHJlc3VsdCBpbiBhbgpgQWxyZWFkeUluaXRpYWxpemVkYCBlcnJvci4KCiMgQXJndW1lbnRzCgoqIGBhZG1pbmAgLSBUaGUgYWRkcmVzcyB0byBiZSBzZXQgYXMgdGhlIGNvbnRyYWN0IGFkbWluaXN0cmF0b3IuCgojIEVycm9ycwoKUmV0dXJucyBgRXJyKGVycm9yczo6RXJyb3I6OkFscmVhZHlJbml0aWFsaXplZClgIGlmIHRoZSBjb250cmFjdCBoYXMgYWxyZWFkeSBiZWVuIGluaXRpYWxpemVkLgAAAAppbml0aWFsaXplAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAOVHZXRzIHRoZSBCTFMgcHVibGljIGtleSBmb3IgYW4gYXR0ZXN0ZXIuCgojIEFyZ3VtZW50cwoKKiBgYXR0ZXN0ZXJgIC0gVGhlIGFkZHJlc3Mgb2YgdGhlIGF0dGVzdGVyLgoKIyBSZXR1cm5zCgpSZXR1cm5zIGEgYFJlc3VsdGAgY29udGFpbmluZyB0aGUgYEJsc1B1YmxpY0tleWAgaWYgZm91bmQsIG9yIGFuIGVycm9yIGlmIG5vIGtleQppcyByZWdpc3RlcmVkIGZvciB0aGUgZ2l2ZW4gYXR0ZXN0ZXIuAAAAAAAAC2dldF9ibHNfa2V5AAAAAAEAAAAAAAAACGF0dGVzdGVyAAAAEwAAAAEAAAPpAAAH0AAAAAxCbHNQdWJsaWNLZXkAAAAD",
        "AAAAAAAAAQxSZXRyaWV2ZXMgYW4gYXR0ZXN0YXRpb24gYnkgaXRzIFVJRC4KCiMgQXJndW1lbnRzCgoqIGBhdHRlc3RhdGlvbl91aWRgIC0gVGhlIDMyLWJ5dGUgdW5pcXVlIGlkZW50aWZpZXIgb2YgdGhlIGF0dGVzdGF0aW9uIHRvIHJldHJpZXZlLgoKIyBSZXR1cm5zCgpSZXR1cm5zIGEgYFJlc3VsdGAgY29udGFpbmluZyB0aGUgYEF0dGVzdGF0aW9uYCBzdHJ1Y3QgaWYgZm91bmQsIG9yIGFuIGVycm9yCmlmIG5vIGF0dGVzdGF0aW9uIHdpdGggdGhlIGdpdmVuIFVJRCBleGlzdHMuAAAAD2dldF9hdHRlc3RhdGlvbgAAAAABAAAAAAAAAA9hdHRlc3RhdGlvbl91aWQAAAAD7gAAACAAAAABAAAD6QAAB9AAAAALQXR0ZXN0YXRpb24AAAAAAw==",
        "AAAAAAAAAflSZWdpc3RlcnMgYSBCTFMgcHVibGljIGtleSBmb3IgYW4gYXR0ZXN0ZXIuCgpUaGlzIHB1YmxpYyBrZXkgY2FuIGJlIHVzZWQgdG8gdmVyaWZ5IGRlbGVnYXRlZCBhdHRlc3RhdGlvbnMgYW5kIHJldm9jYXRpb25zLAplbmFibGluZyBtb3JlIGFkdmFuY2VkIGNyeXB0b2dyYXBoaWMgb3BlcmF0aW9ucy4gVGhlIGF0dGVzdGVyIG11c3QgYXV0aG9yaXplIHRoaXMgcmVnaXN0cmF0aW9uLgoKIyBBcmd1bWVudHMKCiogYGF0dGVzdGVyYCAtIFRoZSBhZGRyZXNzIG9mIHRoZSBhdHRlc3RlciBmb3Igd2hvbSB0aGUgQkxTIGtleSBpcyBiZWluZyByZWdpc3RlcmVkLiBNdXN0IGF1dGhvcml6ZSB0cmFuc2FjdGlvbi4KKiBgcHVibGljX2tleWAgLSBUaGUgMTkyLWJ5dGUgQkxTIHB1YmxpYyBrZXkuCgojIFJldHVybnMKClJldHVybnMgYE9rKCgpKWAgb24gc3VjY2Vzc2Z1bCByZWdpc3RyYXRpb24sIG9yIGFuIGVycm9yIGlmIG9uZSBhbHJlYWR5IGV4aXN0cyBvciByZWdpc3RyYXRpb24gZmFpbHMuAAAAAAAAEHJlZ2lzdGVyX2Jsc19rZXkAAAACAAAAAAAAAAhhdHRlc3RlcgAAABMAAAAAAAAACnB1YmxpY19rZXkAAAAAA+4AAADAAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAATpHZXRzIHRoZSBuZXh0IG5vbmNlIGZvciBhbiBhdHRlc3Rlci4KCk5vbmNlcyBhcmUgdXNlZCBpbiBkZWxlZ2F0ZWQgcmVxdWVzdHMgdG8gcHJldmVudCByZXBsYXkgYXR0YWNrcy4gRWFjaCBkZWxlZ2F0ZWQKcmVxdWVzdCBmcm9tIGFuIGF0dGVzdGVyIG11c3QgaGF2ZSBhIHVuaXF1ZSwgc2VxdWVudGlhbCBub25jZS4KCiMgQXJndW1lbnRzCgoqIGBhdHRlc3RlcmAgLSBUaGUgYWRkcmVzcyBvZiB0aGUgYXR0ZXN0ZXIuCgojIFJldHVybnMKClJldHVybnMgdGhlIG5leHQgZXhwZWN0ZWQgbm9uY2UgKGB1NjRgKSBmb3IgdGhlIGdpdmVuIGF0dGVzdGVyLgAAAAAAEmdldF9hdHRlc3Rlcl9ub25jZQAAAAAAAQAAAAAAAAAIYXR0ZXN0ZXIAAAATAAAAAQAAAAY=",
        "AAAAAAAAAtdDcmVhdGVzIGFuIGF0dGVzdGF0aW9uIHVzaW5nIGEgZGVsZWdhdGVkIHNpZ25hdHVyZS4KClRoaXMgbWV0aG9kIGFsbG93cyBmb3IgZ2FzLWxlc3MgYXR0ZXN0YXRpb25zIHdoZXJlIGEgYHN1Ym1pdHRlcmAgY2FuIHBvc3QgYW4KYXR0ZXN0YXRpb24gb24gYmVoYWxmIG9mIGFuIGBhdHRlc3RlcmAuIFRoZSBgYXR0ZXN0ZXJgJ3MgYXV0aG9yaXphdGlvbiBpcwp2ZXJpZmllZCB0aHJvdWdoIGEgc2lnbmVkIGBEZWxlZ2F0ZWRBdHRlc3RhdGlvblJlcXVlc3RgLiBUaGUgYXR0ZXN0YXRpb24gVUlECmNhbiBiZSBkZXJpdmVkIG9mZi1jaGFpbiBmcm9tIHRoZSByZXF1ZXN0IHBhcmFtZXRlcnMuCgpBbnlvbmUgY2FuIHN1Ym1pdCB0aGlzIHRyYW5zYWN0aW9uLCBwYXlpbmcgdGhlIGZlZXMuCgojIEFyZ3VtZW50cwoKKiBgc3VibWl0dGVyYCAtIFRoZSBhZGRyZXNzIHN1Ym1pdHRpbmcgdGhlIHRyYW5zYWN0aW9uLCB3aGljaCBtdXN0IGF1dGhvcml6ZSB0aGUgaW52b2NhdGlvbi4KKiBgcmVxdWVzdGAgLSBUaGUgYERlbGVnYXRlZEF0dGVzdGF0aW9uUmVxdWVzdGAgc3RydWN0IGNvbnRhaW5pbmcgdGhlIGF0dGVzdGF0aW9uIGRldGFpbHMgYW5kIHRoZSBhdHRlc3RlcidzIHNpZ25hdHVyZS4KCiMgUmV0dXJucwoKUmV0dXJucyBgT2soKCkpYCBvbiBzdWNjZXNzLCBvciBhbiBlcnJvciBpZiB0aGUgcmVxdWVzdCBpcyBpbnZhbGlkIG9yIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24gZmFpbHMuAAAAABRhdHRlc3RfYnlfZGVsZWdhdGlvbgAAAAIAAAAAAAAACXN1Ym1pdHRlcgAAAAAAABMAAAAAAAAAB3JlcXVlc3QAAAAH0AAAABtEZWxlZ2F0ZWRBdHRlc3RhdGlvblJlcXVlc3QAAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAk1SZXZva2VzIGFuIGF0dGVzdGF0aW9uIHVzaW5nIGEgZGVsZWdhdGVkIHNpZ25hdHVyZS4KClRoaXMgbWV0aG9kIGFsbG93cyBmb3IgZ2FzLWxlc3MgcmV2b2NhdGlvbnMgd2hlcmUgYSBgc3VibWl0dGVyYCBjYW4gcG9zdCBhCnJldm9jYXRpb24gb24gYmVoYWxmIG9mIGEgYHJldm9rZXJgLiBUaGUgYHJldm9rZXJgJ3MgYXV0aG9yaXphdGlvbiBpcwp2ZXJpZmllZCB0aHJvdWdoIGEgc2lnbmVkIGBEZWxlZ2F0ZWRSZXZvY2F0aW9uUmVxdWVzdGAuCgojIEFyZ3VtZW50cwoKKiBgc3VibWl0dGVyYCAtIFRoZSBhZGRyZXNzIHN1Ym1pdHRpbmcgdGhlIHRyYW5zYWN0aW9uLCB3aGljaCBtdXN0IGF1dGhvcml6ZSB0aGUgaW52b2NhdGlvbi4KKiBgcmVxdWVzdGAgLSBUaGUgYERlbGVnYXRlZFJldm9jYXRpb25SZXF1ZXN0YCBzdHJ1Y3QgY29udGFpbmluZyB0aGUgcmV2b2NhdGlvbiBkZXRhaWxzIGFuZCB0aGUgcmV2b2tlcidzIHNpZ25hdHVyZS4KCiMgUmV0dXJucwoKUmV0dXJucyBgT2soKCkpYCBvbiBzdWNjZXNzLCBvciBhbiBlcnJvciBpZiB0aGUgcmVxdWVzdCBpcyBpbnZhbGlkIG9yIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24gZmFpbHMuAAAAAAAAFHJldm9rZV9ieV9kZWxlZ2F0aW9uAAAAAgAAAAAAAAAJc3VibWl0dGVyAAAAAAAAEwAAAAAAAAAHcmVxdWVzdAAAAAfQAAAAGkRlbGVnYXRlZFJldm9jYXRpb25SZXF1ZXN0AAAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAUlHZXRzIHRoZSBkb21haW4gc2VwYXJhdGlvbiB0YWcgKERTVCkgZm9yIGRlbGVnYXRlZCByZXZvY2F0aW9ucy4KClRoZSBEU1QgaXMgYSB1bmlxdWUgYnl0ZSBzdHJpbmcgdXNlZCB0byBlbnN1cmUgdGhhdCBzaWduYXR1cmVzIGNyZWF0ZWQgZm9yIG9uZQpwdXJwb3NlIGNhbm5vdCBiZSByZXB1cnBvc2VkIGZvciBhbm90aGVyLiBUaGlzIGlzIGNydWNpYWwgZm9yIHRoZSBzZWN1cml0eSBvZgpkZWxlZ2F0ZWQgb3BlcmF0aW9ucy4KCiMgUmV0dXJucwoKUmV0dXJucyB0aGUgYEJ5dGVzYCBzbGljZSByZXByZXNlbnRpbmcgdGhlIERTVCBmb3IgZGVsZWdhdGVkIHJldm9jYXRpb25zLgAAAAAAABZnZXRfZHN0X2Zvcl9yZXZvY2F0aW9uAAAAAAAAAAAAAQAAAA4=",
        "AAAAAAAAAUtHZXRzIHRoZSBkb21haW4gc2VwYXJhdGlvbiB0YWcgKERTVCkgZm9yIGRlbGVnYXRlZCBhdHRlc3RhdGlvbnMuCgpUaGUgRFNUIGlzIGEgdW5pcXVlIGJ5dGUgc3RyaW5nIHVzZWQgdG8gZW5zdXJlIHRoYXQgc2lnbmF0dXJlcyBjcmVhdGVkIGZvciBvbmUKcHVycG9zZSBjYW5ub3QgYmUgcmVwdXJwb3NlZCBmb3IgYW5vdGhlci4gVGhpcyBpcyBjcnVjaWFsIGZvciB0aGUgc2VjdXJpdHkgb2YKZGVsZWdhdGVkIG9wZXJhdGlvbnMuCgojIFJldHVybnMKClJldHVybnMgdGhlIGBCeXRlc2Agc2xpY2UgcmVwcmVzZW50aW5nIHRoZSBEU1QgZm9yIGRlbGVnYXRlZCBhdHRlc3RhdGlvbnMuAAAAABdnZXRfZHN0X2Zvcl9hdHRlc3RhdGlvbgAAAAAAAAAAAQAAAA4=",
        "AAAAAQAAAzfilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcK4pWRICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgU2NoZW1hICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRCuKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVnQoKUmVwcmVzZW50cyBhIHNjaGVtYSBkZWZpbml0aW9uIHRoYXQgYXR0ZXN0YXRpb25zIGNhbiBmb2xsb3cuCgpTY2hlbWFzIGRlZmluZSB0aGUgc3RydWN0dXJlIGFuZCB2YWxpZGF0aW9uIHJ1bGVzIGZvciBhdHRlc3RhdGlvbnMuClRoZSBkZWZpbml0aW9uIGZpZWxkIHN1cHBvcnRzIG11bHRpcGxlIGZvcm1hdHM6Ci0gWERSLWVuY29kZWQ6IFN0ZWxsYXItbmF0aXZlIGJpbmFyeSBmb3JtYXQgZm9yIHN0cnVjdHVyZWQgZGF0YQotIEpTT046IEh1bWFuLXJlYWRhYmxlIHN0cnVjdHVyZWQgZm9ybWF0AAAAAAAAAAAGU2NoZW1hAAAAAAAEAAAANVRoZSBhZGRyZXNzIG9mIHRoZSBhdXRob3JpdHkgdGhhdCBjcmVhdGVkIHRoaXMgc2NoZW1hAAAAAAAACWF1dGhvcml0eQAAAAAAABMAAABbVGhlIHNjaGVtYSBkZWZpbml0aW9uIGluIGFueSBzdXBwb3J0ZWQgZm9ybWF0CgpTdXBwb3J0cyBYRFItZW5jb2RlZCBzdHJ1Y3R1cmVkIGRhdGEgb3IgSlNPTgAAAAAKZGVmaW5pdGlvbgAAAAAAEAAAAINPcHRpb25hbCBhZGRyZXNzIG9mIGEgcmVzb2x2ZXIgY29udHJhY3QgZm9yIHRoaXMgc2NoZW1hCgpJZiBwcmVzZW50LCB0aGlzIGNvbnRyYWN0IHdpbGwgYmUgY2FsbGVkIHRvIGhhbmRsZSBhdHRlc3RhdGlvbiBvcGVyYXRpb25zLgAAAAAIcmVzb2x2ZXIAAAPoAAAAEwAAADVXaGV0aGVyIGF0dGVzdGF0aW9ucyB1c2luZyB0aGlzIHNjaGVtYSBjYW4gYmUgcmV2b2tlZAAAAAAAAAlyZXZvY2FibGUAAAAAAAAB",
        "AAAAAgAAAsbilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcK4pWRICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRGF0YUtleSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRCuKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVnQoKUmVwcmVzZW50cyB0aGUga2V5cyB1c2VkIGZvciBkYXRhIHN0b3JhZ2UgaW4gdGhlIGNvbnRyYWN0LgoKRWFjaCB2YXJpYW50IGNvcnJlc3BvbmRzIHRvIGEgZGlmZmVyZW50IHR5cGUgb2YgZGF0YSB0aGF0IGNhbiBiZSBzdG9yZWQKaW4gdGhlIGNvbnRyYWN0J3MgcGVyc2lzdGVudCBzdG9yYWdlLgAAAAAAAAAAAAdEYXRhS2V5AAAAAAYAAAAAAAAAKktleSBmb3Igc3RvcmluZyB0aGUgY29udHJhY3QgYWRtaW4gYWRkcmVzcwAAAAAABUFkbWluAAAAAAAAAQAAAElLZXkgZm9yIHN0b3JpbmcgYXV0aG9yaXR5IGluZm9ybWF0aW9uLCBpbmRleGVkIGJ5IHRoZSBhdXRob3JpdHkncyBhZGRyZXNzAAAAAAAACUF1dGhvcml0eQAAAAAAAAEAAAATAAAAAQAAAFhLZXkgZm9yIHN0b3Jpbmcgc3RydWN0dXJlZCBzY2hlbWEgaW5mb3JtYXRpb24sIGluZGV4ZWQgYnkgdGhlIHNjaGVtYSdzIHVuaXF1ZSBpZGVudGlmaWVyAAAABlNjaGVtYQAAAAAAAQAAA+4AAAAgAAAAAQAAAE5LZXkgZm9yIHN0b3JpbmcgYXR0ZXN0YXRpb24gZGF0YQoKSW5kZXhlZCBieSBhdHRlc3RhdGlvbiBVSUQgZm9yIGRpcmVjdCBsb29rdXAAAAAAAA5BdHRlc3RhdGlvblVJRAAAAAAAAQAAA+4AAAAgAAAAAQAAAGtLZXkgZm9yIHN0b3JpbmcgdGhlIGN1cnJlbnQgbm9uY2UgZm9yIGFuIGF0dGVzdGVyCgpVc2VkIHRvIHByZXZlbnQgcmVwbGF5IGF0dGFja3MgaW4gZGVsZWdhdGVkIGF0dGVzdGF0aW9ucwAAAAANQXR0ZXN0ZXJOb25jZQAAAAAAAAEAAAATAAAAAQAAAGhLZXkgZm9yIHN0b3JpbmcgdGhlIEJMUyBwdWJsaWMga2V5IGZvciBhbiBhdHRlc3RlcgoKT25lLXRvLW9uZSBtYXBwaW5nOiB3YWxsZXQgYWRkcmVzcyAtPiBCTFMgcHVibGljIGtleQAAABFBdHRlc3RlclB1YmxpY0tleQAAAAAAAAEAAAAT",
        "AAAAAQAAAtvilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcK4pWRICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEF1dGhvcml0eSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRCuKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVnQoKUmVwcmVzZW50cyBhbiBhdXRob3JpdHkgdGhhdCBjYW4gY3JlYXRlIHNjaGVtYXMgYW5kIGF0dGVzdGF0aW9ucy4KCkF1dGhvcml0aWVzIGFyZSByZWdpc3RlcmVkIGVudGl0aWVzIHdpdGggc3BlY2lmaWMgcGVybWlzc2lvbnMgaW4gdGhlIHN5c3RlbQp0aGF0IGNhbiBjcmVhdGUgc2NoZW1hcyBhbmQgaXNzdWUgYXR0ZXN0YXRpb25zLgAAAAAAAAAACUF1dGhvcml0eQAAAAAAAAIAAAAkVGhlIFN0ZWxsYXIgYWRkcmVzcyBvZiB0aGUgYXV0aG9yaXR5AAAAB2FkZHJlc3MAAAAAEwAAAGhNZXRhZGF0YSBkZXNjcmliaW5nIHRoZSBhdXRob3JpdHkKClR5cGljYWxseSBpbiBKU09OIGZvcm1hdCwgY29udGFpbmluZyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgYXV0aG9yaXR5LgAAAAhtZXRhZGF0YQAAABA=",
        "AAAAAQAAAtzilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcK4pWRICAgICAgICAgICAgICAgICAgICAgICAgICAgIEF0dGVzdGF0aW9uICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRCuKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVnQoKUmVwcmVzZW50cyBhbiBhdHRlc3RhdGlvbiB3aXRoIHN1cHBvcnQgZm9yIGJvdGggZGlyZWN0IGFuZCBkZWxlZ2F0ZWQgYXR0ZXN0YXRpb25zLgoKVXNlZCBmb3IgdHJhY2tpbmcgYXR0ZXN0YXRpb25zIGFuZCBzdXBwb3J0aW5nIG11bHRpcGxlIGF0dGVzdGF0aW9ucyBwZXIgc2NoZW1hL3N1YmplY3QKcGFpciB0aHJvdWdoIG5vbmNlcy4AAAAAAAAAC0F0dGVzdGF0aW9uAAAAAAoAAACcVGhlIGFkZHJlc3Mgb2YgdGhlIGVudGl0eSB0aGF0IGNyZWF0ZWQgdGhpcyBhdHRlc3RhdGlvbgoKSW4gZGlyZWN0IGF0dGVzdGF0aW9ucywgdGhpcyBpcyB0aGUgY2FsbGVyLgpJbiBkZWxlZ2F0ZWQgYXR0ZXN0YXRpb25zLCB0aGlzIGlzIHRoZSBvcmlnaW5hbCBzaWduZXIuAAAACGF0dGVzdGVyAAAAEwAAAF1PcHRpb25hbCBleHBpcmF0aW9uIHRpbWVzdGFtcAoKSWYgc2V0LCB0aGUgYXR0ZXN0YXRpb24gaXMgY29uc2lkZXJlZCBpbnZhbGlkIGFmdGVyIHRoaXMgdGltZS4AAAAAAAAPZXhwaXJhdGlvbl90aW1lAAAAA+gAAAAGAAAAo1VuaXF1ZSBub25jZSBmb3IgdGhpcyBhdHRlc3RhdGlvbgoKQWxsb3dzIGZvciBtdWx0aXBsZSBhdHRlc3RhdGlvbnMgb2YgdGhlIHNhbWUgc2NoZW1hIGZvciB0aGUgc2FtZSBzdWJqZWN0LAphbmQgcHJldmVudHMgcmVwbGF5IGF0dGFja3MgaW4gZGVsZWdhdGVkIGF0dGVzdGF0aW9ucy4AAAAABW5vbmNlAAAAAAAABgAAADNPcHRpb25hbCB0aW1lc3RhbXAgd2hlbiB0aGUgYXR0ZXN0YXRpb24gd2FzIHJldm9rZWQAAAAAD3Jldm9jYXRpb25fdGltZQAAAAPoAAAABgAAAClXaGV0aGVyIHRoaXMgYXR0ZXN0YXRpb24gaGFzIGJlZW4gcmV2b2tlZAAAAAAAAAdyZXZva2VkAAAAAAEAAAA8VGhlIHVuaXF1ZSBpZGVudGlmaWVyIG9mIHRoZSBzY2hlbWEgdGhpcyBhdHRlc3RhdGlvbiBmb2xsb3dzAAAACnNjaGVtYV91aWQAAAAAA+4AAAAgAAAAQVRoZSBhZGRyZXNzIG9mIHRoZSBlbnRpdHkgdGhhdCBpcyB0aGUgc3ViamVjdCBvZiB0aGlzIGF0dGVzdGF0aW9uAAAAAAAAB3N1YmplY3QAAAAAEwAAACpUaW1lc3RhbXAgd2hlbiB0aGUgYXR0ZXN0YXRpb24gd2FzIGNyZWF0ZWQAAAAAAAl0aW1lc3RhbXAAAAAAAAAGAAAAKFRoZSB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgYXR0ZXN0YXRpb24AAAADdWlkAAAAA+4AAAAgAAAAJ1RoZSB2YWx1ZSBvciBjb250ZW50IG9mIHRoZSBhdHRlc3RhdGlvbgAAAAAFdmFsdWUAAAAAAAAQ",
        "AAAAAQAAAqTilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcK4pWRICAgICAgICAgICAgICAgICAgICAgICAgICAgIEJMUyBQdWJsaWMgS2V5ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRCuKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVnQoKUmVwcmVzZW50cyBhIEJMUzEyLTM4MSBwdWJsaWMga2V5IGZvciBhbiBhdHRlc3Rlci4KCkVhY2ggd2FsbGV0IGFkZHJlc3MgY2FuIGhhdmUgZXhhY3RseSBvbmUgQkxTIHB1YmxpYyBrZXkuIE5vIHVwZGF0ZXMgb3IgcmV2b2NhdGlvbnMuAAAAAAAAAAxCbHNQdWJsaWNLZXkAAAACAAAAMlRoZSBCTFMxMi0zODEgRzIgcHVibGljIGtleSAoMTkyIGJ5dGVzIGNvbXByZXNzZWQpAAAAAAADa2V5AAAAA+4AAADAAAAAJlRpbWVzdGFtcCB3aGVuIHRoaXMga2V5IHdhcyByZWdpc3RlcmVkAAAAAAANcmVnaXN0ZXJlZF9hdAAAAAAAAAY=",
        "AAAAAQAAArfilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcK4pWRICAgICAgICAgICAgICAgICAgICAgIERlbGVnYXRlZFJldm9jYXRpb25SZXF1ZXN0ICAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRCuKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVnQoKUmVwcmVzZW50cyBhIHJlcXVlc3QgZm9yIGRlbGVnYXRlZCByZXZvY2F0aW9uLgoKVGhpcyBhbGxvd3MgYW4gYXR0ZXN0ZXIgdG8gc2lnbiBhIHJldm9jYXRpb24gb2ZmLWNoYWluLCB3aGljaCBjYW4gdGhlbiBiZQpzdWJtaXR0ZWQgb24tY2hhaW4gYnkgYW55IHBhcnR5LgAAAAAAAAAAGkRlbGVnYXRlZFJldm9jYXRpb25SZXF1ZXN0AAAAAAAHAAAAMlRoZSB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgYXR0ZXN0YXRpb24gdG8gcmV2b2tlAAAAAAAPYXR0ZXN0YXRpb25fdWlkAAAAA+4AAAAgAAAALEV4cGlyYXRpb24gdGltZXN0YW1wIGZvciB0aGlzIHNpZ25lZCByZXF1ZXN0AAAACGRlYWRsaW5lAAAABgAAACZUaGUgbm9uY2Ugb2YgdGhlIGF0dGVzdGF0aW9uIHRvIHJldm9rZQAAAAAABW5vbmNlAAAAAAAABgAAADtUaGUgYWRkcmVzcyBvZiB0aGUgb3JpZ2luYWwgYXR0ZXN0ZXIgKHdobyBzaWduZWQgb2ZmLWNoYWluKQAAAAAHcmV2b2tlcgAAAAATAAAAI1RoZSB1bmlxdWUgaWRlbnRpZmllciBvZiB0aGUgc2NoZW1hAAAAAApzY2hlbWFfdWlkAAAAAAPuAAAAIAAAADVCTFMxMi0zODEgRzEgc2lnbmF0dXJlIG9mIHRoZSByZXF1ZXN0IGRhdGEgKDk2IGJ5dGVzKQAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAYAAAAEpUaGUgYWRkcmVzcyBvZiB0aGUgZW50aXR5IHRoYXQgaXMgdGhlIHN1YmplY3Qgb2YgdGhlIGF0dGVzdGF0aW9uIHRvIHJldm9rZQAAAAAAB3N1YmplY3QAAAAAEw==",
        "AAAAAQAAAt/ilZTilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZcK4pWRICAgICAgICAgICAgICAgICAgICAgIERlbGVnYXRlZEF0dGVzdGF0aW9uUmVxdWVzdCAgICAgICAgICAgICAgICAgICAgICAgICAg4pWRCuKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVnQoKUmVwcmVzZW50cyBhIHJlcXVlc3QgZm9yIGRlbGVnYXRlZCBhdHRlc3RhdGlvbnMuCgpUaGlzIGFsbG93cyBhbiBhdHRlc3RlciB0byBzaWduIGFuIGF0dGVzdGF0aW9uIG9mZi1jaGFpbiwgd2hpY2ggY2FuIHRoZW4gYmUKc3VibWl0dGVkIG9uLWNoYWluIGJ5IGFueSBwYXJ0eSAod2hvIHdpbGwgcGF5IHRoZSB0cmFuc2FjdGlvbiBmZWVzKS4AAAAAAAAAABtEZWxlZ2F0ZWRBdHRlc3RhdGlvblJlcXVlc3QAAAAACAAAADtUaGUgYWRkcmVzcyBvZiB0aGUgb3JpZ2luYWwgYXR0ZXN0ZXIgKHdobyBzaWduZWQgb2ZmLWNoYWluKQAAAAAIYXR0ZXN0ZXIAAAATAAAAeEV4cGlyYXRpb24gdGltZXN0YW1wIGZvciB0aGlzIHNpZ25lZCByZXF1ZXN0CgpBZnRlciB0aGlzIHRpbWUsIHRoZSBzaWduYXR1cmUgaXMgbm8gbG9uZ2VyIHZhbGlkIGFuZCBjYW5ub3QgYmUgc3VibWl0dGVkLgAAAAhkZWFkbGluZQAAAAYAAAAzT3B0aW9uYWwgZXhwaXJhdGlvbiB0aW1lIGZvciB0aGUgYXR0ZXN0YXRpb24gaXRzZWxmAAAAAA9leHBpcmF0aW9uX3RpbWUAAAAD6AAAAAYAAABRVGhlIG5vbmNlIGZvciB0aGlzIGF0dGVzdGF0aW9uIChtdXN0IGJlIHRoZSBuZXh0IGV4cGVjdGVkIG5vbmNlIGZvciB0aGUgYXR0ZXN0ZXIpAAAAAAAABW5vbmNlAAAAAAAABgAAADxUaGUgdW5pcXVlIGlkZW50aWZpZXIgb2YgdGhlIHNjaGVtYSB0aGlzIGF0dGVzdGF0aW9uIGZvbGxvd3MAAAAKc2NoZW1hX3VpZAAAAAAD7gAAACAAAAA1QkxTMTItMzgxIEcxIHNpZ25hdHVyZSBvZiB0aGUgcmVxdWVzdCBkYXRhICg5NiBieXRlcykAAAAAAAAJc2lnbmF0dXJlAAAAAAAD7gAAAGAAAABBVGhlIGFkZHJlc3Mgb2YgdGhlIGVudGl0eSB0aGF0IGlzIHRoZSBzdWJqZWN0IG9mIHRoaXMgYXR0ZXN0YXRpb24AAAAAAAAHc3ViamVjdAAAAAATAAAAJ1RoZSB2YWx1ZSBvciBjb250ZW50IG9mIHRoZSBhdHRlc3RhdGlvbgAAAAAFdmFsdWUAAAAAAAAQ",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAGgAAAAAAAAAOVHJhbnNmZXJGYWlsZWQAAAAAAAEAAAAAAAAAFkF1dGhvcml0eU5vdFJlZ2lzdGVyZWQAAAAAAAIAAAAAAAAADlNjaGVtYU5vdEZvdW5kAAAAAAADAAAAAAAAABFBdHRlc3RhdGlvbkV4aXN0cwAAAAAAAAQAAAAAAAAAE0F0dGVzdGF0aW9uTm90Rm91bmQAAAAABQAAAAAAAAANTm90QXV0aG9yaXplZAAAAAAAAAYAAAAAAAAADVN0b3JhZ2VGYWlsZWQAAAAAAAAHAAAAAAAAAApJbnZhbGlkVWlkAAAAAAAJAAAAAAAAAA1SZXNvbHZlckVycm9yAAAAAAAACgAAAAAAAAATU2NoZW1hSGFzTm9SZXNvbHZlcgAAAAALAAAAAAAAAAtBZG1pbk5vdFNldAAAAAAMAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAA0AAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAAOAAAAAAAAABdBdHRlc3RhdGlvbk5vdFJldm9jYWJsZQAAAAAPAAAAAAAAABdJbnZhbGlkU2NoZW1hRGVmaW5pdGlvbgAAAAAQAAAAAAAAABdJbnZhbGlkQXR0ZXN0YXRpb25WYWx1ZQAAAAARAAAAAAAAABBJbnZhbGlkUmVmZXJlbmNlAAAAEgAAAAAAAAAMSW52YWxpZE5vbmNlAAAAEwAAAAAAAAAQRXhwaXJlZFNpZ25hdHVyZQAAABQAAAAAAAAAEEludmFsaWRTaWduYXR1cmUAAAAVAAAAAAAAABJBdHRlc3RhdGlvbkV4cGlyZWQAAAAAABYAAAAAAAAAD0ludmFsaWREZWFkbGluZQAAAAAXAAAAAAAAABJSZXNvbHZlckNhbGxGYWlsZWQAAAAAABgAAAAAAAAAFUludmFsaWRTaWduYXR1cmVQb2ludAAAAAAAABkAAAAAAAAAFkJsc1B1YktleU5vdFJlZ2lzdGVyZWQAAAAAABoAAAAAAAAAD0ludGVnZXJPdmVyZmxvdwAAAAAb" ]),
      options
    )
  }
  public readonly fromJSON = {
    attest: this.txFromJSON<Result<Buffer>>,
        revoke: this.txFromJSON<Result<void>>,
        register: this.txFromJSON<Result<Buffer>>,
        get_schema: this.txFromJSON<Result<Schema>>,
        initialize: this.txFromJSON<Result<void>>,
        get_bls_key: this.txFromJSON<Result<BlsPublicKey>>,
        get_attestation: this.txFromJSON<Result<Attestation>>,
        register_bls_key: this.txFromJSON<Result<void>>,
        get_attester_nonce: this.txFromJSON<u64>,
        attest_by_delegation: this.txFromJSON<Result<void>>,
        revoke_by_delegation: this.txFromJSON<Result<void>>,
        get_dst_for_revocation: this.txFromJSON<Buffer>,
        get_dst_for_attestation: this.txFromJSON<Buffer>
  }
}