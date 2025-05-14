import type { NextApiRequest, NextApiResponse } from 'next';

// USD/SGD price feed ID
const USD_SGD_FEED_ID = "0x396a969a9c1480fa15ed50bc59149e2c0075a72fe8f458ed941ddec48bdb4918";

type Data = {
  usdAmount?: number;
  usdSgdPrice?: number;
  sgdEquivalent?: number;
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

    const response = await fetch(`https://hermes.pyth.network/api/latest_price_feeds?ids[]=${USD_SGD_FEED_ID}`);
    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to fetch price data' });
    }
    const data = await response.json();
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(500).json({ error: 'No price data found' });
    }
    const priceInfo = data[0].price;
    const usdSgdPrice = Number(priceInfo.price) * 10 ** Number(priceInfo.expo);
    if (!usdSgdPrice || usdSgdPrice <= 0) {
      return res.status(500).json({ error: 'Invalid price data' });
    }
    const sgdEquivalent = Number(usdAmount) * usdSgdPrice;
    return res.status(200).json({
      usdAmount: Number(usdAmount),
      usdSgdPrice,
      sgdEquivalent
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
} 