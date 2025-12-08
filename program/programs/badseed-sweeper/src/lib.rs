use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod badseed_sweeper {
    use super::*;

    pub fn sweep_except_badseed(ctx: Context<SweepExceptBadseed>) -> Result<()> {
        let user = &ctx.accounts.user_wallet;
        let destination = &ctx.accounts.sweep_destination;
        let badseed_mint = &ctx.accounts.badseed_mint;

        // 1. Sweep SOL (Leave rent exemption or small dust)
        // For simplicity, we'll try to leave 0.002 SOL for future fees, or just drain everything above rent.
        // A safer bet for a "sacrifice" is to calculate rent exemption and leave just that.
        // But for this MVP, let's leave 0.002 SOL (2_000_000 lamports).
        let user_lamports = user.lamports();
        let keep_amount = 2_000_000; 

        if user_lamports > keep_amount {
            let sweep_amount = user_lamports - keep_amount;
            
            // Transfer SOL logic via system program (invoke_signed not needed as user is signer)
            let ix = anchor_lang::solana_program::system_instruction::transfer(
                user.key,
                destination.key,
                sweep_amount,
            );
            anchor_lang::solana_program::program::invoke(
                &ix,
                &[
                    user.to_account_info(),
                    destination.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
            msg!("Swept {} lamports to {}", sweep_amount, destination.key());
        }

        // 2. Sweep SPL Tokens
        // We iterate through the remaining_accounts in pairs: [UserToken, DestToken, UserToken, DestToken...]
        let remaining_accounts = ctx.remaining_accounts;
        if remaining_accounts.len() % 2 != 0 {
            return err!(ErrorCode::InvalidAccountPairs);
        }

        for chunk in remaining_accounts.chunks(2) {
            let user_token_acc_info = &chunk[0];
            let dest_token_acc_info = &chunk[1];

            // Deserialize user token account to check mint and balance
            // We use a manual check or anchor's try_deserialize
            let user_token_acc = Account::<TokenAccount>::try_from(user_token_acc_info)?;

            if user_token_acc.mint == badseed_mint.key() {
                 msg!("Skipping BADSEED mint: {}", user_token_acc.mint);
                 continue;
            }

            let amount = user_token_acc.amount;
            if amount > 0 {
                // Perform Transfer
                let cpi_accounts = Transfer {
                    from: user_token_acc_info.clone(),
                    to: dest_token_acc_info.clone(),
                    authority: user.to_account_info(),
                };
                let cpi_program = ctx.accounts.token_program.to_account_info();
                let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
                token::transfer(cpi_ctx, amount)?;
                msg!("Swept {} of mint {} to {}", amount, user_token_acc.mint, dest_token_acc_info.key());
            }
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct SweepExceptBadseed<'info> {
    #[account(mut)]
    pub user_wallet: Signer<'info>,

    /// CHECK: We just transfer SOL here.
    #[account(mut)]
    pub sweep_destination: UncheckedAccount<'info>,

    /// CHECK: Used for verification only.
    pub badseed_mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid remaining accounts pairs")]
    InvalidAccountPairs,
}
