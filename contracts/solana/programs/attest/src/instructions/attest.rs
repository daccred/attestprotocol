use crate::errors::AttestError;
use crate::events::Attested;
use crate::state::{Attestation, SchemaData};
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

#[derive(Accounts)]
pub struct Attest<'info> {
    /// The attester who is creating the attestation.
    #[account(mut)]
    pub attester: Signer<'info>,

    /// CHECK: The recipient's public key; no data needed.
    pub recipient: UncheckedAccount<'info>,

    /// CHECK just a chill account
    pub levy_receipent: UncheckedAccount<'info>,

    /// CHECK: The deployer is only used for validation purposes, and no data is read or written to this account.
    pub deployer: UncheckedAccount<'info>,

    #[account(mut)]
    pub mint_account: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = attester,
    )]
    pub attester_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = attester,
        associated_token::mint = mint_account,
        associated_token::authority = levy_receipent,
    )]
    pub levy_receipent_token_account: Account<'info, TokenAccount>,

    /// The schema data account; must match the schema UID.
    #[account(
        has_one = deployer,
    )]
    pub schema_data: Account<'info, SchemaData>,

    #[account(
        init,
        payer = attester,
        space = Attestation::LEN,
        seeds = [b"attestation", schema_data.key().as_ref(), recipient.key.as_ref(), attester.key.as_ref()],
        bump
    )]
    pub attestation: Account<'info, Attestation>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn attest_handler(
    ctx: Context<Attest>,
    data: String,
    ref_uid: Option<Pubkey>,
    expiration_time: Option<u64>,
    revocable: bool,
) -> Result<()> {
    let schema_data = &ctx.accounts.schema_data;
    let attestation = &mut ctx.accounts.attestation;
    let current_time = Clock::get()?.unix_timestamp as u64;
    let levy = schema_data.levy.clone();

    require!(schema_data.to_account_info().owner == ctx.program_id, AttestError::InvalidData);

    if let Some(lev) = levy {
        // if asset is none, use SOL.
        if lev.asset.is_none() {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.key(),
                    system_program::Transfer {
                        from: ctx.accounts.attester.to_account_info(),
                        to: ctx.accounts.levy_receipent.to_account_info(),
                    },
                ),
                lev.amount,
            )?;
        } else {
            require!(
                lev.asset.unwrap() == ctx.accounts.mint_account.key(),
                AttestError::WrongAsset
            );

            transfer(
                CpiContext::new(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.attester_token_account.to_account_info(),
                        to: ctx.accounts.levy_receipent_token_account.to_account_info(),
                        authority: ctx.accounts.attester.to_account_info(),
                    },
                ),
                lev.amount * 10u64.pow(ctx.accounts.mint_account.decimals as u32), // Transfer amount, adjust for decimals
            )?;
        }
    } else {
        require!(
            ctx.accounts.levy_receipent.key() == Pubkey::default(),
            AttestError::ShouldBeUnused
        );
        require!(
            ctx.accounts.levy_receipent_token_account.key() == Pubkey::default(),
            AttestError::ShouldBeUnused
        );
    }

    // Ensure data size is within limits
    if data.len() > Attestation::MAX_DATA_SIZE {
        return Err(AttestError::DataTooLarge.into());
    }

    // Ensure expiration time is in the future, if provided
    if let Some(exp_time) = expiration_time {
        if exp_time <= current_time {
            return Err(AttestError::InvalidExpirationTime.into());
        }
    }

    // Populate attestation fields
    attestation.schema = schema_data.uid;
    attestation.recipient = *ctx.accounts.recipient.key;
    attestation.attester = *ctx.accounts.attester.key;
    attestation.ref_uid = ref_uid;
    attestation.data = data;
    attestation.time = current_time;
    attestation.expiration_time = expiration_time;
    attestation.revocable = revocable;
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
