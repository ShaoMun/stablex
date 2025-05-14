use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

#[derive(BorshSerialize, BorshDeserialize, PartialEq, Debug, Clone)]
pub struct Pool {
    pub is_initialized: bool,
    pub nonce: u8,
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub oracle: Pubkey,
    pub fee_basis_points: u16,  // In basis points (1/100 of 1%)
    pub pda_fee_account_a: Pubkey,
    pub pda_fee_account_b: Pubkey,
    pub protocol_fee_account_a: Pubkey,
    pub protocol_fee_account_b: Pubkey,
    pub last_oracle_price: u64,  // Last known oracle price scaled by 10^9
    pub last_update_timestamp: u64,
}

impl Sealed for Pool {}

impl IsInitialized for Pool {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for Pool {
    const LEN: usize = 273; // 1 + 1 + 32*8 + 2 + 8 + 8

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let pool = Pool::try_from_slice(src)?;
        Ok(pool)
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }
}

/// Calculates vault health as min(vault_a, vault_b) / max(vault_a, vault_b)
pub fn calculate_vault_health(amount_a: u64, amount_b: u64) -> f64 {
    if amount_a == 0 || amount_b == 0 {
        return 0.0;
    }
    
    let min_amount = amount_a.min(amount_b) as f64;
    let max_amount = amount_a.max(amount_b) as f64;
    
    min_amount / max_amount
}

/// Calculates the spread based on vault health
/// spread = max(0.03%, 0.03% - 0.2833% × (vault_health - 0.9))
pub fn calculate_spread(vault_health: f64) -> f64 {
    let base_spread = 0.0003; // 0.03%
    let health_factor = 0.002833 * (vault_health - 0.9);
    f64::max(base_spread, base_spread - health_factor)
}

/// Calculates the drift based on vault health
/// drift = max(0%, -0.8333% × (vault_health - 0.9))
pub fn calculate_drift(vault_health: f64) -> f64 {
    let health_factor = -0.008333 * (vault_health - 0.9);
    f64::max(0.0, health_factor)
}

/// Calculate fee allocation based on vault health
pub fn calculate_fee_allocation(vault_health: f64) -> (f64, f64) {
    // Returns (pda_fee_percentage, protocol_fee_percentage)
    
    if vault_health > 0.7 {
        (0.15, 0.15) // 15% to PDA, 15% to protocol
    } else if vault_health > 0.5 {
        (0.20, 0.10) // 20% to PDA, 10% to protocol
    } else if vault_health > 0.3 {
        (0.25, 0.05) // 25% to PDA, 5% to protocol
    } else {
        (0.30, 0.0)  // 30% to PDA, 0% to protocol
    }
} 