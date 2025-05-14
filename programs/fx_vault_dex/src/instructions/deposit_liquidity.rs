use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{VaultAccount, LPPosition, VAULT_ACCOUNT_SEED, LP_POSITION_SEED};

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        seeds = [VAULT_ACCOUNT_SEED, vault_account.token_mint.as_ref()],
        bump,
    )]
    pub vault_account: Account<'info, VaultAccount>,
    
    #[account(
        mut, 
        seeds = [LP_POSITION_SEED, vault_account.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = lp_position.owner == user.key(),
        constraint = lp_position.vault == vault_account.key(),
    )]
    pub lp_position: Account<'info, LPPosition>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == vault_account.token_mint,
        constraint = user_token_account.owner == user.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = vault_token_account.key() == vault_account.token_account,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
    let vault_account = &mut ctx.accounts.vault_account;
    let lp_position = &mut ctx.accounts.lp_position;
    
    // Transfer tokens from user to vault
    let transfer_cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_cpi_accounts,
    );
    
    token::transfer(cpi_ctx, amount)?;
    
    // Update the vault's total value locked
    vault_account.tvl = vault_account.tvl.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    
    // Update the LP's position
    lp_position.amount = lp_position.amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    lp_position.last_deposit_time = Clock::get()?.unix_timestamp;
    
    msg!("Deposited {} tokens into vault", amount);
    
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math operation resulted in overflow")]
    MathOverflow,
} 