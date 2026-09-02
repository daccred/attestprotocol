#![allow(unexpected_cfgs)]


use anchor_lang::prelude::*;

mod errors;
mod events;
mod instructions;
mod state;
mod utils;

pub use instructions::*;
pub use state::*;

declare_id!("BMr9aui54YuxtpBzWXiFNmnr2iH6etRu7rMFJnKxjtpY");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "attest-protocol",
    project_url: "attestprotocol.org",
    contacts: "email:security@attestprotocol.org",
    policy: "https://github.com/daccred/attest.so/blob/main/SECURITY.md",
    source_code: "https://github.com/daccred/attest.so"
}

#[program]
pub mod attest {
    use super::*;

    // Register a new attestation
    pub fn attest(
        ctx: Context<Attest>,
        data: String,
        ref_uid: Option<Pubkey>,
        expiration_time: Option<u64>,
        revocable: bool,
    ) -> Result<()> {
        attest_handler(ctx, data, ref_uid, expiration_time, revocable)
    }

    pub fn delegated_attest(
        ctx: Context<DelegatedAttest>,
        attestation_data: AttestationData,
        attester_info: AttesterInfo,
        recipient: Pubkey,
        attester: Pubkey,
    ) -> Result<()> {
        delegated_attest_handler(ctx, attestation_data, attester_info, recipient, attester)
    }

    pub fn revoke_attestation(
        ctx: Context<Revoke>,
        schema_uid: Pubkey,
        recipient: Pubkey,
    ) -> Result<()> {
        revoke_attestation_handler(ctx, schema_uid, recipient)
    }

    pub fn register_authority(ctx: Context<RegisterAuthority>) -> Result<()> {
        register_authority_handler(ctx)
    }

    pub fn verify_authority(ctx: Context<VerifyAuthority>, is_verified: bool) -> Result<()> {
        verify_authority_handler(ctx, is_verified)
    }

    pub fn create_schema(
        ctx: Context<CreateSchema>,
        schema_name: String,
        schema: String,
        resolver: Option<Pubkey>,
        revocable: bool,
        levy: Option<Levy>,
    ) -> Result<()> {
        create_schema_handler(ctx, schema_name, schema, resolver, revocable, levy)
    }
}
