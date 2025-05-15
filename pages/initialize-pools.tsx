import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  Keypair, 
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction, 
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import styles from '../styles/Home.module.css';

// Program ID for the fx_vault_dex program
const PROGRAM_ID = new PublicKey('5mm6uP4Qgumg3gXiiLg7jgWJkcUFXHKdUutz5HfmWnSs');

// Constants from the program
const VAULT_ACCOUNT_SEED = 'vault-account';
const VAULT_AUTHORITY_SEED = 'vault-authority';

// Token addresses
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const EURC_MINT = new PublicKey('HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr');

// Treasury addresses
const TREASURY = new PublicKey('HQ8TNsx8a8wLARUWyUeiNGXuyMCRWsfUqBvEG6kAnmwZ');
const PDA_TREASURY = new PublicKey('A8rtB58dKaDgEeEUqfLYaJdLCyH4fCPk1NoKx4jtjExr');

// Dummy oracle (replace with a real one when available)
const DUMMY_ORACLE = new PublicKey('11111111111111111111111111111111');

// Create the instruction data in a simpler format
// Anchor uses tags at the beginning of instructions
// For initialize_vault, we'll use a simple instruction tag of 0
function createInitializeVaultInstructionData(vaultName: string, nonce: number, feeBasisPoints: number): Buffer {
  // Instruction tag for initialize_vault
  const INITIALIZE_VAULT_TAG = 0;
  
  // Convert name to bytes
  const nameBytes = Buffer.from(vaultName);
  
  // Calculate the total buffer size
  // 1 byte for tag + 4 bytes for string length + string bytes + 1 byte for nonce + 2 bytes for fee
  const bufferSize = 1 + 4 + nameBytes.length + 1 + 2;
  
  // Create the buffer
  const data = Buffer.alloc(bufferSize);
  let offset = 0;
  
  // Write the instruction tag (1 byte)
  data.writeUInt8(INITIALIZE_VAULT_TAG, offset);
  offset += 1;
  
  // Write the name length (4 bytes)
  data.writeUInt32LE(nameBytes.length, offset);
  offset += 4;
  
  // Write the name bytes
  nameBytes.copy(data, offset);
  offset += nameBytes.length;
  
  // Write the nonce (1 byte)
  data.writeUInt8(nonce, offset);
  offset += 1;
  
  // Write the fee basis points (2 bytes)
  data.writeUInt16LE(feeBasisPoints, offset);
  
  return data;
}

