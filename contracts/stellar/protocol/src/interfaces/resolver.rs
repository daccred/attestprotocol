use soroban_sdk::{contractclient, Address, BytesN, Env};

// HAL-04: The resolver ABI is now unified on the resolvers crate as the single
// source of truth. The protocol no longer defines its own `ResolverAttestation`
// struct or its own divergent set of trait method signatures. Instead, this
// module re-exports the canonical `ResolverAttestationData` from the resolvers
// crate and declares a `Resolver` trait whose method signatures match
// `ResolverInterface` exactly. This guarantees that `ResolverClient` (generated
// from the trait below via `#[contractclient]`) produces XDR invocations that
// the on-chain `DefaultResolver` (and any other `ResolverInterface`
// implementor) can decode.
//
// Field shape parity is required: `ResolverAttestationData` and the deleted
// `ResolverAttestation` struct had identical field sets, so this consolidation
// is a rename-only change at construction sites in the protocol crate.
pub use resolvers::interface::{ResolverAttestationData, ResolverError, ResolverMetadata};

/// Backwards-compatible alias. The protocol previously defined a struct named
/// `ResolverAttestation`; downstream code (and the protocol's own test
/// utilities) referenced it by that name. The struct itself has been deleted
/// and the canonical type is `ResolverAttestationData` from the resolvers
/// crate. This alias keeps existing import paths compiling without forcing
/// every call site to rename in the same change. New code should prefer
/// `ResolverAttestationData` directly.
pub type ResolverAttestation = ResolverAttestationData;

/// Resolver Contract Client Interface
///
/// This trait defines the cross-contract ABI that the protocol uses when
/// invoking resolver implementations. It MUST mirror
/// `resolvers::interface::ResolverInterface` exactly — same method names,
/// same parameter shapes, same return types — so that the `ResolverClient`
/// generated below produces XDR-encoded invocations that any contract
/// implementing `ResolverInterface` can decode.
///
/// Resolvers provide custom business logic for attestation validation,
/// economic models, and post-processing hooks. Each method corresponds to a
/// specific point in the attestation lifecycle:
///
/// - `onattest`: Validates whether an attestation should be allowed
///   (pre-creation). Returns `Ok(true)` to allow, `Ok(false)` to reject,
///   or `Err(ResolverError)` for a typed failure.
/// - `onrevoke`: Validates whether a revocation should be allowed
///   (pre-revocation). Same return semantics as `onattest`.
/// - `onresolve`: Post-processing hook fired after attestation creation or
///   revocation. Receives the attestation UID and attester only — the
///   resolver looks up any additional state it needs from its own storage.
///   Failures here are logged by the protocol but do not revert the parent
///   attestation/revocation.
/// - `metadata`: Returns descriptive metadata about the resolver
///   (name, version, type).
///
/// Security model:
/// - `onattest` / `onrevoke` gate protocol actions; a `false` return or
///   `Err` causes the protocol to abort with `Error::ResolverError` /
///   `Error::ResolverCallFailed`.
/// - `onresolve` is treated as best-effort; the protocol uses
///   `try_onresolve` and discards the result.
#[contractclient(name = "ResolverClient")]
pub trait Resolver {
    /// Called before an attestation is created — CRITICAL for access control.
    ///
    /// # Returns
    /// * `Ok(true)` — Attestation allowed, proceed with creation.
    /// * `Ok(false)` — Attestation denied (soft failure).
    /// * `Err(ResolverError)` — Validation failed with a specific error.
    fn onattest(env: Env, attestation: ResolverAttestationData) -> Result<bool, ResolverError>;

    /// Called before an attestation is revoked — CRITICAL for access control.
    ///
    /// # Returns
    /// * `Ok(true)` — Revocation allowed, proceed with marking revoked.
    /// * `Ok(false)` — Revocation denied (soft failure).
    /// * `Err(ResolverError)` — Revocation rejected with a specific error.
    fn onrevoke(env: Env, attestation: ResolverAttestationData) -> Result<bool, ResolverError>;

    /// Called after an attestation is created or revoked — for side effects
    /// (rewards, cleanup, notifications, etc.). Failures are non-fatal: the
    /// protocol invokes this via `try_onresolve` and ignores the result.
    ///
    /// Takes only `(attestation_uid, attester)` rather than the full
    /// attestation struct: the resolver is expected to look up any state it
    /// owns by UID, and the attester is forwarded for accounting purposes.
    fn onresolve(env: Env, attestation_uid: BytesN<32>, attester: Address) -> Result<(), ResolverError>;

    /// Returns descriptive metadata for the resolver. Used for discovery and
    /// integration; not consumed by the core protocol logic.
    fn metadata(env: Env) -> ResolverMetadata;
}
