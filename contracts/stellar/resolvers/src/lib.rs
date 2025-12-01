//! # Resolvers Library
//!
//! This library provides a collection of resolver implementations for the Stellar attestation Service.
//! Resolvers are responsible for validating and processing attestations according to specific
//! business logic rules, enabling flexible attestation workflows with custom validation and processing.
//!
//! ## Architecture
//!
//! The library is organized around a common interface (`ResolverInterface`) that all resolvers
//! must implement. This allows for pluggable resolver logic while maintaining a consistent API.
//! Each resolver can define custom validation rules, fee structures, and post-attestation actions
//! while sharing common data structures and error handling.
//!
//! ## Available Resolvers
//!
//! - **DefaultResolver**: Basic resolver with minimal validation logic, suitable for simple
//!   attestation workflows that don't require complex business rules
//! - **TokenRewardResolver**: Distributes token rewards to attesters for valid attestations,
//!   incentivizing participation in the attestation ecosystem
//! - **FeeCollectionResolver**: Collects fees for attestation processing with configurable
//!   fee amounts and recipient management, enabling monetization of attestation services
//!
//! ## Gating Model (Features + Target)
//!
//! - When building for Wasm deployment (target_arch = wasm32): no resolvers are exported by default.
//!   Enable exactly one feature to export a specific resolver contract and avoid duplicate symbols:
//!   - `export-default-resolver`
//!   - `export-token-reward-resolver`
//!   - `export-fee-collection-resolver`
//! - When building for tests (not(target_arch = "wasm32")): all resolvers are available so integration tests
//!   can import and use any resolver implementation without feature juggling.
//!
//! This setup lets tests work with all resolvers while preventing deployment-time conflicts when this crate
//! is included by other Wasm contracts.
//!
//! ## Build & Deploy Individual Resolvers
//!
//! Build a single resolver to Wasm by enabling its feature:
//! - Default Resolver:
//!   `cargo build --target wasm32v1-none --release --features export-default-resolver`
//! - Token Reward Resolver:
//!   `cargo build --target wasm32v1-none --release --features export-token-reward-resolver`
//! - Fee Collection Resolver:
//!   `cargo build --target wasm32v1-none --release --features export-fee-collection-resolver`
//!
//! Deploy the built Wasm (example for Fee Collection Resolver):
//! ```bash
//! stellar contract deploy \
//!   --wasm target/wasm32v1-none/release/resolvers.wasm \
//!   --source YOUR_IDENTITY \
//!   --network testnet
//! ```
//! Initialize example:
//! ```bash
//! stellar contract invoke \
//!   --id YOUR_RESOLVER_CONTRACT_ID \
//!   --source YOUR_IDENTITY \
//!   --network testnet \
//!   -- initialize \
//!   --admin YOUR_ADMIN_ADDRESS \
//!   --fee_token TOKEN_ADDRESS \
//!   --attestation_fee 1000000 \
//!   --fee_recipient FEE_RECIPIENT_ADDRESS
//! ```
#![no_std]

/// Core interface definitions and types shared across all resolver implementations.
/// This module contains the `ResolverInterface` trait and common data structures
/// like `ResolverAttestationData`, `ResolverMetadata`, and standardized error types.
pub mod interface;

/// Default resolver implementation that provides basic attestation validation.
/// This resolver performs minimal checks and is suitable for simple use cases
/// where custom validation logic is not required. It serves as a reference
/// implementation and baseline for more complex resolvers.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-default-resolver"))]
pub mod default;

/// Token reward resolver implementation that distributes token rewards to users
/// who create valid attestations. This resolver integrates with Stellar token contracts
/// to handle reward distribution and maintains tracking of user rewards and eligibility.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-token-reward-resolver"))]
pub mod token_reward;

/// Fee collection resolver implementation that charges fees for attestation processing.
/// This resolver can collect fees in various Stellar assets and provides mechanisms for
/// fee withdrawal, recipient management, and administrative controls over fee structures.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-fee-collection-resolver"))]
pub mod fee_collection;


// ============================================================================
// PUBLIC RE-EXPORTS
// ============================================================================

/// Re-export core interface types that are used across all resolver implementations.
/// These types form the foundation of the resolver system and are always available
/// regardless of which specific resolver implementations are compiled.
pub use interface::{ResolverAttestationData, ResolverError, ResolverInterface, ResolverMetadata, ResolverType};

/// Re-export the DefaultResolver implementation when available.
/// Only export to Wasm when the `export-default-resolver` feature is enabled;
/// always available on native builds for tests and integration.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-default-resolver"))]
pub use default::DefaultResolver;

/// Re-export the TokenRewardResolver implementation when available.
/// Only export to Wasm when the `export-token-reward-resolver` feature is enabled;
/// always available on native builds for tests and integration.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-token-reward-resolver"))]
pub use token_reward::TokenRewardResolver;

/// Re-export the FeeCollectionResolver implementation when available.
/// Only export to Wasm when the `export-fee-collection-resolver` feature is enabled;
/// always available on native builds for tests and integration.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-fee-collection-resolver"))]
pub use fee_collection::FeeCollectionResolver;

