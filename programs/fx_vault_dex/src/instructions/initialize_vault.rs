use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{VaultAccount, VAULT_ACCOUNT_SEED, VAULT_AUTHORITY_SEED};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = VaultAccount::LEN,
        seeds = [VAULT_ACCOUNT_SEED, token_mint.key().as_ref()],
        bump,
    )]
    pub vault_account: Account<'info, VaultAccount>,
    
    /// CHECK: This is the vault authority PDA derived from the vault account
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, vault_account.key().as_ref()],
        bump,
    )]
    pub vault_authority: AccountInfo<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = vault_token_account.mint == token_mint.key(),
        constraint = vault_token_account.owner == vault_authority.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This will be validated in the handler
    pub oracle: AccountInfo<'info>,
    
    /// CHECK: This account receives protocol fees
    pub treasury: AccountInfo<'info>,
    
    /// CHECK: This account receives PDA fees
    pub pda_treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeVault>,
    vault_name: String,
    nonce: u8,
    fee_basis_points: u16,
) -> Result<()> {
    let vault_account = &mut ctx.accounts.vault_account;
    
    // Validate fee basis points
    require!(fee_basis_points <= 500, ErrorCode::FeeTooHigh); // Max 5%
    
    // Initialize vault data
    vault_account.vault_name = vault_name;
    vault_account.authority = ctx.accounts.vault_authority.key();
    vault_account.token_mint = ctx.accounts.token_mint.key();
    vault_account.token_account = ctx.accounts.vault_token_account.key();
    vault_account.nonce = nonce;
    vault_account.tvl = 0;
    vault_account.accrued_lp_fees = 0;
    vault_account.accrued_pda_fees = 0;
    vault_account.accrued_protocol_fees = 0;
    vault_account.fee_basis_points = fee_basis_points;
    vault_account.last_fee_update = Clock::get()?.unix_timestamp;
    vault_account.oracle = ctx.accounts.oracle.key();
    vault_account.last_oracle_price = 0; // Will be updated on first swap
    vault_account.last_update_timestamp = Clock::get()?.unix_timestamp;
    vault_account.treasury = ctx.accounts.treasury.key();
    vault_account.pda_treasury = ctx.accounts.pda_treasury.key();
    
    msg!("Initialized vault for token mint: {}", ctx.accounts.token_mint.key());
    
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Fee is too high, maximum is 5%")]
    FeeTooHigh,
} 