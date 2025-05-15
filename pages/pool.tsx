import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/router';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL, Keypair, SystemProgram } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID, getAccount, createTransferInstruction } from '@solana/spl-token';
import * as anchor from '@project-serum/anchor';
import { BN } from '@project-serum/anchor';
import idl from '../target/idl/idl.json';
import Navbar from '../components/Navbar';
import { toast, Toaster } from 'react-hot-toast';

// Program ID for the fx_vault_dex program
const PROGRAM_ID = new PublicKey('5mm6uP4Qgumg3gXiiLg7jgWJkcUFXHKdUutz5HfmWnSs');

// Token mint addresses
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const EURC_MINT = new PublicKey('HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr');

// Constants from the program
const VAULT_ACCOUNT_SEED = 'vault-account';
const VAULT_AUTHORITY_SEED = 'vault-authority';

// Pool data with real info
export const poolData = [
  { 
    symbol: 'USDC', 
    name: 'USD Coin', 
    mint: USDC_MINT,
    tvl: '$0', 
    apr: '0.0%', 
    vol1d: '$0',
    details: {
      description: 'USD Coin is a stablecoin pegged to the US Dollar',
      totalDeposits: '$0',
      totalUsers: 0,
      weeklyVolume: '$0',
      yourBalance: '0.00',
      chart: [0, 0, 0, 0, 0, 0, 0]
    }
  },
  { 
    symbol: 'EURC', 
    name: 'Euro Coin', 
    mint: EURC_MINT,
    tvl: '$0', 
    apr: '0.0%', 
    vol1d: '$0',
    details: {
      description: 'Euro Coin is a stablecoin pegged to the Euro',
      totalDeposits: '$0',
      totalUsers: 0,
      weeklyVolume: '$0',
      yourBalance: '0.00',
      chart: [0, 0, 0, 0, 0, 0, 0]
    }
  }
];

// Define interfaces for the account types
interface VaultAccount {
  tvl: anchor.BN;
  accruedLpFees: anchor.BN;
  // Add other fields as needed
}

interface LPPosition {
  amount: anchor.BN;
  depositTimestamp: anchor.BN;
  // Add other fields as needed
}

// Type for anchor program
interface ProgramAccounts {
  account: {
    vaultAccount: {
      fetch(address: PublicKey): Promise<any>;
    };
    lPPosition: {
      fetch(address: PublicKey): Promise<any>;
    };
  };
  methods: {
    depositLiquidity(amount: anchor.BN): any;
    withdrawLiquidity(amount: anchor.BN): any;
  };
}

// Check if vault is initialized and return its PDA
const getInitializedVaultPDA = async (
  connection: Connection,
  tokenMint: PublicKey,
  programId: PublicKey
): Promise<{ vaultPDA: PublicKey, exists: boolean }> => {
  const [vaultPDA] = await PublicKey.findProgramAddress(
    [Buffer.from(VAULT_ACCOUNT_SEED), tokenMint.toBuffer()],
    programId
  );
  
  try {
    // Check if account exists
    const accountInfo = await connection.getAccountInfo(vaultPDA);
    return { vaultPDA, exists: accountInfo !== null };
  } catch (error) {
    console.error("Error checking vault account:", error);
    return { vaultPDA, exists: false };
  }
};

// Add this function after the getInitializedVaultPDA
const ensureRequiredAccounts = async (
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey
): Promise<{ vaultAccount: PublicKey | null; userTokenAccount: PublicKey; vaultTokenAccount: PublicKey | null }> => {
  console.log("Checking required accounts...");
  
  // Find vault PDA
  const [vaultPDA] = await PublicKey.findProgramAddress(
    [Buffer.from(VAULT_ACCOUNT_SEED), mint.toBuffer()],
    PROGRAM_ID
  );
  
  // Check if vault account exists
  let vaultExists = false;
  try {
    const vaultInfo = await connection.getAccountInfo(vaultPDA);
    vaultExists = vaultInfo !== null;
    console.log(`Vault account ${vaultPDA.toBase58()} exists: ${vaultExists}`);
  } catch (error) {
    console.error("Error checking vault account:", error);
  }
  
  // Find vault authority
  const [vaultAuthority] = await PublicKey.findProgramAddress(
    [Buffer.from(VAULT_AUTHORITY_SEED), vaultPDA.toBuffer()],
    PROGRAM_ID
  );
  
  // Find vault token account
  const vaultTokenAccount = await getAssociatedTokenAddress(
    mint,
    vaultAuthority,
    true // allowOwnerOffCurve
  );
  
  // Check if vault token account exists
  let vaultTokenAccountExists = false;
  try {
    const accountInfo = await connection.getAccountInfo(vaultTokenAccount);
    vaultTokenAccountExists = accountInfo !== null;
    console.log(`Vault token account ${vaultTokenAccount.toBase58()} exists: ${vaultTokenAccountExists}`);
  } catch (error) {
    console.error("Error checking vault token account:", error);
  }
  
  // Find user token account
  const userTokenAccount = await getAssociatedTokenAddress(
    mint,
    wallet
  );
  
  // Check if user token account exists
  let userTokenAccountExists = false;
  try {
    const accountInfo = await connection.getAccountInfo(userTokenAccount);
    userTokenAccountExists = accountInfo !== null;
    console.log(`User token account ${userTokenAccount.toBase58()} exists: ${userTokenAccountExists}`);
  } catch (error) {
    console.error("Error checking user token account:", error);
  }
  
  return {
    vaultAccount: vaultExists ? vaultPDA : null,
    userTokenAccount,
    vaultTokenAccount: vaultTokenAccountExists ? vaultTokenAccount : null
  };
};

