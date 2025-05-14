use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod fx_vault_dex {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_name: String,
        nonce: u8,
        fee_basis_points: u16
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, vault_name, nonce, fee_basis_points)
    }

    pub fn deposit_liquidity(
        ctx: Context<DepositLiquidity>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_liquidity::handler(ctx, amount)
    }

    pub fn withdraw_liquidity(
        ctx: Context<WithdrawLiquidity>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_liquidity::handler(ctx, amount)
    }

    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<()> {
        instructions::swap::handler(ctx, amount_in, minimum_amount_out)
    }

    pub fn distribute_incentives(
        ctx: Context<DistributeIncentives>,
    ) -> Result<()> {
        instructions::distribute_incentives::handler(ctx)
    }
    
    pub fn distribute_protocol_fees(
        ctx: Context<DistributeProtocolFees>,
    ) -> Result<()> {
        instructions::distribute_protocol_fees::handler(ctx)
    }
    
    pub fn rebalance_vault(
        ctx: Context<RebalanceVault>,
        amount: u64,
    ) -> Result<()> {
        instructions::rebalance_vault::handler(ctx, amount)
    }
} 