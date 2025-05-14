# 💱 FX Vault DEX

A Solana program for FX stablecoin swaps and liquidity provision built with Anchor.

## Overview

FX Vault DEX is designed to provide efficient foreign exchange swaps between different stablecoins while allowing users to earn fees by providing liquidity to individual vaults. The system uses real-world FX rates from oracles and dynamically adjusts spreads and drift based on vault balance to maintain stability.

## Key Features

- **Single-sided LP positions**: LPs provide liquidity to a single vault of their chosen stablecoin
- **Dynamic spreads and drift**: Fees and rates adjust based on vault health/imbalance
- **Oracle-based pricing**: Uses Pyth price oracles for real-time FX rates
- **Proportional rewards**: LPs earn their share of collected spread fees
- **Automatic rebalancing**: PDA treasury can rebalance vaults based on health metrics
- **Early withdrawal penalties**: Time-based penalty system to discourage short-term liquidity provision

## Architecture

### Accounts

- `VaultAccount` - Stores metadata and financial data for a single stablecoin vault
- `LPPosition` - Tracks a user's LP position and rewards in a vault
- `RewardTracker` - Accumulates and distributes rewards to LPs

### Instructions

1. `initialize_vault` - Create a new vault for a specific stablecoin
2. `deposit_liquidity` - LPs deposit stablecoins into a vault
3. `withdraw_liquidity` - LPs withdraw their capital from a vault (with potential early withdrawal penalties)
4. `swap` - Users swap between two stablecoins based on FX rate, dynamic spread, and drift
5. `distribute_incentives` - LPs claim their proportional spread fees
6. `distribute_protocol_fees` - Distribute fees to protocol and PDA treasuries
7. `rebalance_vault` - PDA rebalances vaults when health deteriorates

## Vaults vs Traditional Pools

Unlike traditional AMMs with trading pairs (e.g., USDC/USDT), this DEX uses separate vaults for each currency. When swapping:

1. User's source tokens go into source vault
2. Target tokens come out of target vault
3. Oracle provides the exchange rate
4. Spreads and drift based on vault imbalance are applied
5. Fees accumulate in the target vault for LPs and treasuries

This design provides more capital efficiency by allowing single-sided liquidity provision and maintaining better peg to real-world FX rates.

## Oracle Integration

The system uses Pyth price oracles to get current FX rates. For example:
- EUR/USD oracle for EUR <-> USD swaps
- GBP/USD oracle for GBP <-> USD swaps

## Fee Mechanism

Spread fees are dynamically calculated based on vault health:
```
spread = max(0.03%, 0.03% - 0.2833% × (vault_health - 0.9))
```

Fees are distributed to:
- 70% to LPs proportional to their deposit
- Remaining 30% split between PDA and protocol treasury based on vault health:

| Vault Health | PDA (%) | Protocol (%) | Total PDA+Protocol Split |
|--------------|---------|--------------|--------------------------|
| > 0.70       | 15%     | 15%          | 30%                      |
| 0.50–0.70    | 20%     | 10%          | 30%                      |
| 0.30–0.50    | 25%     | 5%           | 30%                      |
| < 0.30       | 30%     | 0%           | 30%                      |

## Drift Mechanism

The AMM drift is a dynamic adjustment to the exchange rate that creates a price impact based on vault imbalance. Unlike traditional AMMs that use constant product formulas, our system uses oracle prices with a drift adjustment.

### How Drift Works

The drift is calculated based on vault health:
```
drift = max(0%, -0.8333% × (vault_health - 0.9))
```

When a vault's health is below 0.9 (indicating imbalance), the drift creates a price impact that:
1. Decreases the effective exchange rate when buying from an imbalanced vault (you get less tokens)
2. Increases the effective exchange rate when selling to an imbalanced vault (you pay more tokens)

### System Flow with Drift

1. User initiates a swap on frontend
2. Backend fetches FX rate from oracle
3. System calculates vault health and applies AMM drift to the oracle price
4. Modified price is used to calculate the swap amount with the drift adjustment
5. Spread fee is applied to the final amount
6. Tokens are transferred and fees distributed

### Drift Impact by Vault Health

| Vault Health | Drift Impact | Effect on Trade |
|--------------|--------------|----------------|
| 0.9 - 1.0    | 0.00%        | No drift applied, pure oracle price |
| 0.8          | 0.08%        | Small price impact to encourage balance |
| 0.7          | 0.17%        | Moderate price impact |
| 0.6          | 0.25%        | Significant price impact |
| 0.5          | 0.33%        | Large price impact |
| 0.4          | 0.42%        | Very large price impact |

This drift mechanism creates a powerful incentive for market participants to balance vaults, as trades that improve vault health receive favorable rates while trades that worsen imbalance face increased costs.

## Early Withdrawal Penalty

To encourage long-term liquidity provision and protect the system from liquidity shocks, a time-based withdrawal penalty is applied when LPs withdraw their funds. The penalties decrease over time and are sent directly to the rebalancer PDA to fund rebalancing operations:

| Hours Since Deposit | Withdrawal Fee |
| ------------------- | -------------- |
| 0 - 60              | 2.00%          |
| 60 - 120            | 1.50%          |
| 120 - 180           | 1.00%          |
| 180 - 240           | 0.50%          |
| 240+                | 0.00%          |

All penalty fees (100%) go to the rebalancer PDA to support the system's stability through rebalancing operations.

## Rebalancing Mechanism

The PDA treasury serves as a rebalancer for the system, automatically injecting liquidity into vaults when health deteriorates below certain thresholds:

| Vault Health Range | Action           | Injection Rate | Notes                          |
| ------------------ | ---------------- | -------------- | ------------------------------ |
| **0.50 – 0.40**    | Inject liquidity | 30% of deficit | Mild imbalance, small fix      |
| **0.40 – 0.30**    | Inject liquidity | 50% of deficit | Moderate imbalance, higher fix |
| **0.30 – 0.20**    | Inject liquidity | 75% of deficit | Critical imbalance, higher fix |

This automated rebalancing helps maintain system stability and ensures sufficient liquidity across all vaults. 