// Add this function with the other utility functions
const debugIdlInstructions = async (): Promise<string> => {
  try {
    // Parse and log the IDL instructions to help with debugging account structures
    const parsedIdl = idl as any;
    
    let output = "IDL Instruction Accounts:\n\n";
    
    if (parsedIdl && parsedIdl.instructions) {
      for (const instruction of parsedIdl.instructions) {
        if (instruction.name === "depositLiquidity" || instruction.name === "withdrawLiquidity") {
          output += `${instruction.name}:\n`;
          
          if (instruction.accounts) {
            for (const account of instruction.accounts) {
              output += `- ${account.name} (${account.isMut ? "mutable" : "readonly"}${account.isSigner ? ", signer" : ""})\n`;
            }
          }
          
          output += "\n";
        }
      }
    } else {
      output += "IDL not found or has no instructions defined.\n";
    }
    
    console.log(output);
    return output;
  } catch (error) {
    console.error("Error parsing IDL:", error);
    return `Error parsing IDL: ${(error as any).message}`;
  }
};

export default function PoolPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [vaultData, setVaultData] = useState(poolData);
  const connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');

  useEffect(() => {
    if (publicKey) {
      fetchVaultData();
    }
  }, [publicKey]);

  const fetchVaultData = async () => {
    try {
      // Create Anchor provider and program
      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey, signTransaction: async () => { throw new Error("Not implemented"); }, signAllTransactions: async () => { throw new Error("Not implemented"); } } as any,
        { commitment: 'confirmed' }
      );
      
      const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);
      
      // Fetch data for both vaults
      const updatedPoolData = [...poolData];
      
      // Loop through pools and fetch on-chain data
      for (let i = 0; i < updatedPoolData.length; i++) {
        const pool = updatedPoolData[i];
        const [vaultPDA] = await PublicKey.findProgramAddress(
          [Buffer.from(VAULT_ACCOUNT_SEED), pool.mint.toBuffer()],
          PROGRAM_ID
        );
        
        try {
          // Try to fetch vault account data - use vaultAccount as the key name
          const vaultAccount = await program.account.vaultAccount.fetch(vaultPDA) as unknown as VaultAccount;
          
          if (vaultAccount) {
            // Format TVL - convert from lamports to dollars (simplified)
            const tvlValue = vaultAccount.tvl.toNumber() / 1000000; // Assuming 6 decimals for simplicity
            
            // Update pool data with real values
            updatedPoolData[i] = {
              ...pool,
              tvl: `$${tvlValue.toLocaleString()}`,
              apr: '3.0%', // Could calculate this based on fees or other metrics
              vol1d: `$${(vaultAccount.accruedLpFees.toNumber() / 1000000).toLocaleString()}`,
              details: {
                ...pool.details,
                totalDeposits: `$${tvlValue.toLocaleString()}`,
                totalUsers: 1, // This would be calculated from counting LP positions
                weeklyVolume: `$${(vaultAccount.accruedLpFees.toNumber() / 1000000).toLocaleString()}`
              }
            };
          }
        } catch (error) {
          console.log(`Vault data not found for ${pool.symbol}, may not be initialized yet`);
        }
      }
      
      setVaultData(updatedPoolData);
    } catch (error) {
      console.error("Error fetching vault data:", error);
    }
  };
  
  // Display only the pool list on the main page
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar current="pool" />
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      
      <main className="flex-1 flex flex-col px-4 py-8">
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text">Vault Pools</h1>
            <p className="text-gray-400 text-sm">Deposit liquidity and earn yield on your stablecoins</p>
          </div>
          
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900/80 to-black/80 shadow-xl">
            <table className="w-full">
              <thead>
                <tr className="bg-black/40 text-sm">
                  <th className="text-left p-4">Asset</th>
                  <th className="text-center p-4">TVL</th>
                  <th className="text-center p-4">APR</th>
                  <th className="text-center p-4 hidden md:table-cell">1D Volume</th>
                </tr>
              </thead>
              <tbody>
                {vaultData.map((pool, index) => (
                  <motion.tr 
                    key={pool.symbol}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => router.push(`/pool/${pool.symbol.toLowerCase()}`)}
                    className="group border-t border-gray-800 hover:bg-gradient-to-r hover:from-gray-800/60 hover:to-gray-900/60 hover:border-cyan-900/50 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)] hover:scale-[1.01] transition-all duration-200 cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-semibold group-hover:text-cyan-300 transition-colors">{pool.symbol}</span>
                        <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">{pool.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center text-cyan-400 font-medium">{pool.tvl}</td>
                    <td className="p-4 text-center text-green-400 font-medium">{pool.apr}</td>
                    <td className="p-4 text-center hidden md:table-cell">{pool.vol1d}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-center text-xs text-gray-500">
            Click on any pool to view details and manage your deposits
          </div>
        </div>
      </main>
    </div>
  );
}

