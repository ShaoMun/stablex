use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult, msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    sysvar::{rent::Rent, Sysvar},
    system_instruction,
    clock::Clock,
};
use spl_token::{
    instruction as token_instruction,
    state::{Account as TokenAccount, Mint},
};

use crate::{
    error::StablexError,
    instruction::StablexInstruction,
    state::{Pool, calculate_vault_health},
    utils::{
        validate_oracle_data, apply_price_with_spread_and_drift, 
        calculate_lp_tokens_amount, calculate_token_amounts_from_lp,
        distribute_fees, get_token_balance, get_mint_supply
    },
};

const MAX_ORACLE_AGE_SECONDS: u64 = 60; // Oracle data must be less than 1 minute old

pub struct Processor;
impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction: StablexInstruction,
    ) -> ProgramResult {
        match instruction {
            StablexInstruction::Initialize { nonce, fee_basis_points } => {
                Self::process_initialize(program_id, accounts, nonce, fee_basis_points)
            }
            StablexInstruction::AddLiquidity { amount_a, amount_b, min_lp_tokens } => {
                Self::process_add_liquidity(program_id, accounts, amount_a, amount_b, min_lp_tokens)
            }
            StablexInstruction::RemoveLiquidity { lp_tokens, min_amount_a, min_amount_b } => {
                Self::process_remove_liquidity(program_id, accounts, lp_tokens, min_amount_a, min_amount_b)
            }
            StablexInstruction::Swap { amount_in, minimum_amount_out } => {
                Self::process_swap(program_id, accounts, amount_in, minimum_amount_out)
            }
            StablexInstruction::ClaimRewards {} => {
                Self::process_claim_rewards(program_id, accounts)
            }
        }
    }

    fn process_initialize(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        nonce: u8,
        fee_basis_points: u16,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        let authority_info = next_account_info(account_info_iter)?;
        let pool_info = next_account_info(account_info_iter)?;
        let token_a_vault_info = next_account_info(account_info_iter)?;
        let token_b_vault_info = next_account_info(account_info_iter)?;
        let token_a_mint_info = next_account_info(account_info_iter)?;
        let token_b_mint_info = next_account_info(account_info_iter)?;
        let oracle_info = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        
        // Check if the pool is already initialized
        if pool_info.owner != program_id {
            msg!("Pool account does not have the correct program id");
            return Err(ProgramError::IncorrectProgramId);
        }
        
        // Only the authority should be able to initialize
        if !authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        // Check rent exemption
        let rent = &Rent::from_account_info(rent_info)?;
        if !rent.is_exempt(pool_info.lamports(), pool_info.data_len()) {
            return Err(StablexError::NotRentExempt.into());
        }
        
        // Check token vaults are valid and have correct mints
        let token_a_vault = TokenAccount::unpack(&token_a_vault_info.data.borrow())?;
        let token_b_vault = TokenAccount::unpack(&token_b_vault_info.data.borrow())?;
        
        if token_a_vault.mint != *token_a_mint_info.key {
            return Err(StablexError::InvalidTokenAccount.into());
        }
        
        if token_b_vault.mint != *token_b_mint_info.key {
            return Err(StablexError::InvalidTokenAccount.into());
        }
        
        // Verify oracle data is valid
        let (pda, _) = Pubkey::find_program_address(&[&pool_info.key.to_bytes()[..32]], program_id);
        
        // Create PDA owned fee accounts
        let seeds = &[&pool_info.key.to_bytes()[..32], &[nonce]];
        
        // Derive PDA addresses for fee accounts
        let (pda_fee_account_a, _) = Pubkey::find_program_address(
            &[b"fee_a", &pool_info.key.to_bytes()[..32]],
            program_id,
        );
        
        let (pda_fee_account_b, _) = Pubkey::find_program_address(
            &[b"fee_b", &pool_info.key.to_bytes()[..32]],
            program_id,
        );
        
        let (protocol_fee_account_a, _) = Pubkey::find_program_address(
            &[b"protocol_fee_a", &pool_info.key.to_bytes()[..32]],
            program_id,
        );
        
        let (protocol_fee_account_b, _) = Pubkey::find_program_address(
            &[b"protocol_fee_b", &pool_info.key.to_bytes()[..32]],
            program_id,
        );
        
        // Create the LP token mint
        let (lp_mint, _) = Pubkey::find_program_address(
            &[b"lp_mint", &pool_info.key.to_bytes()[..32]],
            program_id,
        );
        
        // Initialize the pool state
        let mut pool_data = Pool {
            is_initialized: true,
            nonce,
            token_a_mint: *token_a_mint_info.key,
            token_b_mint: *token_b_mint_info.key,
            token_a_vault: *token_a_vault_info.key,
            token_b_vault: *token_b_vault_info.key,
            lp_mint,
            oracle: *oracle_info.key,
            fee_basis_points,
            pda_fee_account_a,
            pda_fee_account_b,
            protocol_fee_account_a,
            protocol_fee_account_b,
            last_oracle_price: 0,
            last_update_timestamp: 0,
        };
        
        // First update of oracle data
        let (price, _) = validate_oracle_data(oracle_info, &pool_data, MAX_ORACLE_AGE_SECONDS)?;
        
        // Record oracle data
        let clock = Clock::get()?;
        pool_data.last_oracle_price = price;
        pool_data.last_update_timestamp = clock.unix_timestamp as u64;
        
        // Save pool state
        Pool::pack(pool_data, &mut pool_info.data.borrow_mut())?;
        
        msg!("StableX: Pool initialized successfully");
        Ok(())
    }

    fn process_add_liquidity(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_a: u64,
        amount_b: u64,
        min_lp_tokens: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        let lp_authority_info = next_account_info(account_info_iter)?;
        let pool_info = next_account_info(account_info_iter)?;
        let lp_token_account_info = next_account_info(account_info_iter)?;
        let lp_source_a_info = next_account_info(account_info_iter)?;
        let lp_source_b_info = next_account_info(account_info_iter)?;
        let token_a_vault_info = next_account_info(account_info_iter)?;
        let token_b_vault_info = next_account_info(account_info_iter)?;
        let lp_mint_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        
        if !lp_authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        let pool_data = Pool::unpack(&pool_info.data.borrow())?;
        if !pool_data.is_initialized {
            return Err(StablexError::Unauthorized.into());
        }
        
        // Verify provided accounts match the pool
        if pool_data.token_a_vault != *token_a_vault_info.key || 
           pool_data.token_b_vault != *token_b_vault_info.key ||
           pool_data.lp_mint != *lp_mint_info.key {
            return Err(StablexError::InvalidTokenAccount.into());
        }
        
        // Calculate the LP tokens to mint
        let vault_a_amount = get_token_balance(token_a_vault_info)?;
        let vault_b_amount = get_token_balance(token_b_vault_info)?;
        let lp_supply = get_mint_supply(lp_mint_info)?;
        
        let lp_tokens_amount = calculate_lp_tokens_amount(
            amount_a,
            amount_b,
            vault_a_amount,
            vault_b_amount,
            lp_supply,
        )?;
        
        if lp_tokens_amount < min_lp_tokens {
            return Err(StablexError::SlippageToleranceExceeded.into());
        }
        
        // Transfer tokens from LP to the vaults
        let transfer_a_ix = token_instruction::transfer(
            token_program_info.key,
            lp_source_a_info.key,
            token_a_vault_info.key,
            lp_authority_info.key,
            &[],
            amount_a,
        )?;
        
        invoke(
            &transfer_a_ix,
            &[
                lp_source_a_info.clone(),
                token_a_vault_info.clone(),
                lp_authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        let transfer_b_ix = token_instruction::transfer(
            token_program_info.key,
            lp_source_b_info.key,
            token_b_vault_info.key,
            lp_authority_info.key,
            &[],
            amount_b,
        )?;
        
        invoke(
            &transfer_b_ix,
            &[
                lp_source_b_info.clone(),
                token_b_vault_info.clone(),
                lp_authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        // Mint LP tokens to the LP
        let authority_seeds = [
            &pool_info.key.to_bytes()[..32],
            &[pool_data.nonce],
        ];
        
        let mint_to_ix = token_instruction::mint_to(
            token_program_info.key,
            lp_mint_info.key,
            lp_token_account_info.key,
            &Pubkey::create_program_address(&authority_seeds, program_id)?,
            &[],
            lp_tokens_amount,
        )?;
        
        invoke_signed(
            &mint_to_ix,
            &[
                lp_mint_info.clone(),
                lp_token_account_info.clone(),
                token_program_info.clone(),
            ],
            &[&authority_seeds],
        )?;
        
        msg!("StableX: Liquidity added successfully");
        Ok(())
    }

    fn process_remove_liquidity(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        lp_tokens: u64,
        min_amount_a: u64,
        min_amount_b: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        let lp_authority_info = next_account_info(account_info_iter)?;
        let pool_info = next_account_info(account_info_iter)?;
        let lp_token_account_info = next_account_info(account_info_iter)?;
        let lp_dest_a_info = next_account_info(account_info_iter)?;
        let lp_dest_b_info = next_account_info(account_info_iter)?;
        let token_a_vault_info = next_account_info(account_info_iter)?;
        let token_b_vault_info = next_account_info(account_info_iter)?;
        let lp_mint_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        
        if !lp_authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        let pool_data = Pool::unpack(&pool_info.data.borrow())?;
        if !pool_data.is_initialized {
            return Err(StablexError::Unauthorized.into());
        }
        
        // Verify provided accounts match the pool
        if pool_data.token_a_vault != *token_a_vault_info.key || 
           pool_data.token_b_vault != *token_b_vault_info.key ||
           pool_data.lp_mint != *lp_mint_info.key {
            return Err(StablexError::InvalidTokenAccount.into());
        }
        
        // Calculate the token amounts to return
        let vault_a_amount = get_token_balance(token_a_vault_info)?;
        let vault_b_amount = get_token_balance(token_b_vault_info)?;
        let lp_supply = get_mint_supply(lp_mint_info)?;
        
        let (amount_a, amount_b) = calculate_token_amounts_from_lp(
            lp_tokens,
            vault_a_amount,
            vault_b_amount,
            lp_supply,
        )?;
        
        if amount_a < min_amount_a || amount_b < min_amount_b {
            return Err(StablexError::SlippageToleranceExceeded.into());
        }
        
        // Burn the LP tokens
        let authority_seeds = [
            &pool_info.key.to_bytes()[..32],
            &[pool_data.nonce],
        ];
        
        let burn_ix = token_instruction::burn(
            token_program_info.key,
            lp_token_account_info.key,
            lp_mint_info.key,
            lp_authority_info.key,
            &[],
            lp_tokens,
        )?;
        
        invoke(
            &burn_ix,
            &[
                lp_token_account_info.clone(),
                lp_mint_info.clone(),
                lp_authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        // Transfer tokens from vaults to LP
        let transfer_a_ix = token_instruction::transfer(
            token_program_info.key,
            token_a_vault_info.key,
            lp_dest_a_info.key,
            &Pubkey::create_program_address(&authority_seeds, program_id)?,
            &[],
            amount_a,
        )?;
        
        invoke_signed(
            &transfer_a_ix,
            &[
                token_a_vault_info.clone(),
                lp_dest_a_info.clone(),
                token_program_info.clone(),
            ],
            &[&authority_seeds],
        )?;
        
        let transfer_b_ix = token_instruction::transfer(
            token_program_info.key,
            token_b_vault_info.key,
            lp_dest_b_info.key,
            &Pubkey::create_program_address(&authority_seeds, program_id)?,
            &[],
            amount_b,
        )?;
        
        invoke_signed(
            &transfer_b_ix,
            &[
                token_b_vault_info.clone(),
                lp_dest_b_info.clone(),
                token_program_info.clone(),
            ],
            &[&authority_seeds],
        )?;
        
        msg!("StableX: Liquidity removed successfully");
        Ok(())
    }

    fn process_swap(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        let user_authority_info = next_account_info(account_info_iter)?;
        let pool_info = next_account_info(account_info_iter)?;
        let user_source_info = next_account_info(account_info_iter)?;
        let user_dest_info = next_account_info(account_info_iter)?;
        let source_vault_info = next_account_info(account_info_iter)?;
        let dest_vault_info = next_account_info(account_info_iter)?;
        let pda_fee_dest_info = next_account_info(account_info_iter)?;
        let protocol_fee_dest_info = next_account_info(account_info_iter)?;
        let oracle_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        
        if !user_authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        let mut pool_data = Pool::unpack(&pool_info.data.borrow())?;
        if !pool_data.is_initialized {
            return Err(StablexError::Unauthorized.into());
        }
        
        // Determine if we're swapping A->B or B->A
        let is_a_to_b;
        
        if *source_vault_info.key == pool_data.token_a_vault && 
           *dest_vault_info.key == pool_data.token_b_vault {
            // A to B swap
            is_a_to_b = true;
            
            // Verify fee accounts
            if *pda_fee_dest_info.key != pool_data.pda_fee_account_a || 
               *protocol_fee_dest_info.key != pool_data.protocol_fee_account_a {
                return Err(StablexError::InvalidTokenAccount.into());
            }
        } else if *source_vault_info.key == pool_data.token_b_vault && 
                  *dest_vault_info.key == pool_data.token_a_vault {
            // B to A swap
            is_a_to_b = false;
            
            // Verify fee accounts
            if *pda_fee_dest_info.key != pool_data.pda_fee_account_b || 
               *protocol_fee_dest_info.key != pool_data.protocol_fee_account_b {
                return Err(StablexError::InvalidTokenAccount.into());
            }
        } else {
            return Err(StablexError::InvalidTokenAccount.into());
        }
        
        // Get current vault balances
        let source_vault_amount = get_token_balance(source_vault_info)?;
        let dest_vault_amount = get_token_balance(dest_vault_info)?;
        
        // Calculate vault health
        let vault_health = calculate_vault_health(
            source_vault_amount,
            dest_vault_amount,
        );
        
        // Get oracle price
        let (oracle_price, price_exponent) = validate_oracle_data(
            oracle_info,
            &pool_data,
            MAX_ORACLE_AGE_SECONDS,
        )?;
        
        // Calculate output amount with spread and drift
        let amount_out = apply_price_with_spread_and_drift(
            amount_in,
            oracle_price,
            price_exponent,
            vault_health,
            is_a_to_b,
        )?;
        
        if amount_out < minimum_amount_out {
            return Err(StablexError::SlippageToleranceExceeded.into());
        }
        
        // Calculate fee amount (from the input amount)
        let fee_basis_points = pool_data.fee_basis_points as u64;
        let fee_amount = amount_in.checked_mul(fee_basis_points)
            .ok_or(StablexError::AmountOverflow)?
            .checked_div(10000)
            .ok_or(StablexError::AmountOverflow)?;
        
        // Calculate how to split the fee between PDA and protocol
        let (pda_fee, protocol_fee) = distribute_fees(fee_amount, vault_health)?;
        
        // The actual amount to send to the vault
        let vault_amount = amount_in.checked_sub(fee_amount)
            .ok_or(StablexError::AmountOverflow)?;
        
        // Transfer tokens from user to various destinations
        let authority_seeds = [
            &pool_info.key.to_bytes()[..32],
            &[pool_data.nonce],
        ];
        
        // Transfer tokens from user to source vault (minus fees)
        let transfer_to_vault_ix = token_instruction::transfer(
            token_program_info.key,
            user_source_info.key,
            source_vault_info.key,
            user_authority_info.key,
            &[],
            vault_amount,
        )?;
        
        invoke(
            &transfer_to_vault_ix,
            &[
                user_source_info.clone(),
                source_vault_info.clone(),
                user_authority_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        // Transfer fees to PDA fee account
        if pda_fee > 0 {
            let transfer_pda_fee_ix = token_instruction::transfer(
                token_program_info.key,
                user_source_info.key,
                pda_fee_dest_info.key,
                user_authority_info.key,
                &[],
                pda_fee,
            )?;
            
            invoke(
                &transfer_pda_fee_ix,
                &[
                    user_source_info.clone(),
                    pda_fee_dest_info.clone(),
                    user_authority_info.clone(),
                    token_program_info.clone(),
                ],
            )?;
        }
        
        // Transfer fees to protocol fee account
        if protocol_fee > 0 {
            let transfer_protocol_fee_ix = token_instruction::transfer(
                token_program_info.key,
                user_source_info.key,
                protocol_fee_dest_info.key,
                user_authority_info.key,
                &[],
                protocol_fee,
            )?;
            
            invoke(
                &transfer_protocol_fee_ix,
                &[
                    user_source_info.clone(),
                    protocol_fee_dest_info.clone(),
                    user_authority_info.clone(),
                    token_program_info.clone(),
                ],
            )?;
        }
        
        // Transfer tokens from destination vault to user
        let transfer_to_user_ix = token_instruction::transfer(
            token_program_info.key,
            dest_vault_info.key,
            user_dest_info.key,
            &Pubkey::create_program_address(&authority_seeds, program_id)?,
            &[],
            amount_out,
        )?;
        
        invoke_signed(
            &transfer_to_user_ix,
            &[
                dest_vault_info.clone(),
                user_dest_info.clone(),
                token_program_info.clone(),
            ],
            &[&authority_seeds],
        )?;
        
        // Update oracle data in the pool
        let clock = Clock::get()?;
        pool_data.last_oracle_price = oracle_price;
        pool_data.last_update_timestamp = clock.unix_timestamp as u64;
        
        // Save pool state
        Pool::pack(pool_data, &mut pool_info.data.borrow_mut())?;
        
        msg!("StableX: Swap completed successfully");
        Ok(())
    }

    fn process_claim_rewards(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        
        let lp_authority_info = next_account_info(account_info_iter)?;
        let pool_info = next_account_info(account_info_iter)?;
        let lp_token_account_info = next_account_info(account_info_iter)?;
        let lp_dest_fee_a_info = next_account_info(account_info_iter)?;
        let lp_dest_fee_b_info = next_account_info(account_info_iter)?;
        let pda_fee_source_a_info = next_account_info(account_info_iter)?;
        let pda_fee_source_b_info = next_account_info(account_info_iter)?;
        let token_program_info = next_account_info(account_info_iter)?;
        
        if !lp_authority_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        
        let pool_data = Pool::unpack(&pool_info.data.borrow())?;
        if !pool_data.is_initialized {
            return Err(StablexError::Unauthorized.into());
        }
        
        // Verify fee accounts
        if pool_data.pda_fee_account_a != *pda_fee_source_a_info.key || 
           pool_data.pda_fee_account_b != *pda_fee_source_b_info.key {
            return Err(StablexError::InvalidTokenAccount.into());
        }
        
        // Get LP token amount
        let lp_token_account = TokenAccount::unpack(&lp_token_account_info.data.borrow())?;
        let lp_token_amount = lp_token_account.amount;
        
        if lp_token_amount == 0 {
            return Err(StablexError::InsufficientLiquidity.into());
        }
        
        // Get total LP supply
        let lp_mint_info = next_account_info(account_info_iter)?;
        let lp_supply = get_mint_supply(lp_mint_info)?;
        
        // Calculate share of LP fees
        let share = lp_token_amount as f64 / lp_supply as f64;
        
        // Get fee amounts in the PDA accounts
        let fee_a_amount = get_token_balance(pda_fee_source_a_info)?;
        let fee_b_amount = get_token_balance(pda_fee_source_b_info)?;
        
        let lp_fee_a = (fee_a_amount as f64 * share) as u64;
        let lp_fee_b = (fee_b_amount as f64 * share) as u64;
        
        // Transfer fees to LP
        let authority_seeds = [
            &pool_info.key.to_bytes()[..32],
            &[pool_data.nonce],
        ];
        
        if lp_fee_a > 0 {
            let transfer_fee_a_ix = token_instruction::transfer(
                token_program_info.key,
                pda_fee_source_a_info.key,
                lp_dest_fee_a_info.key,
                &Pubkey::create_program_address(&authority_seeds, program_id)?,
                &[],
                lp_fee_a,
            )?;
            
            invoke_signed(
                &transfer_fee_a_ix,
                &[
                    pda_fee_source_a_info.clone(),
                    lp_dest_fee_a_info.clone(),
                    token_program_info.clone(),
                ],
                &[&authority_seeds],
            )?;
        }
        
        if lp_fee_b > 0 {
            let transfer_fee_b_ix = token_instruction::transfer(
                token_program_info.key,
                pda_fee_source_b_info.key,
                lp_dest_fee_b_info.key,
                &Pubkey::create_program_address(&authority_seeds, program_id)?,
                &[],
                lp_fee_b,
            )?;
            
            invoke_signed(
                &transfer_fee_b_ix,
                &[
                    pda_fee_source_b_info.clone(),
                    lp_dest_fee_b_info.clone(),
                    token_program_info.clone(),
                ],
                &[&authority_seeds],
            )?;
        }
        
        msg!("StableX: Rewards claimed successfully");
        Ok(())
    }
}