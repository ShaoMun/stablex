use solana_program::{program_error::ProgramError, decode_error::DecodeError};
use thiserror::Error;
use num_derive::FromPrimitive;

#[derive(Error, Debug, Copy, Clone, FromPrimitive)]
pub enum StablexError {
    #[error("Invalid instruction")]
    InvalidInstruction,
    
    #[error("Not rent exempt")]
    NotRentExempt,
    
    #[error("Expected amount mismatch")]
    ExpectedAmountMismatch,
    
    #[error("Amount overflow")]
    AmountOverflow,
    
    #[error("Invalid vault health")]
    InvalidVaultHealth,
    
    #[error("Invalid token account")]
    InvalidTokenAccount,
    
    #[error("Insufficient liquidity")]
    InsufficientLiquidity,
    
    #[error("Oracle data is stale")]
    StaleOracleData,
    
    #[error("Invalid oracle account")]
    InvalidOracleAccount,
    
    #[error("Slippage tolerance exceeded")]
    SlippageToleranceExceeded,
    
    #[error("Unauthorized access")]
    Unauthorized,
    
    #[error("Already initialized")]
    AlreadyInitialized,
}

impl From<StablexError> for ProgramError {
    fn from(e: StablexError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for StablexError {
    fn type_of() -> &'static str {
        "StablexError"
    }
} 