import type { NextApiRequest, NextApiResponse } from 'next';

// GBP/USD price feed ID
const GBP_USD_FEED_ID = "0x84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1";

type Data = {
  usdAmount?: number;
  gbpUsdPrice?: number;
  gbpEquivalent?: number;
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

    const response = await fetch(`https://hermes.pyth.network/api/latest_price_feeds?ids[]=${GBP_USD_FEED_ID}`);
    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch price data' });
    }
    const data = await response.json();
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(500).json({ error: 'No price data found' });
    }
    const priceInfo = data[0].price;
    const gbpUsdPrice = Number(priceInfo.price) * 10 ** Number(priceInfo.expo);
    if (!gbpUsdPrice || gbpUsdPrice <= 0) {
      return res.status(500).json({ error: 'Invalid price data' });
    }
    const gbpEquivalent = Number(usdAmount) * gbpUsdPrice;
    return res.status(200).json({
      usdAmount: Number(usdAmount),
      gbpUsdPrice,
      gbpEquivalent
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
} 