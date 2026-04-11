use crate::errors::AttestError;
use crate::state::{AttesterInfo, Levy};
use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{transfer, Mint, Transfer};
use anchor_lang::solana_program::instruction::Instruction;

pub fn create_verify_signature_instruction(
    program_id: &Pubkey,
    ed25519_program_id: &Pubkey,
    message: Vec<u8>,
    pubkey: [u8; 32],
    signature: [u8; 64],
) -> Result<Instruction> {
    let accounts = vec![AccountMeta::new_readonly(*ed25519_program_id, false)];

    let instruction = AttesterInfo {
        message,
        pubkey,
        signature,
    };

    let mut instruction_data = Vec::new();
    instruction.serialize(&mut instruction_data)?;

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: instruction_data,
    })
}

pub fn settle_levy<'info>(
    levy: Option<Levy>,
    system_program: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    from_token: AccountInfo<'info>,
    recipient: AccountInfo<'info>,
    recipient_token: AccountInfo<'info>,
    mint: &Account<'info, Mint>,
) -> Result<()> {
    match levy {
        Some(lev) => {
            match lev.asset {
                None => {
                    // Transfer SOL
                    system_program::transfer(
                        CpiContext::new(
                            system_program.key(),
                            system_program::Transfer {
                                from: from.clone(),
                                to: recipient.clone(),
                            },
                        ),
                        lev.amount,
                    )
                }
                Some(asset) => {
                    // Transfer tokens
                    require!(asset == mint.key(), AttestError::WrongAsset);

                    let adjusted_amount = lev.amount * 10u64.pow(mint.decimals as u32);
                    transfer(
                        CpiContext::new(
                            token_program.key(),
                            Transfer {
                                from: from_token.clone(),
                                to: recipient_token.clone(),
                                authority: from.clone(),
                            },
                        ),
                        adjusted_amount,
                    )
                }
            }
        }
        None => {
            // Validate unused accounts when no levy is present
            require!(
                recipient.key() == Pubkey::default(),
                AttestError::ShouldBeUnused
            );
            require!(
                recipient_token.key() == Pubkey::default(),
                AttestError::ShouldBeUnused
            );
            Ok(())
        }
    }
}
