use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{VaultAccount, VAULT_ACCOUNT_SEED, VAULT_AUTHORITY_SEED, LP_FEE_PERCENT};
use crate::utils::{calculate_amount_out, calculate_spread, calculate_drift, calculate_fee_allocation};

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    
    // Source vault (tokens going in)
    #[account(
        mut,
        seeds = [VAULT_ACCOUNT_SEED, source_vault.token_mint.as_ref()],
        bump,
    )]
    pub source_vault: Account<'info, VaultAccount>,
    
    // Target vault (tokens going out)
    #[account(
        mut,
        seeds = [VAULT_ACCOUNT_SEED, target_vault.token_mint.as_ref()],
        bump,
    )]
    pub target_vault: Account<'info, VaultAccount>,
    
    /// CHECK: This is the source vault authority PDA
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, target_vault.key().as_ref()],
        bump = target_vault.nonce,
    )]
    pub target_vault_authority: AccountInfo<'info>,
    
    // User token accounts
    #[account(
        mut,
        constraint = user_source_token.mint == source_vault.token_mint,
        constraint = user_source_token.owner == user.key(),
    )]
    pub user_source_token: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = user_target_token.mint == target_vault.token_mint,
        constraint = user_target_token.owner == user.key(),
    )]
    pub user_target_token: Account<'info, TokenAccount>,
    
    // Vault token accounts
    #[account(
        mut,
        constraint = source_vault_token.key() == source_vault.token_account,
    )]
    pub source_vault_token: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = target_vault_token.key() == target_vault.token_account,
    )]
    pub target_vault_token: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Swap>,
    amount_in: u64,
    minimum_amount_out: u64,
    oracle_price: u64, // Added parameter for oracle price from API
) -> Result<()> {
    let source_vault = &mut ctx.accounts.source_vault;
    let target_vault = &mut ctx.accounts.target_vault;
    
    // Get the FX rate from the provided oracle price parameter
    // Note: ensure the price is already scaled to 10^9 when passed from API
    
    // Calculate the spread based on vault health (imbalance)
    let source_amount = source_vault.tvl;
    let target_amount = target_vault.tvl;
    let spread_bps = calculate_spread(source_amount, target_amount);
    
    // Calculate the drift based on vault health (imbalance)
    let drift_percentage = calculate_drift(source_amount, target_amount);
    
    // Calculate the amount out and fees
    let (amount_out, fee_amount) = calculate_amount_out(
        amount_in,
        oracle_price,
        spread_bps,
        drift_percentage,
        true, // source to target direction
    )?;
    
    // Ensure the amount out meets the user's minimum
    require!(amount_out >= minimum_amount_out, ErrorCode::SlippageExceeded);
    
    // Ensure the target vault has enough funds
    require!(target_vault.tvl >= amount_out, ErrorCode::InsufficientLiquidity);
    
    // 1. Transfer tokens from user to source vault
    let transfer_in_accounts = Transfer {
        from: ctx.accounts.user_source_token.to_account_info(),
        to: ctx.accounts.source_vault_token.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    
    let cpi_ctx_in = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_in_accounts,
    );
    
    token::transfer(cpi_ctx_in, amount_in)?;
    
    // 2. Transfer tokens from target vault to user
    let bump = target_vault.nonce;
    let target_vault_key = target_vault.key();
    let seeds = &[
        VAULT_AUTHORITY_SEED,
        target_vault_key.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[&seeds[..]];
    
    let transfer_out_accounts = Transfer {
        from: ctx.accounts.target_vault_token.to_account_info(),
        to: ctx.accounts.user_target_token.to_account_info(),
        authority: ctx.accounts.target_vault_authority.to_account_info(),
    };
    
    let cpi_ctx_out = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_out_accounts,
        signer_seeds,
    );
    
    token::transfer(cpi_ctx_out, amount_out)?;
    
    // 3. Calculate and distribute fees
    // Get fee allocation percentages based on vault health
    let (pda_percent, protocol_percent) = calculate_fee_allocation(source_amount, target_amount);
    
    // Calculate fee amounts (the sum is always 30% of total fee)
    let lp_fee_amount = fee_amount.checked_mul(LP_FEE_PERCENT as u64).ok_or(ErrorCode::MathOverflow)?.checked_div(100).ok_or(ErrorCode::MathOverflow)?;
    let pda_fee_amount = fee_amount.checked_mul(pda_percent as u64).ok_or(ErrorCode::MathOverflow)?.checked_div(100).ok_or(ErrorCode::MathOverflow)?;
    let protocol_fee_amount = fee_amount.checked_mul(protocol_percent as u64).ok_or(ErrorCode::MathOverflow)?.checked_div(100).ok_or(ErrorCode::MathOverflow)?;
    
    // Update the source vault's TVL
    source_vault.tvl = source_vault.tvl.checked_add(amount_in).ok_or(ErrorCode::MathOverflow)?;
    
    // Update the target vault's TVL and record accrued fees
    target_vault.tvl = target_vault.tvl.checked_sub(amount_out).ok_or(ErrorCode::MathOverflow)?;
    target_vault.accrued_lp_fees = target_vault.accrued_lp_fees.checked_add(lp_fee_amount).ok_or(ErrorCode::MathOverflow)?;
    target_vault.accrued_pda_fees = target_vault.accrued_pda_fees.checked_add(pda_fee_amount).ok_or(ErrorCode::MathOverflow)?;
    target_vault.accrued_protocol_fees = target_vault.accrued_protocol_fees.checked_add(protocol_fee_amount).ok_or(ErrorCode::MathOverflow)?;
    target_vault.last_fee_update = Clock::get()?.unix_timestamp;
    
    // Update oracle price data
    source_vault.last_oracle_price = oracle_price;
    source_vault.last_update_timestamp = Clock::get()?.unix_timestamp;
    
    msg!("Swapped {} source tokens for {} target tokens with {} fee (LP: {}, PDA: {}, Protocol: {})", 
         amount_in, amount_out, fee_amount, lp_fee_amount, pda_fee_amount, protocol_fee_amount);
    
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math operation resulted in overflow")]
    MathOverflow,
    
    #[msg("Insufficient liquidity in target vault")]
    InsufficientLiquidity,
    
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded,
} 