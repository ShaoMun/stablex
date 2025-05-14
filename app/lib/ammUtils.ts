import { PRICE_SCALE, SPREAD_SLOPE, DRIFT_SLOPE, MIN_SPREAD_BPS, MAX_SPREAD_BPS } from './constants';

/**
 * Calculate vault health (balance ratio)
 * @param sourceAmount Amount in source vault
 * @param targetAmount Amount in target vault
 * @returns Vault health value between 0 and 1
 */
export const calculateVaultHealth = (sourceAmount: number, targetAmount: number): number => {
  if (sourceAmount === 0 || targetAmount === 0) {
    return 0;
  }
  
  const minAmount = Math.min(sourceAmount, targetAmount);
  const maxAmount = Math.max(sourceAmount, targetAmount);
  
  return minAmount / maxAmount;
};

/**
 * Calculate spread in basis points based on vault health
 * @param sourceAmount Amount in source vault
 * @param targetAmount Amount in target vault
 * @returns Spread in basis points
 */
export const calculateSpreadBps = (sourceAmount: number, targetAmount: number): number => {
  const vaultHealth = calculateVaultHealth(sourceAmount, targetAmount);
  
  // Convert basis points to percentage for calculation
  const minSpread = MIN_SPREAD_BPS * 0.01; // 0.03%
  
  // Calculate using the formula
  let spreadPercentage;
  if (vaultHealth > 0.9) {
    spreadPercentage = minSpread;
  } else {
    const adjustment = SPREAD_SLOPE * (vaultHealth - 0.9);
    spreadPercentage = Math.max(minSpread, minSpread - adjustment);
  }
  
  // Convert back to basis points and ensure within limits
  const spreadBps = Math.round(spreadPercentage * 100);
  return Math.min(spreadBps, MAX_SPREAD_BPS);
};

/**
 * Calculate drift percentage based on vault health
 * @param sourceAmount Amount in source vault
 * @param targetAmount Amount in target vault
 * @returns Drift as a percentage (0 to 1)
 */
export const calculateDrift = (sourceAmount: number, targetAmount: number): number => {
  const vaultHealth = calculateVaultHealth(sourceAmount, targetAmount);
  
  if (vaultHealth >= 0.9) {
    return 0;
  } else {
    const adjustment = DRIFT_SLOPE * (vaultHealth - 0.9);
    return Math.max(0, -adjustment);
  }
};

/**
 * Apply drift to oracle price
 * @param oraclePrice Oracle price scaled by PRICE_SCALE
 * @param driftPercentage Drift as percentage (0 to 1)
 * @param sourceToTarget Direction of conversion
 * @returns Adjusted price with drift
 */
export const applyDriftToPrice = (
  oraclePrice: number, 
  driftPercentage: number, 
  sourceToTarget: boolean
): number => {
  const driftAdjustment = oraclePrice * driftPercentage;
  
  if (sourceToTarget) {
    // When buying target currency, decrease the exchange rate (get less target)
    return oraclePrice - driftAdjustment;
  } else {
    // When selling target currency, increase the exchange rate (get less source)
    return oraclePrice + driftAdjustment;
  }
};

/**
 * Calculate swap output amount including drift and spread
 * @param amountIn Input amount
 * @param oraclePrice Oracle price scaled by PRICE_SCALE
 * @param sourceAmount Source vault TVL
 * @param targetAmount Target vault TVL
 * @param sourceToTarget Direction of swap
 * @returns Object with output amount, spread, drift, and fee information
 */
export const calculateSwapOutput = (
  amountIn: number,
  oraclePrice: number,
  sourceAmount: number,
  targetAmount: number,
  sourceToTarget: boolean
): {
  amountOut: number;
  amountOutWithoutFees: number;
  spreadBps: number;
  driftPercentage: number;
  feeAmount: number;
  adjustedPrice: number;
  priceImpactPercentage: number;
} => {
  // Calculate spread and drift
  const spreadBps = calculateSpreadBps(sourceAmount, targetAmount);
  const driftPercentage = calculateDrift(sourceAmount, targetAmount);
  
  // Apply drift to oracle price
  const adjustedPrice = applyDriftToPrice(oraclePrice, driftPercentage, sourceToTarget);
  
  // Calculate amount out before fees
  let amountOutWithoutFees;
  if (sourceToTarget) {
    // Source to target (e.g., EUR to USD)
    amountOutWithoutFees = (amountIn * adjustedPrice) / PRICE_SCALE;
  } else {
    // Target to source (e.g., USD to EUR)
    amountOutWithoutFees = (amountIn * PRICE_SCALE) / adjustedPrice;
  }
  
  // Calculate fee amount
  const feeAmount = (amountOutWithoutFees * spreadBps) / 10000;
  
  // Calculate final amount out after fee
  const amountOut = amountOutWithoutFees - feeAmount;
  
  // Calculate price impact percentage compared to oracle price
  let originalAmountOut;
  if (sourceToTarget) {
    originalAmountOut = (amountIn * oraclePrice) / PRICE_SCALE;
  } else {
    originalAmountOut = (amountIn * PRICE_SCALE) / oraclePrice;
  }
  
  const priceImpactPercentage = ((originalAmountOut - amountOut) / originalAmountOut) * 100;
  
  return {
    amountOut,
    amountOutWithoutFees,
    spreadBps,
    driftPercentage,
    feeAmount,
    adjustedPrice,
    priceImpactPercentage
  };
};

/**
 * Calculate the fee distribution between LPs, PDA, and protocol
 * @param totalFeeAmount Total fee amount collected
 * @param vaultHealth Vault health value
 * @returns Object with fee distribution
 */
export const calculateFeeDistribution = (
  totalFeeAmount: number,
  vaultHealth: number
): { lpFee: number, pdaFee: number, protocolFee: number } => {
  // 70% goes to LPs
  const lpFee = totalFeeAmount * 0.7;
  
  // Remaining 30% split between PDA and protocol based on vault health
  let pdaPercent = 0;
  let protocolPercent = 0;
  
  if (vaultHealth > 0.7) {
    pdaPercent = 15;
    protocolPercent = 15;
  } else if (vaultHealth > 0.5) {
    pdaPercent = 20;
    protocolPercent = 10;
  } else if (vaultHealth > 0.3) {
    pdaPercent = 25;
    protocolPercent = 5;
  } else {
    pdaPercent = 30;
    protocolPercent = 0;
  }
  
  const pdaFee = totalFeeAmount * (pdaPercent / 100);
  const protocolFee = totalFeeAmount * (protocolPercent / 100);
  
  return { lpFee, pdaFee, protocolFee };
};

/**
 * Calculate the withdrawal penalty based on deposit time
 * @param depositTimestamp Timestamp when deposit was made
 * @param currentTimestamp Current timestamp
 * @returns Penalty percentage (0-2%)
 */
export const calculateWithdrawalPenalty = (
  depositTimestamp: number,
  currentTimestamp: number = Date.now() / 1000
): number => {
  const hoursSinceDeposit = (currentTimestamp - depositTimestamp) / (60 * 60);
  
  if (hoursSinceDeposit < 60) {
    return 2.0;
  } else if (hoursSinceDeposit < 120) {
    return 1.5;
  } else if (hoursSinceDeposit < 180) {
    return 1.0;
  } else if (hoursSinceDeposit < 240) {
    return 0.5;
  } else {
    return 0.0;
  }
}; 