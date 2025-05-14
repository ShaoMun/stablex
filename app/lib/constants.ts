import { PublicKey } from '@solana/web3.js';

// Program ID
export const FX_VAULT_DEX_PROGRAM_ID = new PublicKey('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS');

// Supported currencies
export interface CurrencyInfo {
  symbol: string;
  name: string;
  mint: string;
  icon: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    icon: '/icons/usdc.svg',
    decimals: 6,
  },
  {
    symbol: 'EURO',
    name: 'Euro Stablecoin',
    mint: 'CbNYA9n3927uXUukee2Hf4tm3xxkffJPPZvGazc2EAH1',
    icon: '/icons/euro.svg',
    decimals: 6,
  },
  {
    symbol: 'GBP',
    name: 'British Pound',
    mint: 'FYx3B9Wj3EtJ8JbS7xKQzQjmJqJ7mEPCLzvZPw884uXc',
    icon: '/icons/gbp.svg',
    decimals: 6,
  },
  {
    symbol: 'JPY',
    name: 'Japanese Yen',
    mint: '3sEtZ8xK3dGpfYArepGvT8oaUtSRvwh7vuGF1XQD3i8Z',
    icon: '/icons/jpy.svg',
    decimals: 6,
  },
];

// Currency pairs for rates page
export interface CurrencyPair {
  from: string; // Symbol
  to: string;   // Symbol
  oracle: string; // Oracle account address
}

export const CURRENCY_PAIRS: CurrencyPair[] = [
  {
    from: 'USDC',
    to: 'EURO',
    oracle: 'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD',
  },
  {
    from: 'USDC',
    to: 'GBP',
    oracle: '8gJGKiwXKuPn8R8QZw3AhtxvR55wPCLUKV8q8uiU6QZ2',
  },
  {
    from: 'USDC',
    to: 'JPY',
    oracle: '3GHrfqN5CrNHmWNimUqLz4f3RQbzyCRatkZ6Ffa5FZBZ',
  },
  {
    from: 'EURO',
    to: 'USDC',
    oracle: 'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD',
  },
  {
    from: 'EURO',
    to: 'GBP',
    oracle: '4GBwxLKmQP9WQjPS6UWcArjUYqKB9QYEQdq7MFGpAJV1',
  },
  {
    from: 'GBP',
    to: 'USDC',
    oracle: '8gJGKiwXKuPn8R8QZw3AhtxvR55wPCLUKV8q8uiU6QZ2',
  },
  {
    from: 'GBP',
    to: 'EURO',
    oracle: '4GBwxLKmQP9WQjPS6UWcArjUYqKB9QYEQdq7MFGpAJV1',
  },
  {
    from: 'JPY',
    to: 'USDC',
    oracle: '3GHrfqN5CrNHmWNimUqLz4f3RQbzyCRatkZ6Ffa5FZBZ',
  },
];

// Constants for math calculations
export const PRICE_SCALE = 1_000_000_000; // 10^9
export const SPREAD_SLOPE = 0.002833;     // 0.2833%
export const DRIFT_SLOPE = 0.008333;      // 0.8333%
export const MIN_SPREAD_BPS = 3;          // 0.03% minimum spread
export const MAX_SPREAD_BPS = 50;         // 0.5% maximum spread

// Seeds for PDAs
export const VAULT_ACCOUNT_SEED = "vault-account";
export const LP_POSITION_SEED = "lp-position";
export const VAULT_AUTHORITY_SEED = "vault-authority";

// Withdrawal penalty fee schedule
export const WITHDRAWAL_PENALTIES = [
  { hours: 0, fee: 2.00 },
  { hours: 60, fee: 1.50 },
  { hours: 120, fee: 1.00 },
  { hours: 180, fee: 0.50 },
  { hours: 240, fee: 0.00 },
];

// Helper to format currency amounts
export const formatCurrency = (amount: number, symbol: string, decimals: number = 2): string => {
  return `${amount.toLocaleString(undefined, { 
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })} ${symbol}`;
};

// Helper to format percentage
export const formatPercentage = (percentage: number, decimals: number = 2): string => {
  return `${percentage.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: 'exceptZero'
  })}%`;
}; 