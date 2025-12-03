//! # Resolvers Library
//!
//! This library provides resolver implementations for the Stellar Attestation Service.
//! Resolvers are responsible for validating and processing attestations according to specific
//! business logic rules, enabling flexible attestation workflows with custom validation.
//!
//! ## Architecture
//!
//! The library is organized around a common interface (`ResolverInterface`) that all resolvers
//! must implement. This allows for pluggable resolver logic while maintaining a consistent API.
//!
//! ## Available Resolvers
//!
//! - **DefaultResolver**: Reference resolver with basic validation logic, suitable for simple
//!   attestation workflows. Serves as a template for custom resolver implementations.
//!
//! ## Building for Wasm
//!
//! Build the default resolver to Wasm:
//! ```bash
//! cargo build --target wasm32v1-none --release --features export-default-resolver
//! ```
//!
//! Deploy the built Wasm:
//! ```bash
//! stellar contract deploy \
//!   --wasm target/wasm32v1-none/release/resolvers.wasm \
//!   --source YOUR_IDENTITY \
//!   --network testnet
//! ```
#![no_std]

/// Core interface definitions and types shared across all resolver implementations.
/// This module contains the `ResolverInterface` trait and common data structures
/// like `ResolverAttestationData`, `ResolverMetadata`, and standardized error types.
pub mod interface;

/// Default resolver implementation that provides basic attestation validation.
/// This resolver performs minimal checks and is suitable for simple use cases
/// where custom validation logic is not required. It serves as a reference
/// implementation and baseline for custom resolvers.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-default-resolver"))]
pub mod default;

// ============================================================================
// PUBLIC RE-EXPORTS
// ============================================================================

/// Re-export core interface types that are used across all resolver implementations.
pub use interface::{ResolverAttestationData, ResolverError, ResolverInterface, ResolverMetadata, ResolverType};

/// Re-export the DefaultResolver implementation when available.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-default-resolver"))]
pub use default::DefaultResolver;
