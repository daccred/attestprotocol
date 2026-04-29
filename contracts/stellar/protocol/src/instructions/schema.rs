use crate::errors::Error;
use crate::events;
use crate::state::{DataKey, Schema};
use crate::utils;
use soroban_sdk::{Address, BytesN, Env, String};

////////////////////////////////////////////////////////////////////////////////////
/// Retrieves a schema record by its unique identifier (UID).
////////////////////////////////////////////////////////////////////////////////////
/// # Arguments
/// * `env` - The Soroban environment.
/// * `schema_uid` - The 32-byte unique identifier of the schema to retrieve.
///
/// # Returns
/// * `Result<Schema, Error>` - The `Schema` record if found, otherwise an error.
///
/// # Errors
/// * `Error::SchemaNotFound` - If no schema with the given UID exists in storage.
pub fn get_schema_or_fail(env: &Env, schema_uid: &BytesN<32>) -> Result<Schema, Error> {
    let schema_key = DataKey::Schema(schema_uid.clone());
    env.storage()
        .instance()
        .get::<DataKey, Schema>(&schema_key)
        .ok_or(Error::SchemaNotFound)
}

////////////////////////////////////////////////////////////////////////////////////
/// Registers a new schema definition in the contract.
////////////////////////////////////////////////////////////////////////////////////
///
///
/// This function allows an entity to register a new schema for attestations. The schema defines
/// the structure and format of data that can be attested to. Each schema is uniquely identified
/// by a UID generated from the schema definition, the registering authority, and the optional
/// resolver address.
///
/// # Authorization
/// Requires authorization from the caller, who becomes the authority for this schema.
///
/// # Arguments
/// * `env` - The Soroban environment providing access to blockchain services.
/// * `caller` - The address registering the schema and becoming its authority.
/// * `schema_definition` - The string representation of the schema definition, typically in JSON format
///                        defining the fields and their types.
/// * `resolver` - An optional address of a resolver contract that can provide additional
///               validation or resolution services for attestations using this schema.
/// * `revocable` - A boolean flag indicating whether attestations made against this schema
///                can be revoked later by the authority.
///
/// # Returns
/// * `Result<BytesN<32>, Error>` - The unique 32-byte identifier (UID) of the newly registered schema,
///                               or an error if the registration fails.
///
/// # Example
/// ```ignore
/// let schema_definition = String::from_str(&env,
///     r#"{
///         "name": "Degree",
///         "version": "1.0",
///         "description": "University degree attestation",
///         "fields": [
///             {"name": "degree", "type": "string"},
///             {"name": "field", "type": "string"},
///             {"name": "graduation_date", "type": "string"}
///         ]
///     }"#);
///
/// let schema_uid = register_schema(
///     &env,
///     university_address,
///     schema_definition,
///     None,
///     true
/// )?;
/// ```
pub fn register_schema(
    env: &Env,
    caller: Address,
    schema_definition: String,
    resolver: Option<Address>,
    revocable: bool,
) -> Result<BytesN<32>, Error> {
    // Require authorization from the caller
    caller.require_auth();

    // Generate schema UID. The `revocable` flag is part of the UID input
    // (C-CONTRACT-3), so registering otherwise-identical schemas with different
    // revocability yields different UIDs and is allowed.
    let schema_uid = utils::generate_schema_uid(env, &schema_definition, &caller, &resolver, revocable);

    // Check if schema already exists (collision detection)
    // This prevents accidental overwrites and detects when an identical schema
    // (same definition, authority, and resolver) has already been registered.
    let schema_key = DataKey::Schema(schema_uid.clone());
    if env.storage().instance().has(&schema_key) {
        return Err(Error::SchemaAlreadyExists);
    }

    // Store schema
    let schema = Schema {
        authority: caller.clone(),
        definition: schema_definition.clone(),
        resolver,
        revocable,
    };
    env.storage().instance().set(&schema_key, &schema);

    // Publish schema registration event
    events::schema_registered(env, &schema_uid, &schema, &caller);

    Ok(schema_uid)
}
