use anchor_lang::prelude::*;
use crate::state::constants::*;

/// Calculates the spread fee based on vault health
/// spread = max(0.03%, 0.03% - 0.2833% × (vault_health - 0.9))
/// Returns spread in basis points
pub fn calculate_spread(amount_a: u64, amount_b: u64) -> u16 {
    // Vault health is between 0 and 1
    let vault_health = calculate_vault_health(amount_a, amount_b);
    
    // Convert to percentage: 0.03% = 3 basis points
    let min_spread = MIN_SPREAD_BPS as f64 * 0.01; // Convert to percentage
    
    // Calculate using the formula
    let spread_percentage = if vault_health > 0.9 {
        min_spread
    } else {
        let adjustment = SPREAD_SLOPE * (vault_health - 0.9);
        f64::max(min_spread, min_spread - adjustment)
    };
    
    // Convert back to basis points and ensure within limits
    let spread_bps = (spread_percentage * 100.0) as u16;
    std::cmp::min(spread_bps, MAX_SPREAD_BPS)
}

/// Calculates the drift based on vault health
/// drift = max(0%, -0.8333% × (vault_health - 0.9))
/// Returns drift as a positive percentage (0.0 to 1.0)
pub fn calculate_drift(amount_a: u64, amount_b: u64) -> f64 {
    let vault_health = calculate_vault_health(amount_a, amount_b);
    
    if vault_health >= 0.9 {
        0.0 // No drift when vault is balanced
    } else {
        let adjustment = DRIFT_SLOPE * (vault_health - 0.9);
        f64::max(0.0, -adjustment)
    }
}

/// Calculate fee allocation between PDA and protocol based on vault health
/// Returns (pda_fee_percentage, protocol_fee_percentage)
pub fn calculate_fee_allocation(amount_a: u64, amount_b: u64) -> (u8, u8) {
    // The percentages are of the 30% non-LP portion of fees
    let vault_health = calculate_vault_health(amount_a, amount_b);
    
    if vault_health > 0.70 {
        (15, 15) // 15% to PDA, 15% to protocol
    } else if vault_health > 0.50 {
        (20, 10) // 20% to PDA, 10% to protocol
    } else if vault_health > 0.30 {
        (25, 5)  // 25% to PDA, 5% to protocol
    } else {
        (30, 0)  // 30% to PDA, 0% to protocol
    }
}

/// Calculates vault health as min(vault_a, vault_b) / max(vault_a, vault_b)
/// Returns a value between 0 and 1, where 1 is perfectly balanced
pub fn calculate_vault_health(amount_a: u64, amount_b: u64) -> f64 {
    if amount_a == 0 || amount_b == 0 {
        return 0.0;
    }
    
    let min_amount = amount_a.min(amount_b) as f64;
    let max_amount = amount_a.max(amount_b) as f64;
    
    min_amount / max_amount
}

/// Calculate the amount out based on exchange rate, spread, and drift
pub fn calculate_amount_out(
    amount_in: u64,
    oracle_price: u64,
    spread_bps: u16,
    drift_percentage: f64,
    source_to_target: bool, // true if converting from source to target, false otherwise
) -> Result<(u64, u64)> {
    // Oracle price is scaled by PRICE_SCALE (10^9)
    // Example: If 1 EUR = 1.1 USD, oracle_price = 1_100_000_000

    let spread = spread_bps as u64;
    let amount_in_u128 = amount_in as u128;
    
    // Apply drift to oracle price if applicable
    let adjusted_oracle_price = if source_to_target {
        // When buying target currency, decrease the exchange rate (get less target)
        let drift_adjustment = (oracle_price as f64 * drift_percentage) as u64;
        oracle_price.saturating_sub(drift_adjustment)
    } else {
        // When selling target currency, increase the exchange rate (get less source)
        let drift_adjustment = (oracle_price as f64 * drift_percentage) as u64;
        oracle_price.saturating_add(drift_adjustment)
    };

    // Calculate the amount out based on the direction
    let amount_out_before_fee = if source_to_target {
        // Source to target (e.g., EUR to USD)
        // amount_out = amount_in * adjusted_oracle_price / PRICE_SCALE
        amount_in_u128
            .checked_mul(adjusted_oracle_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(PRICE_SCALE as u128)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        // Target to source (e.g., USD to EUR)
        // amount_out = amount_in * PRICE_SCALE / adjusted_oracle_price
        amount_in_u128
            .checked_mul(PRICE_SCALE as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(adjusted_oracle_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
    };

    // Convert to u64, checking for overflow
    let amount_out_before_fee_u64 = amount_out_before_fee
        .try_into()
        .map_err(|_| ErrorCode::MathOverflow)?;

    // Calculate fee (spread * amount_out / 10000)
    let fee_amount = amount_out_before_fee_u64
        .checked_mul(spread)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate final amount out after fee
    let amount_out = amount_out_before_fee_u64
        .checked_sub(fee_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok((amount_out, fee_amount))
}

/// Calculates reward distribution for a specific LP
pub fn calculate_lp_rewards(
    lp_amount: u64,
    total_rewards: u64,
    total_deposits: u64,
) -> Result<u64> {
    if total_deposits == 0 {
        return Ok(0);
    }

    // Calculate the LP's share of rewards based on their proportion of deposits
    let lp_amount_u128 = lp_amount as u128;
    let total_rewards_u128 = total_rewards as u128;
    let total_deposits_u128 = total_deposits as u128;

    let lp_rewards = lp_amount_u128
        .checked_mul(total_rewards_u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(total_deposits_u128)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(lp_rewards as u64)
}

/// Error codes for math operations
#[error_code]
pub enum ErrorCode {
    #[msg("Math operation resulted in overflow")]
    MathOverflow,
} 