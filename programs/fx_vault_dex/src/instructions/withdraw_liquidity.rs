use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{
    VaultAccount, LPPosition, VAULT_ACCOUNT_SEED, LP_POSITION_SEED, VAULT_AUTHORITY_SEED,
    WITHDRAWAL_FEE_TIER_1, WITHDRAWAL_FEE_TIER_2, WITHDRAWAL_FEE_TIER_3, WITHDRAWAL_FEE_TIER_4, WITHDRAWAL_FEE_TIER_5,
    HOURS_60_IN_SECONDS, HOURS_120_IN_SECONDS, HOURS_180_IN_SECONDS, HOURS_240_IN_SECONDS
};

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
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
    
    /// CHECK: PDA treasury that receives withdrawal penalties
    #[account(
        constraint = pda_treasury.key() == vault_account.pda_treasury
    )]
    pub pda_treasury: AccountInfo<'info>,
    
    #[account(
        mut,
        constraint = pda_treasury_token.mint == vault_account.token_mint,
        constraint = pda_treasury_token.owner == pda_treasury.key(),
    )]
    pub pda_treasury_token: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawLiquidity>, amount: u64) -> Result<()> {
    let vault_account = &mut ctx.accounts.vault_account;
    let lp_position = &mut ctx.accounts.lp_position;
    
    // Ensure the user has enough liquidity
    require!(lp_position.amount >= amount, ErrorCode::InsufficientFunds);
    
    // Ensure the vault has enough funds
    require!(vault_account.tvl >= amount, ErrorCode::InsufficientVaultFunds);
    
    // Calculate withdrawal penalty based on time since deposit
    let current_time = Clock::get()?.unix_timestamp;
    let time_since_deposit = current_time - lp_position.last_deposit_time;
    
    let withdrawal_fee_bps = if time_since_deposit < HOURS_60_IN_SECONDS {
        WITHDRAWAL_FEE_TIER_1
    } else if time_since_deposit < HOURS_120_IN_SECONDS {
        WITHDRAWAL_FEE_TIER_2
    } else if time_since_deposit < HOURS_180_IN_SECONDS {
        WITHDRAWAL_FEE_TIER_3
    } else if time_since_deposit < HOURS_240_IN_SECONDS {
        WITHDRAWAL_FEE_TIER_4
    } else {
        WITHDRAWAL_FEE_TIER_5
    };
    
    // Calculate the penalty amount and amount to withdraw
    let penalty_amount = if withdrawal_fee_bps > 0 {
        amount
            .checked_mul(withdrawal_fee_bps as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        0
    };
    
    let withdraw_amount = amount.checked_sub(penalty_amount).ok_or(ErrorCode::MathOverflow)?;
    
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
    
    token::transfer(cpi_ctx, withdraw_amount)?;
    
    // If there's a penalty, transfer it to the PDA treasury
    if penalty_amount > 0 {
        let penalty_transfer_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.pda_treasury_token.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        
        let penalty_cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            penalty_transfer_accounts,
            signer_seeds,
        );
        
        token::transfer(penalty_cpi_ctx, penalty_amount)?;
        
        msg!("Applied withdrawal penalty of {} tokens ({}%)", 
             penalty_amount, withdrawal_fee_bps as f64 / 100.0);
    }
    
    // Update the vault's total value locked
    vault_account.tvl = vault_account.tvl.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;
    
    // Update the LP's position
    lp_position.amount = lp_position.amount.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;
    
    msg!("Withdrew {} tokens from vault (after penalty: {})", amount, withdraw_amount);
    
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math operation resulted in overflow")]
    MathOverflow,
    
    #[msg("Insufficient funds in LP position")]
    InsufficientFunds,
    
    #[msg("Insufficient funds in vault")]
    InsufficientVaultFunds,
} 