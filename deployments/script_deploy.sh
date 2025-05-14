#!/bin/bash

echo "Building and deploying FX Vault DEX..."

# Build the program
anchor build

# Get the program ID
PROGRAM_ID=$(solana address -k ./target/deploy/fx_vault_dex-keypair.json)
echo "Program ID: $PROGRAM_ID"

# Update Anchor.toml with the program ID
sed -i "s/fx_vault_dex = \"[^\"]*\"/fx_vault_dex = \"$PROGRAM_ID\"/" Anchor.toml

# Update lib.rs with the program ID
sed -i "s/declare_id!(\"[^\"]*\")/declare_id!(\"$PROGRAM_ID\")/" programs/fx_vault_dex/src/lib.rs

# Build again with updated program ID
anchor build

# Deploy the program to the cluster
echo "Deploying to the cluster..."
anchor deploy

# Initialize vaults
echo "Initializing vaults..."
ts-node deployments/script_initialize_vaults.ts

echo "Deployment complete!" 