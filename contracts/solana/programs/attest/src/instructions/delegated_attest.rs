use crate::errors::AttestError;
use crate::events::Attested;
use crate::state::{Attestation, AttestationData, AttesterInfo, SchemaData};
use crate::utils::{create_verify_signature_instruction, settle_levy};
use anchor_lang::{prelude::*, solana_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
// use schema_registry::program::SchemaRegistry;

#[derive(Clone)]
pub struct ED25519;

impl anchor_lang::Id for ED25519 {
    fn id() -> Pubkey {
        pubkey!("Ed25519SigVerify111111111111111111111111111")
    }
}

#[derive(Accounts)]
#[instruction(attestation_data: AttestationData, attester_info: AttesterInfo, recipient: Pubkey, attester: Pubkey)]
pub struct DelegatedAttest<'info> {
    #[account(mut)]
    pub delegated_attester: Signer<'info>,

    /// CHECK just a chill account
    pub levy_receipent: UncheckedAccount<'info>,

    /// CHECK: The deployer is only used for validation purposes, and no data is read or written to this account.
    pub deployer: UncheckedAccount<'info>,

    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = delegated_attester,
    )]
    pub delegated_attester_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = delegated_attester,
        associated_token::mint = mint_account,
        associated_token::authority = levy_receipent,
    )]
    pub levy_receipent_token_account: Account<'info, TokenAccount>,

    /// The schema data account; must match the schema UID.
    #[account(
        has_one = deployer,
        // constraint = schema_data.to_account_info().owner == &schema_registry_program.key() @ AttestError::InvalidSchema,
    )]
    pub schema_data: Account<'info, SchemaData>,

    #[account(
        init,
        payer = delegated_attester,
        space = Attestation::LEN,
        seeds = [b"attestation", schema_data.key().as_ref(), recipient.as_ref(), attester.as_ref()],
        bump
    )]
    pub attestation: Account<'info, Attestation>,

    // pub schema_registry_program: Program<'info, SchemaRegistry>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub ed25519_program: Program<'info, ED25519>,
}

pub fn delegated_attest_handler(
    ctx: Context<DelegatedAttest>,
    attestation_data: AttestationData,
    attester_info: AttesterInfo,
    recipient: Pubkey,
    attester: Pubkey,
) -> Result<()> {
    require!(
        attestation_data.recipient == recipient,
        AttestError::InvalidData
    );
    require!(
        Pubkey::from(attester_info.pubkey) == attester,
        AttestError::InvalidData
    );

    let ix = create_verify_signature_instruction(
        &crate::ID,
        &ctx.accounts.ed25519_program.key(),
        attester_info.message,
        attester_info.pubkey,
        attester_info.signature,
    )
    .expect("failed to create ix");

    solana_program::program::invoke(
        &ix,
        &[ctx.accounts.ed25519_program.to_account_info().clone()],
    )
    .expect("ed25519 verify invoke call failed");

    let schema_data = &ctx.accounts.schema_data;
    let attestation = &mut ctx.accounts.attestation;
    let current_time = Clock::get()?.unix_timestamp as u64;
    let levy = schema_data.levy.clone();

    settle_levy(
        levy,
        ctx.accounts.system_program.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.delegated_attester.to_account_info(),
        ctx.accounts
            .delegated_attester_token_account
            .to_account_info(),
        ctx.accounts.levy_receipent.to_account_info(),
        ctx.accounts.levy_receipent_token_account.to_account_info(),
        &ctx.accounts.mint_account,
    )
    .expect("levy settlement failed");

    // Ensure data size is within limits
    if attestation_data.data.len() > Attestation::MAX_DATA_SIZE {
        return Err(AttestError::DataTooLarge.into());
    }

    // Ensure expiration time is in the future, if provided
    if let Some(exp_time) = attestation_data.expiration_time {
        if exp_time <= current_time as u64 {
            return Err(AttestError::InvalidExpirationTime.into());
        }
    }

    // Populate attestation fields
    attestation.schema = schema_data.uid;
    attestation.recipient = attestation_data.recipient;
    attestation.attester = Pubkey::from(attester_info.pubkey);
    attestation.ref_uid = attestation_data.ref_uid;
    attestation.data = attestation_data.data;
    attestation.time = current_time;
    attestation.expiration_time = attestation_data.expiration_time;
    attestation.revocable = attestation_data.revocable;
    attestation.revocation_time = None;
    attestation.uid = attestation.key();

    // Emit an event to notify off-chain clients.
    emit!(Attested {
        schema: schema_data.uid,
        recipient: attestation.recipient,
        attester: attestation.attester,
        uid: attestation.uid,
        time: attestation.time,
    });

    Ok(())
}
