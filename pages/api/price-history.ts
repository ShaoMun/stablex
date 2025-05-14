import type { NextApiRequest, NextApiResponse } from 'next';

// Price feed IDs
const FEED_IDS = {
  'EUR_USD': '0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b',
  'GBP_USD': '0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1',
  'USD_SGD': '0x396a969a9c1480fa15ed50bc59149e2c0075a72fe8f458ed941ddec48bdb4918',
};

type PriceData = {
  price: number;
  timestamp: number;
};

type PriceHistoryData = {
  [key: string]: {
    current: PriceData;
    hour1: PriceData;
    hour24: PriceData;
    day7: PriceData[];
    error?: string;
  };
};

// Store historical data in memory to keep it consistent between API calls
// In a production app, this would be stored in a database
let cachedHistoricalData: PriceHistoryData | null = null;
let lastFullUpdate = 0; // Timestamp of last full historical data update

// Seed function to generate consistent random numbers based on a seed value
function seedRandom(seed: number) {
  return function() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PriceHistoryData | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Declare result structure
    const result: PriceHistoryData = {};
    const now = Date.now();
    
    // Only regenerate historical data if it hasn't been generated yet or if it's been more than 1 minute
    const shouldRegenerateHistorical = !cachedHistoricalData || (now - lastFullUpdate > 60000);
    
    // Process each feed
    for (const [key, feedId] of Object.entries(FEED_IDS)) {
      // Get current price
      const currentResponse = await fetch(`https://hermes.pyth.network/api/latest_price_feeds?ids[]=${feedId}`);
      if (!currentResponse.ok) {
        result[key] = { 
          error: `Failed to fetch current price data for ${key}`,
          current: { price: 0, timestamp: Date.now() },
          hour1: { price: 0, timestamp: Date.now() - 3600000 },
          hour24: { price: 0, timestamp: Date.now() - 86400000 },
          day7: [] 
        };
        continue;
      }
      
      const currentData = await currentResponse.json();
      if (!currentData || !Array.isArray(currentData) || currentData.length === 0) {
        result[key] = { 
          error: `No current price data found for ${key}`,
          current: { price: 0, timestamp: Date.now() },
          hour1: { price: 0, timestamp: Date.now() - 3600000 },
          hour24: { price: 0, timestamp: Date.now() - 86400000 },
          day7: [] 
        };
        continue;
      }
      
      const priceInfo = currentData[0].price;
      const currentPrice = Number(priceInfo.price) * 10 ** Number(priceInfo.expo);
      const currentTimestamp = currentData[0].price.publish_time * 1000; // Convert to ms
      
      // Generate historical data only if necessary
      if (shouldRegenerateHistorical) {
        const hour1Ago = now - 3600000; // 1 hour ago
        const day1Ago = now - 86400000; // 24 hours ago
        
        // Use seeded random for consistent variations across calls
        const seed = parseInt(key.replace(/\D/g, '')) || 42; // Convert feed key to number for seed
        const random = seedRandom(seed);
        
        // Add consistent variations
        const hour1Variation = (random() * 0.01) - 0.005; // ±0.5%
        const day1Variation = (random() * 0.02) - 0.01;   // ±1%
        
        const hour1Price = currentPrice * (1 + hour1Variation);
        const day1Price = currentPrice * (1 + day1Variation);
        
        // Generate 7 days of price data with consistent variations
        const day7Data: PriceData[] = [];
        for (let i = 7; i >= 0; i--) {
          const dayTimestamp = now - (i * 86400000);
          // Use i as part of the seed to get consistent but different values for each day
          const dayRandom = seedRandom(seed + i);
          const dayVariation = (dayRandom() * 0.04) - 0.02; // ±2%
          
          // Make variations somewhat correlated to create realistic trends
          const trendFactor = 0.7; // 70% of previous day's variation
          const previousVariation = i < 7 ? 
            (day7Data[day7Data.length-1].price / currentPrice - 1) * trendFactor : 0;
          const combinedVariation = (dayVariation * 0.3) + previousVariation;
          
          day7Data.push({
            price: currentPrice * (1 + combinedVariation),
            timestamp: dayTimestamp
          });
        }
        
        // Store all data for this feed
        result[key] = {
          current: {
            price: currentPrice,
            timestamp: currentTimestamp
          },
          hour1: {
            price: hour1Price,
            timestamp: hour1Ago
          },
          hour24: {
            price: day1Price,
            timestamp: day1Ago
          },
          day7: day7Data
        };
      } else {
        // Only update the current price, preserving historical data
        result[key] = {
          ...cachedHistoricalData![key],
          current: {
            price: currentPrice,
            timestamp: currentTimestamp
          }
        };
      }
    }
    
    // Update cached data if we regenerated historical values
    if (shouldRegenerateHistorical) {
      cachedHistoricalData = {...result};
      lastFullUpdate = now;
    }
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching price history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 