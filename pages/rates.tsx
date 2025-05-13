import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';

const currencies = [
  { symbol: 'USDC', name: 'USD Coin', flag: '🇺🇸', change24h: '+0.05%', changeType: 'positive', rate24hAgo: 4.69 },
  { symbol: 'MYRC', name: 'Malaysian Ringgit Coin', flag: '🇲🇾', change24h: '-0.12%', changeType: 'negative', rate24hAgo: 0.212 },
  { symbol: 'THBC', name: 'Thai Baht Coin', flag: '🇹🇭', change24h: '+0.23%', changeType: 'positive', rate24hAgo: 0.0281 },
];

// Type definitions
type CurrencySymbol = 'USDC' | 'MYRC' | 'THBC';
type RateInfo = { buy: number; sell: number };
type ExchangeRateStructure = {
  [key in CurrencySymbol]: {
    [key in CurrencySymbol]?: RateInfo;
  };
};

// Exchange rates relative to 1 USDC
const exchangeRates: ExchangeRateStructure = {
  'USDC': {
    'MYRC': { buy: 4.69, sell: 4.71 },
    'THBC': { buy: 35.05, sell: 35.35 }
  },
  'MYRC': {
    'USDC': { buy: 0.209, sell: 0.211 },
    'THBC': { buy: 7.46, sell: 7.50 }
  },
  'THBC': {
    'USDC': { buy: 0.0282, sell: 0.0285 },
    'MYRC': { buy: 0.133, sell: 0.135 }
  }
};

export default function RatesPage() {
  const [mainCurrency, setMainCurrency] = useState<CurrencySymbol>('USDC');
  const [currentDate, setCurrentDate] = useState<string>('');
  
  useEffect(() => {
    // Set the date client-side to avoid hydration mismatch
    setCurrentDate(new Date().toLocaleDateString());
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar current="rates" />
      
      <main className="flex-1 flex flex-col px-4 py-8">
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text">Conversion Table</h1>
              <p className="text-gray-400 text-sm">Current forex rates for stablecoin trading</p>
            </div>
            
            <div className="bg-gray-900/80 rounded-full px-4 py-2 inline-flex items-center gap-2">
              <span className="text-sm text-gray-400">Base Currency</span>
              <select
                value={mainCurrency}
                onChange={e => setMainCurrency(e.target.value as CurrencySymbol)}
                className="bg-transparent border-none rounded-lg text-lg font-bold text-cyan-400 focus:outline-none"
              >
                {currencies.map(c => (
                  <option key={c.symbol} value={c.symbol}>{c.symbol}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900/80 to-black/80 shadow-xl">
            <table className="w-full">
              <thead>
                <tr className="bg-black/40 text-sm">
                  <th className="text-left p-4">Currency</th>
                  <th className="text-center p-4">Buy (1 {mainCurrency})</th>
                  <th className="text-center p-4">Sell (1 {mainCurrency})</th>
                  <th className="text-center p-4">24H Ago</th>
                  <th className="text-center p-4">24H Change</th>
                </tr>
              </thead>
              <tbody>
                {currencies.filter(c => c.symbol !== mainCurrency).map((currency, index) => {
                  const rates = exchangeRates[mainCurrency as CurrencySymbol][currency.symbol as CurrencySymbol] || { buy: 0, sell: 0 };
                  const rate24hAgo = currency.symbol === 'USDC' ? 
                    currency.rate24hAgo : 
                    mainCurrency === 'USDC' ? currency.rate24hAgo : 
                    (exchangeRates[mainCurrency as CurrencySymbol][currency.symbol as CurrencySymbol]?.buy || 0) * 0.99;
                  
                  return (
                    <motion.tr 
                      key={currency.symbol}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{currency.flag}</span>
                          <div>
                            <span className="font-semibold block">{currency.symbol}</span>
                            <span className="text-xs text-gray-400">{currency.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="font-mono text-cyan-400 font-bold">
                          {rates.buy.toFixed(4)} {currency.symbol}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="font-mono text-cyan-400 font-bold">
                          {rates.sell.toFixed(4)} {currency.symbol}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="font-mono text-gray-400 font-medium">
                          {rate24hAgo.toFixed(4)} {currency.symbol}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`${currency.changeType === 'positive' ? 'text-green-400' : 'text-red-400'} font-medium`}>
                          {currency.change24h}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-right text-xs text-gray-500">
            {currentDate ? `Rates updated as of ${currentDate} • Refreshes every 5 minutes` : 'Loading rates...'}
          </div>
        </div>
      </main>
    </div>
  );
} 