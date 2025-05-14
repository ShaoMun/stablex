use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{VaultAccount, LPPosition, VAULT_ACCOUNT_SEED, LP_POSITION_SEED, VAULT_AUTHORITY_SEED};
use crate::utils::calculate_lp_rewards;

#[derive(Accounts)]
pub struct DistributeIncentives<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
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

pub fn handler(ctx: Context<DistributeIncentives>) -> Result<()> {
    let vault_account = &mut ctx.accounts.vault_account;
    let lp_position = &mut ctx.accounts.lp_position;
    
    // Ensure there are LP fees to distribute
    require!(vault_account.accrued_lp_fees > 0, ErrorCode::NoFeesToClaim);
    
    // Ensure user has liquidity positioned
    require!(lp_position.amount > 0, ErrorCode::NoLiquidityProvided);
    
    // Calculate the LP's share of fees
    let reward_amount = calculate_lp_rewards(
        lp_position.amount,
        vault_account.accrued_lp_fees,
        vault_account.tvl,
    )?;
    
    // Ensure there's something to claim
    require!(reward_amount > 0, ErrorCode::RewardTooSmall);
    
    // Transfer tokens from vault to user
    let bump = vault_account.nonce;
    let vault_key = vault_account.key();
    let seeds = &[
        VAULT_AUTHORITY_SEED,
        vault_key.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    let transfer_cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_cpi_accounts,
        signer_seeds,
    );
    
    token::transfer(cpi_ctx, reward_amount)?;
    
    // Update the vault's accrued fees
    vault_account.accrued_lp_fees = vault_account.accrued_lp_fees.checked_sub(reward_amount).ok_or(ErrorCode::MathOverflow)?;
    
    // Update the LP's reward data
    lp_position.rewards_claimed = lp_position.rewards_claimed.checked_add(reward_amount).ok_or(ErrorCode::MathOverflow)?;
    lp_position.last_rewards_claim_time = Clock::get()?.unix_timestamp;
    
    msg!("Distributed {} tokens in rewards to LP", reward_amount);
    
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math operation resulted in overflow")]
    MathOverflow,
    
    #[msg("No fees available to claim")]
    NoFeesToClaim,
    
    #[msg("No liquidity provided to this vault")]
    NoLiquidityProvided,
    
    #[msg("Calculated reward amount is too small")]
    RewardTooSmall,
} 