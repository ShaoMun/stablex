use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{VaultAccount, VAULT_ACCOUNT_SEED, VAULT_AUTHORITY_SEED};
use crate::utils::calculate_vault_health;

#[derive(Accounts)]
pub struct RebalanceVault<'info> {
    #[account(mut)]
    pub rebalancer: Signer<'info>,
    
    // Source vault (higher liquidity)
    #[account(
        mut,
        seeds = [VAULT_ACCOUNT_SEED, source_vault.token_mint.as_ref()],
        bump,
    )]
    pub source_vault: Account<'info, VaultAccount>,
    
    // Target vault (lower liquidity)
    #[account(
        mut,
        seeds = [VAULT_ACCOUNT_SEED, target_vault.token_mint.as_ref()],
        bump,
    )]
    pub target_vault: Account<'info, VaultAccount>,
    
    /// CHECK: This is the source vault authority PDA
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, source_vault.key().as_ref()],
        bump = source_vault.nonce,
    )]
    pub source_vault_authority: AccountInfo<'info>,
    
    /// CHECK: Ensure rebalancer is the PDA treasury
    #[account(
        constraint = rebalancer.key() == target_vault.pda_treasury,
        constraint = rebalancer.key() == source_vault.pda_treasury,
    )]
    pub pda_treasury: AccountInfo<'info>,
    
    // Rebalancer token accounts
    #[account(
        mut,
        constraint = rebalancer_source_token.mint == source_vault.token_mint,
        constraint = rebalancer_source_token.owner == rebalancer.key(),
    )]
    pub rebalancer_source_token: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = rebalancer_target_token.mint == target_vault.token_mint,
        constraint = rebalancer_target_token.owner == rebalancer.key(),
    )]
    pub rebalancer_target_token: Account<'info, TokenAccount>,
    
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
    ctx: Context<RebalanceVault>,
    amount: u64,
    oracle_price: u64,
) -> Result<()> {
    let source_vault = &mut ctx.accounts.source_vault;
    let target_vault = &mut ctx.accounts.target_vault;
    
    // Calculate vault health to determine injection rate
    let source_amount = source_vault.tvl;
    let target_amount = target_vault.tvl;
    let vault_health = calculate_vault_health(source_amount, target_amount);
    
    // Determine injection rate based on vault health
    let injection_rate: f64 = if vault_health >= 0.40 && vault_health < 0.50 {
        // Mild imbalance - 30% of deficit
        0.30
    } else if vault_health >= 0.30 && vault_health < 0.40 {
        // Moderate imbalance - 50% of deficit
        0.50
    } else if vault_health >= 0.20 && vault_health < 0.30 {
        // Critical imbalance - 75% of deficit
        0.75
    } else {
        // If vault health is above 0.5 or below 0.2, don't rebalance automatically
        return Err(ErrorCode::NoRebalanceNeeded.into());
    };
    
    // Calculate deficit and injection amount
    let smaller_amount = source_amount.min(target_amount) as f64;
    let larger_amount = source_amount.max(target_amount) as f64;
    let deficit = larger_amount - (smaller_amount / vault_health);
    let injection_amount = (deficit * injection_rate) as u64;
    
    // Validate injection amount doesn't exceed provided amount
    require!(injection_amount <= amount, ErrorCode::InsufficientInjectionAmount);
    
    // Transfer tokens from rebalancer to target vault
    let transfer_accounts = Transfer {
        from: ctx.accounts.rebalancer_target_token.to_account_info(),
        to: ctx.accounts.target_vault_token.to_account_info(),
        authority: ctx.accounts.rebalancer.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
    );
    
    token::transfer(cpi_ctx, injection_amount)?;
    
    // Update the target vault's TVL
    target_vault.tvl = target_vault.tvl.checked_add(injection_amount).ok_or(ErrorCode::MathOverflow)?;
    
    // Calculate new vault health after injection
    let new_vault_health = calculate_vault_health(source_amount, target_vault.tvl);
    
    // Update oracle price data
    source_vault.last_oracle_price = oracle_price;
    source_vault.last_update_timestamp = Clock::get()?.unix_timestamp;
    
    msg!("Rebalanced vault: Injected {} tokens. Vault health improved from {:.4} to {:.4}", 
         injection_amount, vault_health, new_vault_health);
    
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Math operation resulted in overflow")]
    MathOverflow,
    
    #[msg("No rebalancing needed in current vault health range")]
    NoRebalanceNeeded,
    
    #[msg("Insufficient injection amount for required rebalancing")]
    InsufficientInjectionAmount,
} 