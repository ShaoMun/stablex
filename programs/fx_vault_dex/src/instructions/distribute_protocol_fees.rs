use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{VaultAccount, VAULT_ACCOUNT_SEED, VAULT_AUTHORITY_SEED};

#[derive(Accounts)]
pub struct DistributeProtocolFees<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [VAULT_ACCOUNT_SEED, vault_account.token_mint.as_ref()],
        bump,
    )]
    pub vault_account: Account<'info, VaultAccount>,
    
    /// CHECK: This is the vault authority PDA
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault_account.key().as_ref()],
        bump = vault_account.nonce,
    )]
    pub vault_authority: AccountInfo<'info>,
    
    // Token accounts
    #[account(
        mut,
        constraint = vault_token_account.key() == vault_account.token_account,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = protocol_treasury_account.mint == vault_account.token_mint,
        constraint = protocol_treasury_account.owner.key() == vault_account.treasury,
    )]
    pub protocol_treasury_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = pda_treasury_account.mint == vault_account.token_mint,
        constraint = pda_treasury_account.owner.key() == vault_account.pda_treasury,
    )]
    pub pda_treasury_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DistributeProtocolFees>) -> Result<()> {
    let vault_account = &mut ctx.accounts.vault_account;
    
    // Get current fee amounts
    let protocol_fee_amount = vault_account.accrued_protocol_fees;
    let pda_fee_amount = vault_account.accrued_pda_fees;
    
    // Ensure there are fees to distribute
    require!(
        protocol_fee_amount > 0 || pda_fee_amount > 0, 
        ErrorCode::NoFeesToClaim
    );
    
    // PDA signing seeds
    let bump = vault_account.nonce;
    let vault_key = vault_account.key();
    let seeds = &[
        VAULT_AUTHORITY_SEED,
        vault_key.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    // 1. Transfer protocol fees if any
    if protocol_fee_amount > 0 {
        let protocol_transfer_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.protocol_treasury_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        let protocol_cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            protocol_transfer_accounts,
            signer_seeds,
        );
        
        token::transfer(protocol_cpi_ctx, protocol_fee_amount)?;
        
        // Update the vault's accrued protocol fees
        vault_account.accrued_protocol_fees = 0;
        
        msg!("Distributed {} tokens in protocol fees", protocol_fee_amount);
    }
    
    // 2. Transfer PDA fees if any
    if pda_fee_amount > 0 {
        let pda_transfer_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.pda_treasury_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        let pda_cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            pda_transfer_accounts,
            signer_seeds,
        );
        
        token::transfer(pda_cpi_ctx, pda_fee_amount)?;
        
        // Update the vault's accrued PDA fees
        vault_account.accrued_pda_fees = 0;
        
        msg!("Distributed {} tokens in PDA fees", pda_fee_amount);
    }
    
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("No fees available to claim")]
    NoFeesToClaim,
} 