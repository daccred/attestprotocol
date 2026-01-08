use crate::errors::Error;
use crate::events;
use crate::state::{DataKey, Schema, SchemaRegistrationConfig};
use crate::utils;
use soroban_sdk::{Address, BytesN, Env, String};

/// Gets the schema registration configuration, returning defaults if not set.
fn get_schema_config(env: &Env) -> SchemaRegistrationConfig {
    env.storage()
        .instance()
        .get::<DataKey, SchemaRegistrationConfig>(&DataKey::SchemaConfig)
        .unwrap_or_default()
}

/// Gets the current schema count for an address.
fn get_schema_count(env: &Env, address: &Address) -> u32 {
    env.storage()
        .instance()
        .get::<DataKey, u32>(&DataKey::SchemaCount(address.clone()))
        .unwrap_or(0)
}

/// Increments the schema count for an address.
fn increment_schema_count(env: &Env, address: &Address) {
    let current = get_schema_count(env, address);
    env.storage()
        .instance()
        .set(&DataKey::SchemaCount(address.clone()), &(current + 1));
}

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

    // Get schema registration configuration (limits)
    let config = get_schema_config(env);

    // Check schema definition size limit to prevent storage exhaustion
    let definition_size = schema_definition.len() as u32;
    if definition_size > config.max_definition_size {
        return Err(Error::SchemaDefinitionTooLarge);
    }

    // Check per-address schema quota to prevent DoS attacks
    let current_count = get_schema_count(env, &caller);
    if current_count >= config.max_schemas_per_address {
        return Err(Error::SchemaQuotaExceeded);
    }

    // Generate schema UID
    let schema_uid = utils::generate_schema_uid(env, &schema_definition, &caller, &resolver);

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

    // Increment the schema count for this address
    increment_schema_count(env, &caller);

    // Publish schema registration event
    events::schema_registered(env, &schema_uid, &schema, &caller);

    Ok(schema_uid)
}

////////////////////////////////////////////////////////////////////////////////////
/// Sets the schema registration configuration (admin only).
////////////////////////////////////////////////////////////////////////////////////
///
/// This function allows the contract admin to configure limits for schema registration
/// to prevent DoS attacks and storage exhaustion.
///
/// # Authorization
/// Requires authorization from the contract admin.
///
/// # Arguments
/// * `env` - The Soroban environment.
/// * `admin` - The admin address (must match the stored admin).
/// * `max_schemas_per_address` - Maximum schemas a single address can register.
/// * `max_definition_size` - Maximum size of schema definitions in bytes.
///
/// # Returns
/// * `Result<(), Error>` - Ok on success, or an error if not authorized.
pub fn set_schema_registration_config(
    env: &Env,
    admin: Address,
    max_schemas_per_address: u32,
    max_definition_size: u32,
) -> Result<(), Error> {
    // Verify admin authorization
    let stored_admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;

    if admin != stored_admin {
        return Err(Error::NotAuthorized);
    }
    admin.require_auth();

    // Store the new configuration
    let config = SchemaRegistrationConfig {
        max_schemas_per_address,
        max_definition_size,
    };
    env.storage().instance().set(&DataKey::SchemaConfig, &config);

    Ok(())
}

////////////////////////////////////////////////////////////////////////////////////
/// Gets the current schema registration configuration.
////////////////////////////////////////////////////////////////////////////////////
///
/// Returns the current limits for schema registration. If no configuration has been
/// set, returns the default values.
///
/// # Arguments
/// * `env` - The Soroban environment.
///
/// # Returns
/// * `SchemaRegistrationConfig` - The current configuration with limits.
pub fn get_schema_registration_config(env: &Env) -> SchemaRegistrationConfig {
    get_schema_config(env)
}

////////////////////////////////////////////////////////////////////////////////////
/// Gets the number of schemas registered by an address.
////////////////////////////////////////////////////////////////////////////////////
///
/// # Arguments
/// * `env` - The Soroban environment.
/// * `address` - The address to check.
///
/// # Returns
/// * `u32` - The number of schemas registered by the address.
pub fn get_address_schema_count(env: &Env, address: &Address) -> u32 {
    get_schema_count(env, address)
}
