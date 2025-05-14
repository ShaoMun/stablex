use anchor_lang::prelude::*;

// Seeds for PDAs
pub const VAULT_ACCOUNT_SEED: &[u8] = b"vault-account";
pub const LP_POSITION_SEED: &[u8] = b"lp-position";
pub const VAULT_AUTHORITY_SEED: &[u8] = b"vault-authority";
pub const REWARD_TRACKER_SEED: &[u8] = b"reward-tracker";

// Math constants
pub const PRICE_SCALE: u64 = 1_000_000_000; // 10^9 - Oracle price scaling factor
pub const PRECISION: u64 = 1_000_000_000;   // 10^9 - General precision for calculations

// Fee constants
pub const MIN_SPREAD_BPS: u16 = 3;         // 0.03% minimum spread
pub const MAX_SPREAD_BPS: u16 = 50;        // 0.5% maximum spread

// Spread formula constants
pub const SPREAD_SLOPE: f64 = 0.002833;    // 0.2833% slope factor for spread calculation

// Drift formula constants
pub const DRIFT_SLOPE: f64 = 0.008333;     // 0.8333% slope factor for drift calculation

// Fee allocation constants
pub const LP_FEE_PERCENT: u8 = 70;         // 70% of fees go to LPs
// The remaining 30% is split between PDA and Protocol according to vault health tiers 

// Withdrawal penalty fee schedule (in basis points)
pub const WITHDRAWAL_FEE_TIER_1: u16 = 200;  // 2.00% if withdrawn within 60 hours
pub const WITHDRAWAL_FEE_TIER_2: u16 = 150;  // 1.50% if withdrawn within 60-120 hours
pub const WITHDRAWAL_FEE_TIER_3: u16 = 100;  // 1.00% if withdrawn within 120-180 hours
pub const WITHDRAWAL_FEE_TIER_4: u16 = 50;   // 0.50% if withdrawn within 180-240 hours
pub const WITHDRAWAL_FEE_TIER_5: u16 = 0;    // 0.00% if withdrawn after 240 hours

// Time thresholds for withdrawal penalties (in seconds)
pub const HOURS_60_IN_SECONDS: i64 = 60 * 60 * 60;    // 60 hours in seconds
pub const HOURS_120_IN_SECONDS: i64 = 120 * 60 * 60;  // 120 hours in seconds
pub const HOURS_180_IN_SECONDS: i64 = 180 * 60 * 60;  // 180 hours in seconds
pub const HOURS_240_IN_SECONDS: i64 = 240 * 60 * 60;  // 240 hours in seconds 