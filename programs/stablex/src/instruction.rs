use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{program_error::ProgramError, pubkey::Pubkey};
use crate::error::StablexError;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq)]
pub enum StablexInstruction {
    /// Initialize a new StableX Pool
    /// 
    /// Accounts expected:
    /// 0. `[signer]` Pool authority
    /// 1. `[writable]` Pool state account
    /// 2. `[writable]` Token A vault account
    /// 3. `[writable]` Token B vault account
    /// 4. `[]` Token A mint
    /// 5. `[]` Token B mint
    /// 6. `[]` Oracle account for this FX pair
    /// 7. `[]` Rent sysvar
    /// 8. `[]` Token program
    Initialize {
        nonce: u8,
        fee_basis_points: u16,
    },

    /// Add liquidity to a pool
    /// 
    /// Accounts expected:
    /// 0. `[signer]` LP authority
    /// 1. `[]` Pool state account
    /// 2. `[writable]` LP token account (to receive LP tokens)
    /// 3. `[writable]` LP source token A account
    /// 4. `[writable]` LP source token B account
    /// 5. `[writable]` Token A vault account
    /// 6. `[writable]` Token B vault account 
    /// 7. `[writable]` LP mint account
    /// 8. `[]` Token program
    AddLiquidity {
        amount_a: u64,
        amount_b: u64,
        min_lp_tokens: u64,
    },

    /// Remove liquidity from a pool
    /// 
    /// Accounts expected:
    /// 0. `[signer]` LP authority
    /// 1. `[]` Pool state account
    /// 2. `[writable]` LP token account (to burn LP tokens)
    /// 3. `[writable]` LP destination token A account
    /// 4. `[writable]` LP destination token B account
    /// 5. `[writable]` Token A vault account
    /// 6. `[writable]` Token B vault account
    /// 7. `[writable]` LP mint account
    /// 8. `[]` Token program
    RemoveLiquidity {
        lp_tokens: u64,
        min_amount_a: u64,
        min_amount_b: u64,
    },

    /// Swap tokens
    /// 
    /// Accounts expected:
    /// 0. `[signer]` User authority
    /// 1. `[]` Pool state account
    /// 2. `[writable]` User source token account
    /// 3. `[writable]` User destination token account
    /// 4. `[writable]` Source vault account
    /// 5. `[writable]` Destination vault account
    /// 6. `[writable]` Fee destination account (PDA)
    /// 7. `[writable]` Protocol fee destination account
    /// 8. `[]` Oracle account for this FX pair
    /// 9. `[]` Token program
    Swap {
        amount_in: u64,
        minimum_amount_out: u64,
    },

    /// Claim LP rewards
    /// 
    /// Accounts expected:
    /// 0. `[signer]` LP authority
    /// 1. `[]` Pool state account
    /// 2. `[writable]` LP token account
    /// 3. `[writable]` LP destination token A account for fee
    /// 4. `[writable]` LP destination token B account for fee
    /// 5. `[writable]` Fee source account A (PDA)
    /// 6. `[writable]` Fee source account B (PDA)
    /// 7. `[]` Token program
    ClaimRewards {},
}

impl StablexInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, rest) = input.split_first().ok_or(StablexError::InvalidInstruction)?;
        
        Ok(match tag {
            0 => Self::Initialize {
                nonce: rest[0],
                fee_basis_points: u16::from_le_bytes([rest[1], rest[2]]),
            },
            1 => {
                let (amount_a, rest) = Self::unpack_u64(rest)?;
                let (amount_b, rest) = Self::unpack_u64(rest)?;
                let (min_lp_tokens, _) = Self::unpack_u64(rest)?;
                
                Self::AddLiquidity {
                    amount_a,
                    amount_b,
                    min_lp_tokens,
                }
            },
            2 => {
                let (lp_tokens, rest) = Self::unpack_u64(rest)?;
                let (min_amount_a, rest) = Self::unpack_u64(rest)?;
                let (min_amount_b, _) = Self::unpack_u64(rest)?;
                
                Self::RemoveLiquidity {
                    lp_tokens,
                    min_amount_a,
                    min_amount_b,
                }
            },
            3 => {
                let (amount_in, rest) = Self::unpack_u64(rest)?;
                let (minimum_amount_out, _) = Self::unpack_u64(rest)?;
                
                Self::Swap {
                    amount_in,
                    minimum_amount_out,
                }
            },
            4 => Self::ClaimRewards {},
            _ => return Err(StablexError::InvalidInstruction.into()),
        })
    }

    fn unpack_u64(input: &[u8]) -> Result<(u64, &[u8]), ProgramError> {
        if input.len() < 8 {
            return Err(StablexError::InvalidInstruction.into());
        }
        let (amount_bytes, rest) = input.split_at(8);
        let amount = u64::from_le_bytes(amount_bytes.try_into().unwrap());
        Ok((amount, rest))
    }
} 