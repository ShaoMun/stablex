use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    program_pack::Pack, pubkey::Pubkey, program::invoke_signed,
    sysvar::{clock::Clock, Sysvar},
};
use spl_token::state::{Account as TokenAccount, Mint};
use pyth_sdk_solana::state::PriceAccount;

use crate::error::StablexError;
use crate::state::{Pool, calculate_vault_health, calculate_spread, calculate_drift};

pub fn validate_oracle_data<'a>(
    oracle_account: &AccountInfo<'a>,
    pool: &Pool,
    max_age_in_seconds: u64,
) -> Result<(u64, i8), ProgramError> {
    // Get the current timestamp
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp as u64;

    // Parse the price account
    let price_account = match PriceAccount::new(oracle_account)? {
        Some(price_account) => price_account,
        None => return Err(StablexError::InvalidOracleAccount.into()),
    };

    let price_info = price_account.get_price_unchecked();
    
    // Check if the price is valid and not stale
    let last_update_timestamp = price_info.publish_time as u64;
    if current_timestamp - last_update_timestamp > max_age_in_seconds {
        return Err(StablexError::StaleOracleData.into());
    }
    
    // Return the price and exponent (e.g., price = 1234, exponent = -2 means 12.34)
    Ok((price_info.price as u64, price_info.exponent))
}

pub fn apply_price_with_spread_and_drift(
    amount_in: u64,
    oracle_price: u64,
    price_exponent: i8,
    vault_health: f64,
    is_a_to_b: bool,
) -> Result<u64, ProgramError> {
    // Calculate the spread and drift
    let spread = calculate_spread(vault_health);
    let drift = calculate_drift(vault_health);
    
    // Convert the price to a floating point number with correct scaling
    let scale_factor = 10_f64.powi(price_exponent as i32);
    let base_price = (oracle_price as f64) * scale_factor;
    
    // Apply drift to the price (moves price in favor of balanced pools)
    let drifted_price = if is_a_to_b {
        base_price * (1.0 - drift)
    } else {
        base_price * (1.0 + drift)
    };
    
    // Apply spread to the price (the fee users pay for the swap)
    let final_price = if is_a_to_b {
        drifted_price * (1.0 - spread) 
    } else {
        drifted_price * (1.0 + spread)
    };
    
    // Calculate output amount
    let amount_out = if is_a_to_b {
        (amount_in as f64 * final_price) as u64
    } else {
        (amount_in as f64 / final_price) as u64
    };
    
    if amount_out == 0 {
        return Err(StablexError::InsufficientLiquidity.into());
    }
    
    Ok(amount_out)
}

pub fn calculate_lp_tokens_amount(
    amount_a: u64,
    amount_b: u64,
    vault_a_amount: u64,
    vault_b_amount: u64,
    lp_supply: u64,
) -> Result<u64, ProgramError> {
    if lp_supply == 0 {
        // Initial liquidity provision - use geometric mean
        Ok((amount_a as f64 * amount_b as f64).sqrt() as u64)
    } else {
        // Calculate share based on the proportion of assets added
        let share_a = (amount_a as f64 / vault_a_amount as f64) * lp_supply as f64;
        let share_b = (amount_b as f64 / vault_b_amount as f64) * lp_supply as f64;
        
        // Use the minimum share to ensure user doesn't get more than deserved
        Ok(share_a.min(share_b) as u64)
    }
}

pub fn calculate_token_amounts_from_lp(
    lp_tokens: u64,
    vault_a_amount: u64,
    vault_b_amount: u64,
    lp_supply: u64,
) -> Result<(u64, u64), ProgramError> {
    if lp_tokens > lp_supply {
        return Err(StablexError::InsufficientLiquidity.into());
    }
    
    let share = lp_tokens as f64 / lp_supply as f64;
    
    let amount_a = (vault_a_amount as f64 * share) as u64;
    let amount_b = (vault_b_amount as f64 * share) as u64;
    
    if amount_a == 0 || amount_b == 0 {
        return Err(StablexError::InsufficientLiquidity.into());
    }
    
    Ok((amount_a, amount_b))
}

pub fn distribute_fees(
    fee_amount: u64,
    vault_health: f64,
) -> Result<(u64, u64), ProgramError> {
    let (pda_percentage, protocol_percentage) = crate::state::calculate_fee_allocation(vault_health);
    
    let pda_amount = (fee_amount as f64 * pda_percentage) as u64;
    let protocol_amount = (fee_amount as f64 * protocol_percentage) as u64;
    
    Ok((pda_amount, protocol_amount))
}

pub fn get_token_balance(token_account: &AccountInfo) -> Result<u64, ProgramError> {
    let token_account_data = TokenAccount::unpack(&token_account.data.borrow())?;
    Ok(token_account_data.amount)
}

pub fn get_mint_supply(mint_account: &AccountInfo) -> Result<u64, ProgramError> {
    let mint_data = Mint::unpack(&mint_account.data.borrow())?;
    Ok(mint_data.supply)
} 