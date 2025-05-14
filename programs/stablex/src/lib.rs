use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    program_pack::{IsInitialized, Pack},
    sysvar::{rent::Rent, Sysvar},
    program::invoke_signed,
};
use borsh::{BorshDeserialize, BorshSerialize};
use thiserror::Error;

pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;
pub mod utils;

use crate::instruction::StablexInstruction;
use crate::processor::Processor;

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("StableX: Processing instruction");
    
    let instruction = StablexInstruction::unpack(instruction_data)?;
    
    Processor::process(program_id, accounts, instruction)
} 