// Create a new page for pool details
export function PoolDetailsPage() {
  const router = useRouter();
  const { symbol } = router.query;
  const [activeTab, setActiveTab] = useState('deposit');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [poolInfo, setPoolInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [userTokenBalance, setUserTokenBalance] = useState(0);
  const [depositTime, setDepositTime] = useState<number | null>(null);
  const [withdrawalFee, setWithdrawalFee] = useState("0.00%");
  const [vaultInitialized, setVaultInitialized] = useState<boolean | null>(null);
  const [debugInfo, setDebugInfo] = useState("");
  
  // Find the selected pool based on the URL parameter
  const selectedPool = poolData.find(p => p.symbol.toLowerCase() === symbol);

  useEffect(() => {
    if (publicKey && selectedPool) {
      fetchPoolDetails();
      fetchUserTokenBalance();
    }
  }, [publicKey, symbol]);

  const fetchUserTokenBalance = async () => {
    if (!publicKey || !selectedPool) return;
    
    try {
      const associatedTokenAddress = await getAssociatedTokenAddress(
        selectedPool.mint,
        publicKey
      );
      
      try {
        const tokenAccount = await getAccount(connection, associatedTokenAddress);
        setUserTokenBalance(Number(tokenAccount.amount) / 1000000); // Assuming 6 decimals
      } catch (error) {
        console.log("No token account found, user may not have any tokens");
        setUserTokenBalance(0);
      }
    } catch (error) {
      console.error("Error fetching token balance:", error);
    }
  };
  
  const fetchPoolDetails = async () => {
    if (!selectedPool || !publicKey) return;
    
    try {
      // Create Anchor provider and program
      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey: publicKey!, signTransaction: async () => { throw new Error("Not implemented"); }, signAllTransactions: async () => { throw new Error("Not implemented"); } } as any,
        { commitment: 'confirmed' }
      );
      
      const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);
      
      // Fetch vault account data
      const [vaultPDA] = await PublicKey.findProgramAddress(
        [Buffer.from(VAULT_ACCOUNT_SEED), selectedPool.mint.toBuffer()],
        PROGRAM_ID
      );
      
      try {
        // Use vaultAccount as the account name
        const vaultAccount = await program.account.vaultAccount.fetch(vaultPDA) as unknown as VaultAccount;
        
        if (vaultAccount) {
          // Format TVL - convert from lamports to dollars
          const tvlValue = vaultAccount.tvl.toNumber() / 1000000; // Assuming 6 decimals
          
          // Check if user has an LP position
          const [lpPositionPDA] = await PublicKey.findProgramAddress(
            [Buffer.from("lp-position"), vaultPDA.toBuffer(), publicKey!.toBuffer()],
            PROGRAM_ID
          );
          
          let userBalance = "0.00";
          
          try {
            const lpPosition = await program.account.lPPosition.fetch(lpPositionPDA) as unknown as LPPosition;
            if (lpPosition) {
              userBalance = (lpPosition.amount.toNumber() / 1000000).toString();
              
              // Get deposit timestamp to calculate withdrawal fee
              const depositTimestamp = lpPosition.depositTimestamp.toNumber();
              setDepositTime(depositTimestamp);
              
              // Calculate time-based withdrawal fee
              const currentTime = Math.floor(Date.now() / 1000);
              const hoursElapsed = (currentTime - depositTimestamp) / 3600;
              
              // Early withdrawal penalties as per README
              let feePercentage = 0;
              if (hoursElapsed < 60) {
                feePercentage = 2.0;
              } else if (hoursElapsed < 120) {
                feePercentage = 1.5;
              } else if (hoursElapsed < 180) {
                feePercentage = 1.0;
              } else if (hoursElapsed < 240) {
                feePercentage = 0.5;
              } else {
                feePercentage = 0;
              }
              
              setWithdrawalFee(`${feePercentage.toFixed(2)}%`);
            }
          } catch (err) {
            console.log("No LP position found for this user");
          }
          
          setPoolInfo({
            ...selectedPool,
            tvl: `$${tvlValue.toLocaleString()}`,
            apr: '3.0%',
            vol1d: `$${(vaultAccount.accruedLpFees.toNumber() / 1000000).toLocaleString()}`,
            details: {
              ...selectedPool.details,
              totalDeposits: `$${tvlValue.toLocaleString()}`,
              totalUsers: 1,
              weeklyVolume: `$${(vaultAccount.accruedLpFees.toNumber() / 1000000).toLocaleString()}`,
              yourBalance: userBalance
            }
          });
        }
      } catch (error) {
        console.log(`Vault data not found for ${selectedPool.symbol}, using default values`);
        setPoolInfo(selectedPool);
      }
    } catch (error) {
      console.error("Error fetching pool details:", error);
      setPoolInfo(selectedPool);
    }
  };
  
  const handleDepositLiquidity = async () => {
    if (!publicKey || !selectedPool || !depositAmount || Number(depositAmount) <= 0) {
      toast.error("Please enter a valid amount to deposit");
      return;
    }
    
    setLoading(true);
    console.log("Starting deposit process for", selectedPool.symbol);
    
    try {
      // Check required accounts
      const { vaultAccount, userTokenAccount, vaultTokenAccount } = await ensureRequiredAccounts(
        connection,
        publicKey,
        selectedPool.mint
      );
      
      if (!vaultAccount) {
        toast.error(`The ${selectedPool.symbol} vault has not been initialized yet`);
        setLoading(false);
        return;
      }
      
      if (!vaultTokenAccount) {
        toast.error(`The ${selectedPool.symbol} vault token account has not been initialized yet`);
        setLoading(false);
        return;
      }
      
      // Create Anchor provider and program
      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey: publicKey!, sendTransaction } as any,
        { commitment: 'confirmed' }
      );
      
      const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);
      
      // Find all necessary PDAs
      const [vaultAuthority] = await PublicKey.findProgramAddress(
        [Buffer.from(VAULT_AUTHORITY_SEED), vaultAccount.toBuffer()],
        PROGRAM_ID
      );
      
      const [lpPositionPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("lp-position"), vaultAccount.toBuffer(), publicKey!.toBuffer()],
        PROGRAM_ID
      );
      
      // Check if user token account exists
      try {
        await getAccount(connection, userTokenAccount);
      } catch (error) {
        toast.error(`You don't have a ${selectedPool.symbol} token account. Please fund your wallet first.`);
        setLoading(false);
        return;
      }
      
      // Convert amount to lamports (with 6 decimals)
      const amountLamports = new BN(Number(depositAmount) * 1000000);
      
      // Build transaction
      const tx = new Transaction();
      
      // Check if LP position account exists, if not, we might need to create it
      const lpPositionInfo = await connection.getAccountInfo(lpPositionPDA);
      console.log(`LP Position account ${lpPositionPDA.toBase58()} exists: ${lpPositionInfo !== null}`);
      
      // Log all accounts for debugging
      console.log("Deposit instruction accounts:", {
        user: publicKey.toBase58(),
        vaultAccount: vaultAccount.toBase58(),
        lpPosition: lpPositionPDA.toBase58(),
        userTokenAccount: userTokenAccount.toBase58(),
        vaultTokenAccount: vaultTokenAccount.toBase58(),
        tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
        systemProgram: SystemProgram.programId.toBase58(),
      });
      
      // Add deposit_liquidity instruction with all required accounts explicitly named
      const depositIx = await program.methods
        .depositLiquidity(amountLamports)
        .accounts({
          user: publicKey,
          vaultAccount: vaultAccount,
          lpPosition: lpPositionPDA,
          userTokenAccount: userTokenAccount,
          vaultTokenAccount: vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      
      tx.add(depositIx);
      
      console.log("Transaction built, sending...");
      // Send transaction
      const signature = await sendTransaction(tx, connection);
      console.log("Transaction signature:", signature);
      await connection.confirmTransaction(signature, 'confirmed');
      
      toast.success(`Successfully deposited ${depositAmount} ${selectedPool.symbol}`);
      
      // Refetch data
      fetchPoolDetails();
      fetchUserTokenBalance();
      
      // Clear form
      setDepositAmount('');
    } catch (error) {
      console.error("Error depositing liquidity:", error);
      const errorMessage = (error as any).message || "Unknown error";
      
      // Check for common error patterns and provide more helpful messages
      if (errorMessage.includes("insufficient funds")) {
        toast.error(`Insufficient ${selectedPool.symbol} balance in your wallet`);
      } else if (errorMessage.includes("Invalid PDA")) {
        toast.error("Invalid account configuration. The vault may not be properly initialized.");
      } else if (errorMessage.includes("not provided")) {
        toast.error("Missing account. Please check the console for details.");
      } else {
        toast.error(`Failed to deposit: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleWithdrawLiquidity = async () => {
    if (!publicKey || !selectedPool || !withdrawAmount || Number(withdrawAmount) <= 0) {
      toast.error("Please enter a valid amount to withdraw");
      return;
    }
    
    const userBalance = parseFloat(poolInfo?.details?.yourBalance || "0");
    if (Number(withdrawAmount) > userBalance) {
      toast.error(`You cannot withdraw more than your balance of ${userBalance} ${selectedPool.symbol}`);
      return;
    }
    
    setLoading(true);
    console.log("Starting withdraw process for", selectedPool.symbol);
    
    try {
      // Check required accounts
      const { vaultAccount, userTokenAccount, vaultTokenAccount } = await ensureRequiredAccounts(
        connection,
        publicKey,
        selectedPool.mint
      );
      
      if (!vaultAccount) {
        toast.error(`The ${selectedPool.symbol} vault has not been initialized yet`);
        setLoading(false);
        return;
      }
      
      if (!vaultTokenAccount) {
        toast.error(`The ${selectedPool.symbol} vault token account has not been initialized yet`);
        setLoading(false);
        return;
      }
      
      // Create Anchor provider and program
      const provider = new anchor.AnchorProvider(
        connection,
        { publicKey: publicKey!, sendTransaction } as any,
        { commitment: 'confirmed' }
      );
      
      const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);
      
      // Find PDAs
      const [vaultAuthority] = await PublicKey.findProgramAddress(
        [Buffer.from(VAULT_AUTHORITY_SEED), vaultAccount.toBuffer()],
        PROGRAM_ID
      );
      
      // Build transaction first
      const tx = new Transaction();
      
      // Check if the user token account exists
      try {
        await getAccount(connection, userTokenAccount);
      } catch (error) {
        console.log("Creating user token account...");
        // If token account doesn't exist, create it
        const createAtaIx = createAssociatedTokenAccountInstruction(
          publicKey,
          userTokenAccount,
          publicKey,
          selectedPool.mint
        );
        tx.add(createAtaIx);
      }
      
      const [lpPositionPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("lp-position"), vaultAccount.toBuffer(), publicKey!.toBuffer()],
        PROGRAM_ID
      );
      
      // Check if LP position exists
      const lpPositionInfo = await connection.getAccountInfo(lpPositionPDA);
      console.log(`LP Position account ${lpPositionPDA.toBase58()} exists: ${lpPositionInfo !== null}`);
      
      if (!lpPositionInfo) {
        toast.error("You don't have an LP position in this vault");
        setLoading(false);
        return;
      }
      
      // Find rebalancer PDA - where withdrawal fees go
      const [rebalancerPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("rebalancer")],
        PROGRAM_ID
      );
      
      // Find the pdaTreasuryToken (associated token account for the rebalancer PDA)
      const pdaTreasuryToken = await getAssociatedTokenAddress(
        selectedPool.mint,
        rebalancerPDA,
        true // allowOwnerOffCurve
      );
      
      // Log additional info about the PDA treasury token
      console.log(`PDA Treasury Token: ${pdaTreasuryToken.toBase58()}`);
      
      try {
        const treasuryTokenInfo = await connection.getAccountInfo(pdaTreasuryToken);
        console.log(`PDA Treasury Token exists: ${treasuryTokenInfo !== null}`);
      } catch (error) {
        console.error("Error checking PDA treasury token:", error);
      }
      
      // Convert amount to lamports (with 6 decimals)
      const amountLamports = new BN(Number(withdrawAmount) * 1000000);
      
      // Log all accounts for debugging
      console.log("Withdraw instruction accounts:", {
        user: publicKey.toBase58(),
        vaultAccount: vaultAccount.toBase58(),
        vaultAuthority: vaultAuthority.toBase58(),
        lpPosition: lpPositionPDA.toBase58(),
        userTokenAccount: userTokenAccount.toBase58(),
        vaultTokenAccount: vaultTokenAccount.toBase58(),
        pdaTreasury: rebalancerPDA.toBase58(),
        pdaTreasuryToken: pdaTreasuryToken.toBase58(),
        tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
        systemProgram: SystemProgram.programId.toBase58(),
      });
      
      // Add withdraw_liquidity instruction with all required accounts explicitly named
      const withdrawIx = await program.methods
        .withdrawLiquidity(amountLamports)
        .accounts({
          user: publicKey,
          vaultAccount: vaultAccount,
          vaultAuthority: vaultAuthority,
          lpPosition: lpPositionPDA,
          userTokenAccount: userTokenAccount,
          vaultTokenAccount: vaultTokenAccount,
          pdaTreasury: rebalancerPDA,
          pdaTreasuryToken: pdaTreasuryToken,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      
      tx.add(withdrawIx);
      
      console.log("Transaction built, sending...");
      // Send transaction
      const signature = await sendTransaction(tx, connection);
      console.log("Transaction signature:", signature);
      await connection.confirmTransaction(signature, 'confirmed');
      
      toast.success(`Successfully withdrew ${withdrawAmount} ${selectedPool.symbol}`);
      
      // Refetch data
      fetchPoolDetails();
      fetchUserTokenBalance();
      
      // Clear form
      setWithdrawAmount('');
    } catch (error) {
      console.error("Error withdrawing liquidity:", error);
      const errorMessage = (error as any).message || "Unknown error";
      
      // Check for common error patterns and provide more helpful messages
      if (errorMessage.includes("insufficient funds")) {
        toast.error("Insufficient balance for transaction");
      } else if (errorMessage.includes("Invalid PDA")) {
        toast.error("Invalid account configuration. The vault may not be properly initialized.");
      } else if (errorMessage.includes("not provided")) {
        toast.error("Missing account. Please check the console for details.");
      } else {
        toast.error(`Failed to withdraw: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleMaxDeposit = () => {
    setDepositAmount(userTokenBalance.toString());
  };
  
  const handleMaxWithdraw = () => {
    setWithdrawAmount(poolInfo?.details?.yourBalance || "0");
  };
  
  // Enhance the debug function
  const checkVaultInitialization = async () => {
    if (!selectedPool) return;
    
    setLoading(true);
    setDebugInfo("");
    
    try {
      // Check if vault is initialized
      const { vaultPDA, exists } = await getInitializedVaultPDA(
        connection,
        selectedPool.mint,
        PROGRAM_ID
      );
      
      setVaultInitialized(exists);
      
      let info = `Vault PDA: ${vaultPDA.toBase58()}\nInitialized: ${exists ? "Yes" : "No"}\n`;
      
      if (exists) {
        // Find vault authority
        const [vaultAuthority] = await PublicKey.findProgramAddress(
          [Buffer.from(VAULT_AUTHORITY_SEED), vaultPDA.toBuffer()],
          PROGRAM_ID
        );
        
        info += `Vault Authority: ${vaultAuthority.toBase58()}\n`;
        
        // Find token account
        const vaultTokenAccount = await getAssociatedTokenAddress(
          selectedPool.mint,
          vaultAuthority,
          true // allowOwnerOffCurve
        );
        
        info += `Vault Token Account: ${vaultTokenAccount.toBase58()}\n`;
        
        // Check if token account exists
        try {
          const tokenAccountInfo = await connection.getAccountInfo(vaultTokenAccount);
          info += `Token Account Exists: ${tokenAccountInfo !== null ? "Yes" : "No"}\n`;
          
          if (tokenAccountInfo) {
            info += `Token Account Size: ${tokenAccountInfo.data.length} bytes\n`;
          }
        } catch (error) {
          info += `Error checking token account: ${(error as any).message}\n`;
        }
        
        // Add account data from Anchor if possible
        try {
          const provider = new anchor.AnchorProvider(
            connection,
            { publicKey: publicKey || new PublicKey("11111111111111111111111111111111"), signTransaction: async () => { throw new Error("Not implemented"); }, signAllTransactions: async () => { throw new Error("Not implemented"); } } as any,
            { commitment: 'confirmed' }
          );
          
          const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);
          const vaultData = await program.account.vaultAccount.fetch(vaultPDA);
          
          info += "\nVault Account Data:\n";
          info += "-------------------\n";
          // Safe stringify with circular reference handling
          info += JSON.stringify(
            vaultData,
            (key, value) => {
              if (typeof value === 'bigint') {
                return value.toString();
              }
              // Handle BN objects from Anchor
              if (value && typeof value === 'object' && value.toNumber) {
                return value.toNumber();
              }
              return value;
            },
            2
          ) + "\n";
          
          // If user is connected, try to fetch LP position
          if (publicKey) {
            const [lpPositionPDA] = await PublicKey.findProgramAddress(
              [Buffer.from("lp-position"), vaultPDA.toBuffer(), publicKey.toBuffer()],
              PROGRAM_ID
            );
            
            try {
              const lpPositionData = await program.account.lPPosition.fetch(lpPositionPDA);
              
              info += "\nLP Position Data:\n";
              info += "----------------\n";
              info += JSON.stringify(
                lpPositionData,
                (key, value) => {
                  if (typeof value === 'bigint') {
                    return value.toString();
                  }
                  // Handle BN objects from Anchor
                  if (value && typeof value === 'object' && value.toNumber) {
                    return value.toNumber();
                  }
                  return value;
                },
                2
              );
            } catch (error) {
              info += "\nNo LP position found for your wallet\n";
            }
          }
        } catch (error) {
          info += `\nError fetching account data: ${(error as any).message}\n`;
        }
      }
      
      setDebugInfo(info);
    } catch (error) {
      console.error("Error checking vault initialization:", error);
      setDebugInfo(`Error: ${(error as any).message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Add this function to the PoolDetailsPage component
  const checkIdlDefinitions = async () => {
    setLoading(true);
    try {
      const output = await debugIdlInstructions();
      setDebugInfo(output);
    } catch (error) {
      console.error("Error checking IDL definitions:", error);
      setDebugInfo(`Error: ${(error as any).message}`);
    } finally {
      setLoading(false);
    }
  };
  
  if (!selectedPool) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <Navbar current="pool" />
        <main className="flex-1 flex flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-cyan-400 mb-3">Pool not found</h2>
            <button 
              onClick={() => router.push('/pool')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold mt-4"
            >
              Back to Pools
            </button>
          </div>
        </main>
      </div>
    );
  }
  
  const displayPool = poolInfo || selectedPool;
  
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar current="pool" />
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      
      <main className="flex-1 flex flex-col px-4 py-8">
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-4 flex items-center">
            <button 
              onClick={() => router.push('/pool')}
              className="mr-3 p-2 rounded-full bg-gray-800 hover:bg-gray-700"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text">
                {displayPool.name} Vault
              </h1>
              <p className="text-gray-400 text-sm">{displayPool.details.description}</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left column - Pool details */}
            <div className="flex-1">
              <div className="bg-gradient-to-br from-gray-900/80 to-black/80 rounded-xl border border-gray-800 shadow-xl p-6">
                <h2 className="text-lg font-bold text-cyan-400 mb-4">Pool Statistics</h2>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-xs text-gray-400">Total Deposits</div>
                    <div className="text-lg font-bold text-cyan-400">{displayPool.details.totalDeposits}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-xs text-gray-400">Users</div>
                    <div className="text-lg font-bold text-purple-400">{displayPool.details.totalUsers}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-xs text-gray-400">Weekly Volume</div>
                    <div className="text-lg font-bold text-blue-400">{displayPool.details.weeklyVolume}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-xs text-gray-400">APR</div>
                    <div className="text-lg font-bold text-green-400">{displayPool.apr}</div>
                  </div>
                </div>
                
                <div className="bg-black/20 rounded-xl p-4 border border-gray-800/50 mb-4">
                  <div className="text-sm text-gray-400 mb-3">Weekly Activity</div>
                  <div className="h-20 flex items-end justify-between">
                    {displayPool.details.chart.map((value: number, i: number) => (
                      <div 
                        key={i} 
                        className="w-1/12 bg-gradient-to-t from-cyan-500 to-purple-500 rounded-sm" 
                        style={{ height: `${Math.max(value, 5)}%` }}
                      ></div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 text-center text-xs text-gray-500 mt-2">
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div>Sat</div>
                    <div>Sun</div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-300 leading-relaxed">
                  <p>
                    The {displayPool.name} vault allows you to earn yield on your {displayPool.symbol} deposits. 
                    Yields are generated from trading fees and cross-chain arbitrage opportunities.
                  </p>
                  <p className="mt-2">
                    All deposits are secured by multi-signature wallets and audited smart contracts for maximum security.
                  </p>
                </div>
              </div>
              
              {/* Add debug section at the bottom of left column */}
              <div className="mt-4 bg-gradient-to-br from-gray-900/80 to-black/80 rounded-xl border border-gray-800 shadow-xl p-4">
                <h3 className="text-sm font-bold text-cyan-400 mb-2">Developer Tools</h3>
                <button 
                  className="px-4 py-2 bg-gray-800 text-xs text-cyan-400 rounded-lg mb-2 w-full" 
                  onClick={checkVaultInitialization}
                  disabled={loading}
                >
                  {loading ? "Checking..." : "Check Vault Initialization"}
                </button>
                
                {vaultInitialized !== null && (
                  <div className="py-2 text-sm">
                    <div className={`font-bold ${vaultInitialized ? "text-green-400" : "text-red-400"}`}>
                      Vault Status: {vaultInitialized ? "Initialized" : "Not Initialized"}
                    </div>
                    {!vaultInitialized && (
                      <p className="text-xs text-gray-400 mt-1">
                        This vault needs to be initialized before deposits can be made.
                        Visit the initialize-pools page to set up this vault.
                      </p>
                    )}
                  </div>
                )}
                
                {debugInfo && (
                  <div className="mt-2 p-2 bg-black/50 rounded border border-gray-800 overflow-x-auto">
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap break-all">
                      {debugInfo}
                    </pre>
                  </div>
                )}
                
                <button 
                  className="px-4 py-2 bg-gray-800 text-xs text-cyan-400 rounded-lg mb-2 w-full" 
                  onClick={checkIdlDefinitions}
                  disabled={loading}
                >
                  Check IDL Definitions
                </button>
              </div>
            </div>
            
            {/* Right column - Deposit/Withdraw interface */}
            <div className="flex-1">
              <div className="bg-gradient-to-br from-gray-900/80 to-black/80 rounded-xl border border-gray-800 shadow-xl p-6">
                <h2 className="text-lg font-bold text-cyan-400 mb-4">Manage Your Position</h2>
                
                <div className="flex gap-2 mb-6 bg-black/40 p-1 rounded-full">
                  <button 
                    onClick={() => setActiveTab('deposit')} 
                    className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === 'deposit' ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-black' : 'text-gray-400'}`}
                  >
                    Deposit
                  </button>
                  <button 
                    onClick={() => setActiveTab('withdraw')} 
                    className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${activeTab === 'withdraw' ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-black' : 'text-gray-400'}`}
                  >
                    Withdraw
                  </button>
                </div>
                
                {activeTab === 'deposit' ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-sm text-gray-400">Amount to Deposit</label>
                        <span className="text-xs text-gray-500">Balance: {userTokenBalance.toFixed(2)} {displayPool.symbol}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={depositAmount}
                          onChange={e => setDepositAmount(e.target.value)}
                          className="flex-1 bg-black/60 border border-gray-700 rounded-lg px-4 py-3 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder-gray-500"
                          disabled={loading}
                        />
                        <button 
                          className="bg-gray-800 px-3 rounded-lg font-bold text-cyan-400"
                          onClick={handleMaxDeposit}
                          disabled={loading}
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-400 bg-black/30 p-3 rounded-lg">
                      <div className="flex justify-between py-1">
                        <span>Expected APR</span>
                        <span className="text-green-400">{displayPool.apr}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Transaction Fee</span>
                        <span>0.1%</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Slippage Tolerance</span>
                        <span>0.5%</span>
                      </div>
                    </div>
                    
                    <button 
                      className={`w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold text-lg shadow-lg hover:scale-[1.02] transition-transform ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                      onClick={handleDepositLiquidity}
                      disabled={loading || !publicKey}
                    >
                      {loading ? 'Processing...' : `Deposit ${displayPool.symbol}`}
                    </button>
                    
                    {!publicKey && (
                      <div className="text-center text-sm text-red-400 mt-2">
                        Please connect your wallet first
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-sm text-gray-400">Amount to Withdraw</label>
                        <span className="text-xs text-gray-500">Your balance: {displayPool.details.yourBalance} {displayPool.symbol}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={withdrawAmount}
                          onChange={e => setWithdrawAmount(e.target.value)}
                          className="flex-1 bg-black/60 border border-gray-700 rounded-lg px-4 py-3 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder-gray-500"
                          disabled={loading}
                        />
                        <button 
                          className="bg-gray-800 px-3 rounded-lg font-bold text-cyan-400"
                          onClick={handleMaxWithdraw}
                          disabled={loading}
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-400 bg-black/30 p-3 rounded-lg">
                      <div className="flex justify-between py-1">
                        <span>Withdrawal Fee</span>
                        <span className="text-amber-400">{withdrawalFee}</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Slippage Tolerance</span>
                        <span>0.5%</span>
                      </div>
                      {parseFloat(withdrawalFee) > 0 && (
                        <div className="mt-2 text-xs text-amber-500/80 border-t border-gray-700 pt-2">
                          Note: Early withdrawal penalties apply. All fees are used for vault rebalancing.
                        </div>
                      )}
                    </div>
                    
                    <button 
                      className={`w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold text-lg shadow-lg hover:scale-[1.02] transition-transform ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                      onClick={handleWithdrawLiquidity}
                      disabled={loading || !publicKey || parseFloat(displayPool.details.yourBalance) <= 0}
                    >
                      {loading ? 'Processing...' : `Withdraw ${displayPool.symbol}`}
                    </button>
                    
                    {!publicKey && (
                      <div className="text-center text-sm text-red-400 mt-2">
                        Please connect your wallet first
                      </div>
                    )}
                    
                    {publicKey && parseFloat(displayPool.details.yourBalance) <= 0 && (
                      <div className="text-center text-sm text-amber-400 mt-2">
                        You don't have any {displayPool.symbol} deposited in this vault
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 