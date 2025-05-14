# 💱 StableX - FX Stablecoin Vault DEX

StableX is a decentralized foreign exchange platform for stablecoins built on Solana. It uses a vault-based architecture for efficient oracle-driven FX swaps and single-sided liquidity provision.

## Features

- **Single-sided LP positions**: Provide liquidity to a single stablecoin vault
- **Oracle-based pricing**: Real-time FX rates from Pyth oracles
- **Dynamic spreads**: Fees adjust based on vault imbalance
- **Capital efficiency**: No impermanent loss for LPs
- **Proportional rewards**: Earn fees based on your share of the vault

## Architecture

Unlike traditional AMMs that use token pairs in a single pool, StableX uses separate vaults for each stablecoin:

- One vault = one token
- Oracle provides the exchange rate
- LPs earn rewards from their specific vault
- Dynamic spreads balance supply and demand

## Quick Start

### Prerequisites

- Solana CLI tools
- Anchor framework 
- Node.js and npm/yarn

### Build and Deploy

```bash
# Clone the repository
git clone https://github.com/your-username/stablex.git
cd stablex

# Install dependencies
yarn install

# Build and deploy the program
./deployments/script_deploy.sh
```

### Using the DEX

#### For LPs:

1. Deposit liquidity to a vault
2. Earn fees from swaps
3. Claim rewards
4. Withdraw liquidity when desired

#### For Traders:

1. Connect wallet with supported stablecoins
2. Select source and target currencies
3. Enter swap amount
4. Review rate and confirm transaction

## Technical Details

### Smart Contracts

The core program is built with the Anchor framework and consists of:

- Vault accounts that hold tokens and track TVL
- LP position accounts that track user deposits
- Reward tracking for fee distribution
- Oracle integration for price discovery
- Dynamic fee calculation based on vault health

### Frontend

The web app is built with:

- Next.js for the React framework
- Wallet adapter for Solana wallet connection
- Custom hooks for program interactions

## Development

```bash
# Run a local validator
solana-test-validator

# Build and deploy to localnet
anchor build
anchor deploy

# Run tests
anchor test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
