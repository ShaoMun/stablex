use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct VaultAccount {
    // Vault metadata
    pub vault_name: String,              // User-friendly name of the vault
    pub authority: Pubkey,               // Authority PDA that signs vault operations
    pub token_mint: Pubkey,              // Mint address of the stablecoin this vault accepts
    pub token_account: Pubkey,           // Token account PDA that holds the vault's tokens
    pub nonce: u8,                       // Bump seed for the vault PDA
    
    // Vault financials
    pub tvl: u64,                        // Total value locked in the vault
    pub accrued_lp_fees: u64,            // Accumulated fees for LPs since last distribution (70%)
    pub accrued_pda_fees: u64,           // Accumulated fees for PDA (variable based on vault health)
    pub accrued_protocol_fees: u64,      // Accumulated fees for protocol (variable based on vault health)
    pub fee_basis_points: u16,           // Basis points for swap fees (1 bp = 0.01%)
    pub last_fee_update: i64,            // Last timestamp fees were updated
    
    // Oracle related data
    pub oracle: Pubkey,                  // FX oracle for this currency
    pub last_oracle_price: u64,          // Last known oracle price scaled by 10^9
    pub last_update_timestamp: i64,      // Last time the oracle data was updated
    
    // Treasury accounts
    pub treasury: Pubkey,                // Treasury account to receive protocol fees
    pub pda_treasury: Pubkey,            // PDA treasury account to receive PDA fees
}

impl VaultAccount {
    pub const LEN: usize = 8 +           // discriminator
                          32 +            // vault_name (max)
                          32 +            // authority
                          32 +            // token_mint
                          32 +            // token_account
                          1 +             // nonce
                          8 +             // tvl
                          8 +             // accrued_lp_fees
                          8 +             // accrued_pda_fees
                          8 +             // accrued_protocol_fees
                          2 +             // fee_basis_points
                          8 +             // last_fee_update
                          32 +            // oracle
                          8 +             // last_oracle_price
                          8 +             // last_update_timestamp
                          32 +            // treasury
                          32;             // pda_treasury
} 