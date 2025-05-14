# StableX: FX-Stablecoin DEX on Solana

A Solana-based DEX for trading FX-pegged stablecoins with low fees, dynamic AMM-based spreads, and prorated LP incentives.

## Features

- **Real-world FX-pegged stablecoin swaps**: Trade foreign exchange (FX) stablecoins on Solana
- **Dynamic spreads & fees**: Market-responsive pricing based on vault health
- **Oracle integration**: Uses Pyth for real-time FX rate pricing
- **Prorated LP incentives**: Fee allocation based on vault health metrics
- **Efficient trading**: Low fees with dynamic AMM-based spreads
- **Balanced liquidity**: Incentives for balanced vault health

## Core Metrics & Formulas

### Vault Health

Calculated as: `min(vault_a,vault_b)/max(vault_a,vault_b)`

### Fee Distribution 

| Vault Health | PDA (%) | Protocol (%) | Total Split |
|--------------|---------|--------------|-------------|
| > 0.70       | 15%     | 15%          | 30%         |
| 0.50–0.70    | 20%     | 10%          | 30%         |
| 0.30–0.50    | 25%     | 5%           | 30%         |
| < 0.30       | 30%     | 0%           | 30%         |

### Dynamic Pricing Model

- **Spread**: `max(0.03%, 0.03% - 0.2833% × (vault_health - 0.9))`
- **Drift**: `max(0%, -0.8333% × (vault_health - 0.9))`

## Instructions

- `Initialize`: Create a new StableX pool
- `AddLiquidity`: Provide liquidity to a pool
- `RemoveLiquidity`: Remove liquidity from a pool
- `Swap`: Exchange one token for another 
- `ClaimRewards`: Claim LP rewards from fees

## Building

```bash
cd programs/stablex
cargo build-bpf
```

## Deployment

```bash
solana program deploy target/deploy/stablex.so
```

## License

MIT 