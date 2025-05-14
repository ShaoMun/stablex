use anchor_lang::prelude::*;
use pyth_sdk_solana::load_price_feed_from_account_info;
use crate::state::constants::PRICE_SCALE;

/// Get current price from Pyth oracle
pub fn get_oracle_price(oracle_account_info: &AccountInfo) -> Result<u64> {
    // Load the price feed from the account
    let price_feed = load_price_feed_from_account_info(oracle_account_info)
        .map_err(|_| ErrorCode::InvalidOracleAccount)?;
    
    // Get the current price
    let price = price_feed.get_current_price()
        .ok_or(ErrorCode::StaleOraclePrice)?;
    
    // Check if price is negative
    if price.price < 0 {
        return Err(ErrorCode::NegativeOraclePrice.into());
    }
    
    // Convert price to our expected format
    // Pyth prices include a specific exponent, so we need to adjust it
    let exponent = price.expo;
    let price_value = price.price as u64;
    
    // Adjust price to match our PRICE_SCALE (10^9)
    // If exponent is -6, and our scale is 10^9, we multiply by 10^3
    // If exponent is -9, and our scale is 10^9, we match exactly
    let adjusted_price = if exponent < 0 {
        let exponent_abs = (-exponent) as u32;
        
        if exponent_abs < 9 {
            // Need to multiply price
            let multiplier = 10u64.pow(9 - exponent_abs);
            price_value.checked_mul(multiplier).ok_or(ErrorCode::MathOverflow)?
        } else if exponent_abs > 9 {
            // Need to divide price
            let divisor = 10u64.pow(exponent_abs - 9);
            price_value.checked_div(divisor).ok_or(ErrorCode::MathOverflow)?
        } else {
            // Exponent is exactly -9, no adjustment needed
            price_value
        }
    } else {
        // Positive exponent (rare for FX)
        let multiplier = 10u64.pow(9 + exponent as u32);
        price_value.checked_mul(multiplier).ok_or(ErrorCode::MathOverflow)?
    };
    
    Ok(adjusted_price)
}

/// Error codes for oracle operations
#[error_code]
pub enum ErrorCode {
    #[msg("Invalid oracle account")]
    InvalidOracleAccount,
    
    #[msg("Oracle price is too old")]
    StaleOraclePrice,
    
    #[msg("Oracle returned a negative price")]
    NegativeOraclePrice,
    
    #[msg("Math operation resulted in overflow")]
    MathOverflow,
} 