const InitializePools = () => {
  const { publicKey, signTransaction } = useWallet();
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState<{ usdc: string; eurc: string }>({
    usdc: 'Not initialized',
    eurc: 'Not initialized',
  });
  const [txSignatures, setTxSignatures] = useState<{ usdc: string | null; eurc: string | null }>({
    usdc: null,
    eurc: null,
  });
  const [pdaAddresses, setPdaAddresses] = useState<{
    usdc: { vault: string, authority: string, tokenAccount: string } | null,
    eurc: { vault: string, authority: string, tokenAccount: string } | null
  }>({
    usdc: null,
    eurc: null
  });

  // Use devnet by default or provided RPC URL
  const connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');

  // Calculate PDAs when wallet connects
  useEffect(() => {
    if (publicKey) {
      calculatePdas();
    }
  }, [publicKey]);

  const calculatePdas = async () => {
    try {
      // Calculate USDC PDAs
      const usdcVaultData = await findVaultPDA(USDC_MINT);
      const usdcAuthorityData = await findVaultAuthorityPDA(usdcVaultData.vaultPDA);
      const usdcTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        usdcAuthorityData.authorityPDA,
        true // allowOwnerOffCurve
      );

      // Calculate EURC PDAs
      const eurcVaultData = await findVaultPDA(EURC_MINT);
      const eurcAuthorityData = await findVaultAuthorityPDA(eurcVaultData.vaultPDA);
      const eurcTokenAccount = await getAssociatedTokenAddress(
        EURC_MINT,
        eurcAuthorityData.authorityPDA,
        true // allowOwnerOffCurve
      );

      setPdaAddresses({
        usdc: {
          vault: usdcVaultData.vaultPDA.toString(),
          authority: usdcAuthorityData.authorityPDA.toString(),
          tokenAccount: usdcTokenAccount.toString()
        },
        eurc: {
          vault: eurcVaultData.vaultPDA.toString(),
          authority: eurcAuthorityData.authorityPDA.toString(),
          tokenAccount: eurcTokenAccount.toString()
        }
      });
    } catch (error: any) {
      console.error("Error calculating PDAs:", error);
    }
  };

  const findVaultPDA = async (tokenMint: PublicKey) => {
    const [vaultPDA, vaultBump] = await PublicKey.findProgramAddress(
      [Buffer.from(VAULT_ACCOUNT_SEED), tokenMint.toBuffer()],
      PROGRAM_ID
    );
    return { vaultPDA, vaultBump };
  };

  const findVaultAuthorityPDA = async (vaultAccount: PublicKey) => {
    const [authorityPDA, authorityBump] = await PublicKey.findProgramAddress(
      [Buffer.from(VAULT_AUTHORITY_SEED), vaultAccount.toBuffer()],
      PROGRAM_ID
    );
    return { authorityPDA, authorityBump };
  };

  const initializeVault = async (
    tokenMint: PublicKey, 
    vaultName: string, 
    feeBasisPoints: number, 
    coinType: 'usdc' | 'eurc'
  ) => {
    if (!publicKey || !signTransaction) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      setIsInitializing(true);
      setInitStatus(prev => ({ ...prev, [coinType]: 'Processing...' }));

      // 1. Find the vault PDA
      const { vaultPDA, vaultBump } = await findVaultPDA(tokenMint);
      
      // 2. Find the vault authority PDA
      const { authorityPDA, authorityBump } = await findVaultAuthorityPDA(vaultPDA);
      
      // 3. Get the token account address for the vault
      const vaultTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        authorityPDA,
        true // allowOwnerOffCurve
      );
      
      // 4. Log all PDAs for debugging
      console.log('Vault PDA:', vaultPDA.toString());
      console.log('Authority PDA:', authorityPDA.toString());
      console.log('Vault Token Account:', vaultTokenAccount.toString());
      console.log('Authority Bump:', authorityBump);

      // 5. Create a transaction
      const transaction = new Transaction();
      
      // 6. Add instruction to create the ATA if it doesn't exist
      const accountInfo = await connection.getAccountInfo(vaultTokenAccount);
      if (!accountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // payer
            vaultTokenAccount, // ata
            authorityPDA, // owner
            tokenMint // mint
          )
        );
      }
      
      // 7. Create the instruction data with tag-based approach
      const instructionData = createInitializeVaultInstructionData(
        vaultName,
        authorityBump,
        feeBasisPoints
      );

      // 8. Create the instruction with accounts in expected order
      const initializeInstruction = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          // Important: The order of accounts must match what the program expects
          { pubkey: publicKey, isSigner: true, isWritable: true },           // admin
          { pubkey: vaultPDA, isSigner: false, isWritable: true },           // vault_account
          { pubkey: authorityPDA, isSigner: false, isWritable: false },      // vault_authority
          { pubkey: tokenMint, isSigner: false, isWritable: false },         // token_mint
          { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },  // vault_token_account
          { pubkey: DUMMY_ORACLE, isSigner: false, isWritable: false },      // oracle
          { pubkey: TREASURY, isSigner: false, isWritable: false },          // treasury
          { pubkey: PDA_TREASURY, isSigner: false, isWritable: false },      // pda_treasury
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },   // token_program
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent sysvar
        ],
        data: instructionData,
      });
      
      transaction.add(initializeInstruction);
      
      // 9. Set recent blockhash and fee payer
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = publicKey;
      
      // 10. Sign and send transaction
      const signedTransaction = await signTransaction(transaction);
      
      try {
        console.log('Instruction data (hex):', Buffer.from(instructionData).toString('hex'));
        console.log('Instruction first byte (tag):', instructionData[0]);
        console.log('Accounts:', initializeInstruction.keys.map((k, i) => `${i}: ${k.pubkey.toString()}`));
        
        const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: true // Skip simulation for troubleshooting
        });
        console.log('Transaction sent, waiting for confirmation...');
        
        const confirmResult = await connection.confirmTransaction(signature, 'confirmed');
        console.log('Confirmation result:', confirmResult);
        
        setInitStatus(prev => ({ ...prev, [coinType]: 'Initialized successfully!' }));
        setTxSignatures(prev => ({ ...prev, [coinType]: signature }));
        
        console.log(`${coinType.toUpperCase()} Vault initialized! Signature:`, signature);
        return signature;
      } catch (sendError: any) {
        console.error('Transaction error details:', sendError);
        if (sendError.logs) {
          console.error('Transaction logs:', sendError.logs);
        }
        throw new Error(`Transaction failed: ${sendError.message}`);
      }
      
    } catch (error: any) {
      console.error(`Error initializing ${coinType.toUpperCase()} vault:`, error);
      const errorMessage = error.message || 'Unknown error occurred';
      setInitStatus(prev => ({ ...prev, [coinType]: `Failed: ${errorMessage}` }));
      return null;
    } finally {
      setIsInitializing(false);
    }
  };

  const initializeUSDCVault = () => {
    return initializeVault(USDC_MINT, 'USDC Vault', 30, 'usdc');
  };

  const initializeEURCVault = () => {
    return initializeVault(EURC_MINT, 'EURC Vault', 30, 'eurc');
  };

  const initializeBothVaults = async () => {
    await initializeUSDCVault();
    await initializeEURCVault();
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Initialize FX Vault DEX Pools</h1>
        
        <div className={styles.walletButtons}>
          <WalletMultiButton />
        </div>

        {publicKey ? (
          <div className={styles.grid}>
            <div className={styles.card}>
              <h2>Pool Initialization</h2>
              <p>Connected as: {publicKey.toString()}</p>
              
              <div style={{ marginBottom: '20px' }}>
                <h3>USDC Pool</h3>
                <p>Status: {initStatus.usdc}</p>
                {txSignatures.usdc && (
                  <p>
                    Transaction: <a 
                      href={`https://explorer.solana.com/tx/${txSignatures.usdc}?cluster=devnet`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      View on Explorer
                    </a>
                  </p>
                )}
                <button 
                  onClick={initializeUSDCVault} 
                  disabled={isInitializing || initStatus.usdc === 'Initialized successfully!'}
                  className={styles.button}
                >
                  Initialize USDC Pool
                </button>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <h3>EURC Pool</h3>
                <p>Status: {initStatus.eurc}</p>
                {txSignatures.eurc && (
                  <p>
                    Transaction: <a 
                      href={`https://explorer.solana.com/tx/${txSignatures.eurc}?cluster=devnet`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      View on Explorer
                    </a>
                  </p>
                )}
                <button 
                  onClick={initializeEURCVault} 
                  disabled={isInitializing || initStatus.eurc === 'Initialized successfully!'}
                  className={styles.button}
                >
                  Initialize EURC Pool
                </button>
              </div>
              
              <div>
                <button 
                  onClick={initializeBothVaults} 
                  disabled={isInitializing || (initStatus.usdc === 'Initialized successfully!' && initStatus.eurc === 'Initialized successfully!')}
                  className={styles.button}
                  style={{ backgroundColor: '#4CAF50' }}
                >
                  Initialize Both Pools
                </button>
              </div>
            </div>
            
            <div className={styles.card}>
              <h2>Technical Details</h2>
              <h3>USDC Vault</h3>
              <p><strong>Mint Address:</strong> {USDC_MINT.toString()}</p>
              {pdaAddresses.usdc && (
                <>
                  <p><strong>Vault PDA:</strong> {pdaAddresses.usdc.vault}</p>
                  <p><strong>Authority PDA:</strong> {pdaAddresses.usdc.authority}</p>
                  <p><strong>Token Account:</strong> {pdaAddresses.usdc.tokenAccount}</p>
                </>
              )}
              
              <h3>EURC Vault</h3>
              <p><strong>Mint Address:</strong> {EURC_MINT.toString()}</p>
              {pdaAddresses.eurc && (
                <>
                  <p><strong>Vault PDA:</strong> {pdaAddresses.eurc.vault}</p>
                  <p><strong>Authority PDA:</strong> {pdaAddresses.eurc.authority}</p>
                  <p><strong>Token Account:</strong> {pdaAddresses.eurc.tokenAccount}</p>
                </>
              )}
              
              <h3>Other Information</h3>
              <p><strong>Treasury:</strong> {TREASURY.toString()}</p>
              <p><strong>PDA Treasury:</strong> {PDA_TREASURY.toString()}</p>
              <p><strong>Fee Basis Points:</strong> 30 (0.3%)</p>
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <h2>Please Connect Your Wallet</h2>
            <p>You need to connect your Phantom wallet to initialize the pools.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default InitializePools; 