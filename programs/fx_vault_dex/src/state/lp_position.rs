use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct LPPosition {
    // LP metadata
    pub owner: Pubkey,               // Owner of this LP position
    pub vault: Pubkey,               // Vault this position belongs to
    pub bump: u8,                    // Bump seed for the LP position PDA
    
    // LP position details
    pub amount: u64,                 // Amount of tokens deposited
    pub last_deposit_time: i64,      // Timestamp of the last deposit
    
    // Rewards tracking
    pub rewards_claimed: u64,        // Total rewards claimed by this LP
    pub last_rewards_claim_time: i64, // Timestamp of the last rewards claim
}

impl LPPosition {
    pub const LEN: usize = 8 +        // discriminator
                        32 +          // owner
                        32 +          // vault
                        1 +           // bump
                        8 +           // amount
                        8 +           // last_deposit_time
                        8 +           // rewards_claimed
                        8;            // last_rewards_claim_time
} 