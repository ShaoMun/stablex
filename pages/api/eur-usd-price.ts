import type { NextApiRequest, NextApiResponse } from 'next';

// EUR/USD price feed ID
const EUR_USD_FEED_ID = "0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b";

type Data = {
  usdAmount?: number;
  eurUsdPrice?: number;
  eurEquivalent?: number;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { usdAmount } = req.body;
    if (!usdAmount || isNaN(Number(usdAmount)) || Number(usdAmount) <= 0) {
      return res.status(400).json({ error: 'Invalid USD amount' });
    }

    const response = await fetch(`https://hermes.pyth.network/api/latest_price_feeds?ids[]=${EUR_USD_FEED_ID}`);
    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch price data' });
    }
    const data = await response.json();
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(500).json({ error: 'No price data found' });
    }
    const priceInfo = data[0].price;
    const eurUsdPrice = Number(priceInfo.price) * 10 ** Number(priceInfo.expo);
    if (!eurUsdPrice || eurUsdPrice <= 0) {
      return res.status(500).json({ error: 'Invalid price data' });
    }
    const eurEquivalent = Number(usdAmount) * eurUsdPrice; // Note: For EUR/USD, we multiply by the rate
    return res.status(200).json({
      usdAmount: Number(usdAmount),
      eurUsdPrice,
      eurEquivalent
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
} 