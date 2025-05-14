use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct RewardTracker {
    // Vault this reward tracker belongs to
    pub vault: Pubkey,
    pub bump: u8,
    
    // Rewards tracking
    pub total_rewards: u64,          // Total rewards accumulated
    pub total_deposits: u64,         // Total deposits at last update
    pub reward_index: u64,           // Current reward index (scaled by PRECISION)
    pub last_update_time: i64,       // Last time rewards were updated
}

impl RewardTracker {
    pub const LEN: usize = 8 +       // discriminator
                         32 +        // vault
                         1 +         // bump
                         8 +         // total_rewards
                         8 +         // total_deposits
                         8 +         // reward_index
                         8;          // last_update_time
} 