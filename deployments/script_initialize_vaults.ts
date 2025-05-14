import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { FxVaultDex } from '../target/types/fx_vault_dex';
import fs from 'fs';

// Load config file
const config = JSON.parse(fs.readFileSync('./deployments/vault_config.json', 'utf8'));

// Constants for seeds
const VAULT_ACCOUNT_SEED = Buffer.from('vault-account');
const VAULT_AUTHORITY_SEED = Buffer.from('vault-authority');

async function main() {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FxVaultDex as Program<FxVaultDex>;
  const wallet = provider.wallet as anchor.Wallet;

  console.log('Initializing stablecoin vaults...');

  for (const vault of config.vaults) {
    // Parse config values
    const tokenMint = new PublicKey(vault.tokenMint);
    const oracle = new PublicKey(vault.oracle);
    const treasury = new PublicKey(vault.treasury);
    const pdaTreasury = new PublicKey(vault.pdaTreasury);
    const feeBasisPoints = vault.feeBasisPoints;
    const vaultName = vault.name;

    // Derive PDAs
    const [vaultAccount, vaultBump] = await PublicKey.findProgramAddress(
      [VAULT_ACCOUNT_SEED, tokenMint.toBuffer()],
      program.programId
    );

    const [vaultAuthority, authorityBump] = await PublicKey.findProgramAddress(
      [VAULT_AUTHORITY_SEED, vaultAccount.toBuffer()],
      program.programId
    );

    // Create vault token account
    const vaultTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      vaultAuthority,
      true
    );

    try {
      // First create the token account
      const createTokenAccountTx = await createAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        tokenMint,
        vaultAuthority,
        true
      );

      console.log(`Created token account for ${vaultName}: ${vaultTokenAccount.toString()}`);

      // Initialize the vault
      const tx = await program.methods
        .initializeVault(
          vaultName,
          authorityBump,
          feeBasisPoints
        )
        .accounts({
          admin: wallet.publicKey,
          vaultAccount: vaultAccount,
          vaultAuthority: vaultAuthority,
          tokenMint: tokenMint,
          vaultTokenAccount: vaultTokenAccount,
          oracle: oracle,
          treasury: treasury,
          pdaTreasury: pdaTreasury,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      console.log(`Initialized vault for ${vaultName}: ${tx}`);
      console.log(`Vault Account: ${vaultAccount.toString()}`);
      console.log(`Vault Authority: ${vaultAuthority.toString()}`);
      console.log(`Vault Token Account: ${vaultTokenAccount.toString()}`);
      console.log('-----------------------------------');

    } catch (e) {
      console.error(`Error initializing vault for ${vaultName}:`, e);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
); 