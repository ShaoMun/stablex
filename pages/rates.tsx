import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Type definitions
type CurrencySymbol = 'USDC' | 'EUR' | 'GBP' | 'SGD';
type RateInfo = { buy: number; sell: number };
type ExchangeRateStructure = {
  [key in CurrencySymbol]: {
    [key in CurrencySymbol]?: RateInfo;
  };
};

// Price data types
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

// Rate change type
type RateChange = {
  hour1: number;
  hour24: number;
  day7: number;
};

// Rate changes for all currency pairs
type RateChangesStructure = {
  [fromCurrency in CurrencySymbol]?: {
    [toCurrency in CurrencySymbol]?: RateChange;
  };
};

// Currencies - basic info only, rates will be populated from API
const currencies = [
  { symbol: 'USDC' as CurrencySymbol, name: 'USD Coin', flag: '🇺🇸' },
  { symbol: 'EUR' as CurrencySymbol, name: 'Euro', flag: '🇪🇺' },
  { symbol: 'GBP' as CurrencySymbol, name: 'British Pound', flag: '🇬🇧' },
  { symbol: 'SGD' as CurrencySymbol, name: 'Singapore Dollar', flag: '🇸🇬' },
];

export default function RatesPage() {
  const [mainCurrency, setMainCurrency] = useState<CurrencySymbol>('USDC');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [eurUsdRate, setEurUsdRate] = useState<number | null>(null);
  const [gbpUsdRate, setGbpUsdRate] = useState<number | null>(null);
  const [usdSgdRate, setUsdSgdRate] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number>(0);
  const [historicalData, setHistoricalData] = useState<PriceHistoryData>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [rateChanges, setRateChanges] = useState<RateChangesStructure>({});
  
  // Exchange rates relative to 1 USDC (will be updated with real data)
  const [exchangeRates, setExchangeRates] = useState<ExchangeRateStructure>({
    'USDC': {
      'EUR': { buy: 0, sell: 0 },
      'GBP': { buy: 0, sell: 0 },
      'SGD': { buy: 0, sell: 0 }
    },
    'EUR': {
      'USDC': { buy: 0, sell: 0 },
      'GBP': { buy: 0, sell: 0 },
      'SGD': { buy: 0, sell: 0 }
    },
    'GBP': {
      'USDC': { buy: 0, sell: 0 },
      'EUR': { buy: 0, sell: 0 },
      'SGD': { buy: 0, sell: 0 }
    },
    'SGD': {
      'USDC': { buy: 0, sell: 0 },
      'EUR': { buy: 0, sell: 0 },
      'GBP': { buy: 0, sell: 0 }
    }
  });
  
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const secondsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all price history data
  const fetchPriceHistory = async () => {
    try {
      const response = await fetch('/api/price-history');
      if (!response.ok) {
        throw new Error('Failed to fetch price history');
      }
      
      const data: PriceHistoryData = await response.json();
      
      // Only update the historical data on first load or every minute
      // This prevents constant fluctuations in the historical data display
      if (Object.keys(historicalData).length === 0 || 
          (lastUpdated && (new Date().getTime() - lastUpdated.getTime() > 60000))) {
        setHistoricalData(data);
      }
      
      // Always update current rates
      // Extract current rates
      if (data.EUR_USD && data.EUR_USD.current) {
        setEurUsdRate(data.EUR_USD.current.price);
      }
      
      if (data.GBP_USD && data.GBP_USD.current) {
        setGbpUsdRate(data.GBP_USD.current.price);
      }
      
      if (data.USD_SGD && data.USD_SGD.current) {
        setUsdSgdRate(data.USD_SGD.current.price);
      }
      
      // Update exchange rates with real data
      updateExchangeRates(
        data.EUR_USD?.current.price || 0, 
        data.GBP_USD?.current.price || 0, 
        data.USD_SGD?.current.price || 0
      );
      
      // Also update historical exchange rates and calculate the changes
      updateHistoricalRates(data);
      
      setLastUpdated(new Date());
      setSecondsSinceUpdate(0);
      setIsLoading(false);
      
      return true;
    } catch (error) {
      console.error('Error fetching price history:', error);
      return false;
    }
  };
  
  // Update historical exchange rates and calculate the percentage changes
  const updateHistoricalRates = (data: PriceHistoryData) => {
    const changes: RateChangesStructure = {};
    
    // Initialize changes for all currency pairs
    currencies.forEach(fromCurr => {
      const fromKey = fromCurr.symbol as CurrencySymbol;
      changes[fromKey] = {};
      
      currencies.forEach(toCurr => {
        const toKey = toCurr.symbol as CurrencySymbol;
        
        if (fromKey !== toKey) {
          if (!changes[fromKey]) {
            changes[fromKey] = {};
          }
          changes[fromKey]![toKey] = { hour1: 0, hour24: 0, day7: 0 };
          
          // Current rates
          let currentRate = 0;
          
          // For USD-based rates (direct from the API data)
          if (fromKey === 'USDC') {
            if (toKey === 'EUR' && data.EUR_USD) {
              // USDC to EUR (use EUR/USD directly)
              const current = data.EUR_USD.current.price;
              const hour1 = data.EUR_USD.hour1.price;
              const hour24 = data.EUR_USD.hour24.price;
              const day7 = data.EUR_USD.day7.length > 0 ? data.EUR_USD.day7[0].price : current;
              
              currentRate = current;
              if (!changes[fromKey]) {
                changes[fromKey] = {};
              }
              changes[fromKey]![toKey] = {
                hour1: ((current - hour1) / hour1) * 100,
                hour24: ((current - hour24) / hour24) * 100,
                day7: ((current - day7) / day7) * 100
              };
            }
            else if (toKey === 'GBP' && data.GBP_USD) {
              // USDC to GBP (use GBP/USD directly)
              const current = data.GBP_USD.current.price;
              const hour1 = data.GBP_USD.hour1.price;
              const hour24 = data.GBP_USD.hour24.price;
              const day7 = data.GBP_USD.day7.length > 0 ? data.GBP_USD.day7[0].price : current;
              
              currentRate = current;
              if (!changes[fromKey]) {
                changes[fromKey] = {};
              }
              changes[fromKey]![toKey] = {
                hour1: ((current - hour1) / hour1) * 100,
                hour24: ((current - hour24) / hour24) * 100,
                day7: ((current - day7) / day7) * 100
              };
            }
            else if (toKey === 'SGD' && data.USD_SGD) {
              // USDC to SGD (use USD/SGD but invert since we want SGD rate)
              const current = data.USD_SGD.current.price;
              const hour1 = data.USD_SGD.hour1.price;
              const hour24 = data.USD_SGD.hour24.price;
              const day7 = data.USD_SGD.day7.length > 0 ? data.USD_SGD.day7[0].price : current;
              
              currentRate = current;
              // Note: For USD_SGD, increase in rate means weaker SGD, so we invert the calculation
              if (!changes[fromKey]) {
                changes[fromKey] = {};
              }
              changes[fromKey]![toKey] = {
                hour1: ((hour1 - current) / hour1) * 100,
                hour24: ((hour24 - current) / hour24) * 100,
                day7: ((day7 - current) / day7) * 100
              };
            }
          }
          // For non-USD base (EUR, GBP, SGD to other currencies)
          else {
            if (toKey === 'USDC') {
              // Inverted rates (EUR to USDC, GBP to USDC, SGD to USDC)
              if (fromKey === 'EUR' && data.EUR_USD) {
                const current = 1 / data.EUR_USD.current.price;
                const hour1 = 1 / data.EUR_USD.hour1.price;
                const hour24 = 1 / data.EUR_USD.hour24.price;
                const day7 = data.EUR_USD.day7.length > 0 ? 1 / data.EUR_USD.day7[0].price : current;
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
              else if (fromKey === 'GBP' && data.GBP_USD) {
                const current = 1 / data.GBP_USD.current.price;
                const hour1 = 1 / data.GBP_USD.hour1.price;
                const hour24 = 1 / data.GBP_USD.hour24.price;
                const day7 = data.GBP_USD.day7.length > 0 ? 1 / data.GBP_USD.day7[0].price : current;
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
              else if (fromKey === 'SGD' && data.USD_SGD) {
                const current = 1 / data.USD_SGD.current.price;
                const hour1 = 1 / data.USD_SGD.hour1.price;
                const hour24 = 1 / data.USD_SGD.hour24.price;
                const day7 = data.USD_SGD.day7.length > 0 ? 1 / data.USD_SGD.day7[0].price : current;
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
            }
            // Cross rates (non-USD to non-USD)
            else {
              // Calculate cross rates and their historical changes
              // For example, EUR to GBP = (EUR/USD) / (GBP/USD)
              if (data.EUR_USD && data.GBP_USD && fromKey === 'EUR' && toKey === 'GBP') {
                const eurUsd = {
                  current: data.EUR_USD.current.price,
                  hour1: data.EUR_USD.hour1.price,
                  hour24: data.EUR_USD.hour24.price,
                  day7: data.EUR_USD.day7.length > 0 ? data.EUR_USD.day7[0].price : data.EUR_USD.current.price
                };
                
                const gbpUsd = {
                  current: data.GBP_USD.current.price,
                  hour1: data.GBP_USD.hour1.price,
                  hour24: data.GBP_USD.hour24.price,
                  day7: data.GBP_USD.day7.length > 0 ? data.GBP_USD.day7[0].price : data.GBP_USD.current.price
                };
                
                const current = eurUsd.current / gbpUsd.current;
                const hour1 = eurUsd.hour1 / gbpUsd.hour1;
                const hour24 = eurUsd.hour24 / gbpUsd.hour24;
                const day7 = eurUsd.day7 / gbpUsd.day7;
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
              else if (data.EUR_USD && data.USD_SGD && fromKey === 'EUR' && toKey === 'SGD') {
                const eurUsd = {
                  current: data.EUR_USD.current.price,
                  hour1: data.EUR_USD.hour1.price,
                  hour24: data.EUR_USD.hour24.price,
                  day7: data.EUR_USD.day7.length > 0 ? data.EUR_USD.day7[0].price : data.EUR_USD.current.price
                };
                
                const usdSgd = {
                  current: data.USD_SGD.current.price,
                  hour1: data.USD_SGD.hour1.price,
                  hour24: data.USD_SGD.hour24.price,
                  day7: data.USD_SGD.day7.length > 0 ? data.USD_SGD.day7[0].price : data.USD_SGD.current.price
                };
                
                const current = eurUsd.current * usdSgd.current;
                const hour1 = eurUsd.hour1 * usdSgd.hour1;
                const hour24 = eurUsd.hour24 * usdSgd.hour24;
                const day7 = eurUsd.day7 * usdSgd.day7;
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
              else if (data.GBP_USD && data.USD_SGD && fromKey === 'GBP' && toKey === 'SGD') {
                const gbpUsd = {
                  current: data.GBP_USD.current.price,
                  hour1: data.GBP_USD.hour1.price,
                  hour24: data.GBP_USD.hour24.price,
                  day7: data.GBP_USD.day7.length > 0 ? data.GBP_USD.day7[0].price : data.GBP_USD.current.price
                };
                
                const usdSgd = {
                  current: data.USD_SGD.current.price,
                  hour1: data.USD_SGD.hour1.price,
                  hour24: data.USD_SGD.hour24.price,
                  day7: data.USD_SGD.day7.length > 0 ? data.USD_SGD.day7[0].price : data.USD_SGD.current.price
                };
                
                const current = gbpUsd.current * usdSgd.current;
                const hour1 = gbpUsd.hour1 * usdSgd.hour1;
                const hour24 = gbpUsd.hour24 * usdSgd.hour24;
                const day7 = gbpUsd.day7 * usdSgd.day7;
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
              // Inverse cross rates (GBP to EUR, SGD to EUR, SGD to GBP)
              else if (data.EUR_USD && data.GBP_USD && fromKey === 'GBP' && toKey === 'EUR') {
                const eurUsd = {
                  current: data.EUR_USD.current.price,
                  hour1: data.EUR_USD.hour1.price,
                  hour24: data.EUR_USD.hour24.price,
                  day7: data.EUR_USD.day7.length > 0 ? data.EUR_USD.day7[0].price : data.EUR_USD.current.price
                };
                
                const gbpUsd = {
                  current: data.GBP_USD.current.price,
                  hour1: data.GBP_USD.hour1.price,
                  hour24: data.GBP_USD.hour24.price,
                  day7: data.GBP_USD.day7.length > 0 ? data.GBP_USD.day7[0].price : data.GBP_USD.current.price
                };
                
                const current = gbpUsd.current / eurUsd.current;
                const hour1 = gbpUsd.hour1 / eurUsd.hour1;
                const hour24 = gbpUsd.hour24 / eurUsd.hour24;
                const day7 = gbpUsd.day7 / eurUsd.day7;
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
              else if (data.EUR_USD && data.USD_SGD && fromKey === 'SGD' && toKey === 'EUR') {
                const eurUsd = {
                  current: data.EUR_USD.current.price,
                  hour1: data.EUR_USD.hour1.price,
                  hour24: data.EUR_USD.hour24.price,
                  day7: data.EUR_USD.day7.length > 0 ? data.EUR_USD.day7[0].price : data.EUR_USD.current.price
                };
                
                const usdSgd = {
                  current: data.USD_SGD.current.price,
                  hour1: data.USD_SGD.hour1.price,
                  hour24: data.USD_SGD.hour24.price,
                  day7: data.USD_SGD.day7.length > 0 ? data.USD_SGD.day7[0].price : data.USD_SGD.current.price
                };
                
                const current = 1 / (eurUsd.current * usdSgd.current);
                const hour1 = 1 / (eurUsd.hour1 * usdSgd.hour1);
                const hour24 = 1 / (eurUsd.hour24 * usdSgd.hour24);
                const day7 = 1 / (eurUsd.day7 * usdSgd.day7);
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
              else if (data.GBP_USD && data.USD_SGD && fromKey === 'SGD' && toKey === 'GBP') {
                const gbpUsd = {
                  current: data.GBP_USD.current.price,
                  hour1: data.GBP_USD.hour1.price,
                  hour24: data.GBP_USD.hour24.price,
                  day7: data.GBP_USD.day7.length > 0 ? data.GBP_USD.day7[0].price : data.GBP_USD.current.price
                };
                
                const usdSgd = {
                  current: data.USD_SGD.current.price,
                  hour1: data.USD_SGD.hour1.price,
                  hour24: data.USD_SGD.hour24.price,
                  day7: data.USD_SGD.day7.length > 0 ? data.USD_SGD.day7[0].price : data.USD_SGD.current.price
                };
                
                const current = 1 / (gbpUsd.current * usdSgd.current);
                const hour1 = 1 / (gbpUsd.hour1 * usdSgd.hour1);
                const hour24 = 1 / (gbpUsd.hour24 * usdSgd.hour24);
                const day7 = 1 / (gbpUsd.day7 * usdSgd.day7);
                
                currentRate = current;
                if (!changes[fromKey]) {
                  changes[fromKey] = {};
                }
                changes[fromKey]![toKey] = {
                  hour1: ((current - hour1) / hour1) * 100,
                  hour24: ((current - hour24) / hour24) * 100,
                  day7: ((current - day7) / day7) * 100
                };
              }
            }
          }
        }
      });
    });
    
    setRateChanges(changes);
  };

  // Update exchange rates with current prices
  const updateExchangeRates = (eurRate: number, gbpRate: number, sgdRate: number) => {
    setExchangeRates(prev => {
      const newRates = { ...prev };
      
      // Update EUR rates
      if (eurRate > 0) {
        // EUR to USD
        newRates['EUR']['USDC'] = { buy: 1/eurRate, sell: 1/eurRate * 1.005 };
        // USD to EUR
        newRates['USDC']['EUR'] = { buy: eurRate, sell: eurRate * 0.995 };
      }
      
      // Update GBP rates
      if (gbpRate > 0) {
        // GBP to USD
        newRates['GBP']['USDC'] = { buy: 1/gbpRate, sell: 1/gbpRate * 1.005 };
        // USD to GBP
        newRates['USDC']['GBP'] = { buy: gbpRate, sell: gbpRate * 0.995 };
      }
      
      // Update SGD rates
      if (sgdRate > 0) {
        // SGD to USD
        newRates['SGD']['USDC'] = { buy: 1/sgdRate, sell: 1/sgdRate * 1.005 };
        // USD to SGD
        newRates['USDC']['SGD'] = { buy: sgdRate, sell: sgdRate * 0.995 };
      }
      
      // If we have EUR and GBP rates, calculate cross rates
      if (eurRate > 0 && gbpRate > 0) {
        newRates['EUR']['GBP'] = { buy: eurRate/gbpRate, sell: eurRate/gbpRate * 1.005 };
        newRates['GBP']['EUR'] = { buy: gbpRate/eurRate, sell: gbpRate/eurRate * 1.005 };
      }
      
      // If we have EUR and SGD rates, calculate cross rates
      if (eurRate > 0 && sgdRate > 0) {
        newRates['EUR']['SGD'] = { buy: eurRate*sgdRate, sell: eurRate*sgdRate * 0.995 };
        newRates['SGD']['EUR'] = { buy: 1/(eurRate*sgdRate), sell: 1/(eurRate*sgdRate) * 1.005 };
      }
      
      // If we have GBP and SGD rates, calculate cross rates
      if (gbpRate > 0 && sgdRate > 0) {
        newRates['GBP']['SGD'] = { buy: gbpRate*sgdRate, sell: gbpRate*sgdRate * 0.995 };
        newRates['SGD']['GBP'] = { buy: 1/(gbpRate*sgdRate), sell: 1/(gbpRate*sgdRate) * 1.005 };
      }
      
      return newRates;
    });
  };
  
  // Format chart data for a specific currency pair
  const formatChartData = (currencySymbol: CurrencySymbol): {date: string, value: number}[] => {
    const chartData: {date: string, value: number}[] = [];
    const now = Date.now();
    
    // Default empty chart data with flat line
    const getDefaultChartData = () => {
      const data: {date: string, value: number}[] = [];
      for (let i = 7; i >= 0; i--) {
        const dayTimestamp = now - (i * 86400000);
        data.push({
          date: new Date(dayTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: 1.0
        });
      }
      return data;
    };
    
    // If no historical data is available yet, return default
    if (!historicalData || Object.keys(historicalData).length === 0) {
      return getDefaultChartData();
    }
    
    try {
      // USDC against other base currencies
      if (currencySymbol === 'USDC' && mainCurrency !== 'USDC') {
        if (mainCurrency === 'EUR' && historicalData.EUR_USD && historicalData.EUR_USD.day7.length > 0) {
          return historicalData.EUR_USD.day7.map(dataPoint => ({
            date: new Date(dataPoint.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: 1 / dataPoint.price
          }));
        }
        if (mainCurrency === 'GBP' && historicalData.GBP_USD && historicalData.GBP_USD.day7.length > 0) {
          return historicalData.GBP_USD.day7.map(dataPoint => ({
            date: new Date(dataPoint.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: 1 / dataPoint.price
          }));
        }
        if (mainCurrency === 'SGD' && historicalData.USD_SGD && historicalData.USD_SGD.day7.length > 0) {
          return historicalData.USD_SGD.day7.map(dataPoint => ({
            date: new Date(dataPoint.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: dataPoint.price
          }));
        }
      }
      
      // Other currencies against USDC base
      if (mainCurrency === 'USDC') {
        if (currencySymbol === 'EUR' && historicalData.EUR_USD && historicalData.EUR_USD.day7.length > 0) {
          return historicalData.EUR_USD.day7.map(dataPoint => ({
            date: new Date(dataPoint.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: dataPoint.price
          }));
        }
        if (currencySymbol === 'GBP' && historicalData.GBP_USD && historicalData.GBP_USD.day7.length > 0) {
          return historicalData.GBP_USD.day7.map(dataPoint => ({
            date: new Date(dataPoint.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: dataPoint.price
          }));
        }
        if (currencySymbol === 'SGD' && historicalData.USD_SGD && historicalData.USD_SGD.day7.length > 0) {
          return historicalData.USD_SGD.day7.map(dataPoint => ({
            date: new Date(dataPoint.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: dataPoint.price
          }));
        }
      }
      
      // Cross rates for non-USD base currencies
      // EUR base
      if (mainCurrency === 'EUR') {
        if (currencySymbol === 'GBP' && 
            historicalData.EUR_USD && historicalData.EUR_USD.day7.length > 0 &&
            historicalData.GBP_USD && historicalData.GBP_USD.day7.length > 0) {
          
          const eurData = historicalData.EUR_USD.day7;
          const gbpData = historicalData.GBP_USD.day7;
          const minLength = Math.min(eurData.length, gbpData.length);
          
          for (let i = 0; i < minLength; i++) {
            chartData.push({
              date: new Date(eurData[i].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: eurData[i].price / gbpData[i].price
            });
          }
          
          return chartData;
        }
        
        if (currencySymbol === 'SGD' && 
            historicalData.EUR_USD && historicalData.EUR_USD.day7.length > 0 &&
            historicalData.USD_SGD && historicalData.USD_SGD.day7.length > 0) {
          
          const eurData = historicalData.EUR_USD.day7;
          const sgdData = historicalData.USD_SGD.day7;
          const minLength = Math.min(eurData.length, sgdData.length);
          
          for (let i = 0; i < minLength; i++) {
            chartData.push({
              date: new Date(eurData[i].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: eurData[i].price * sgdData[i].price
            });
          }
          
          return chartData;
        }
      }
      
      // GBP base
      if (mainCurrency === 'GBP') {
        if (currencySymbol === 'EUR' && 
            historicalData.GBP_USD && historicalData.GBP_USD.day7.length > 0 &&
            historicalData.EUR_USD && historicalData.EUR_USD.day7.length > 0) {
          
          const gbpData = historicalData.GBP_USD.day7;
          const eurData = historicalData.EUR_USD.day7;
          const minLength = Math.min(gbpData.length, eurData.length);
          
          for (let i = 0; i < minLength; i++) {
            chartData.push({
              date: new Date(gbpData[i].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: gbpData[i].price / eurData[i].price
            });
          }
          
          return chartData;
        }
        
        if (currencySymbol === 'SGD' && 
            historicalData.GBP_USD && historicalData.GBP_USD.day7.length > 0 &&
            historicalData.USD_SGD && historicalData.USD_SGD.day7.length > 0) {
          
          const gbpData = historicalData.GBP_USD.day7;
          const sgdData = historicalData.USD_SGD.day7;
          const minLength = Math.min(gbpData.length, sgdData.length);
          
          for (let i = 0; i < minLength; i++) {
            chartData.push({
              date: new Date(gbpData[i].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: gbpData[i].price * sgdData[i].price
            });
          }
          
          return chartData;
        }
      }
      
      // SGD base
      if (mainCurrency === 'SGD') {
        if (currencySymbol === 'EUR' && 
            historicalData.USD_SGD && historicalData.USD_SGD.day7.length > 0 &&
            historicalData.EUR_USD && historicalData.EUR_USD.day7.length > 0) {
          
          const sgdData = historicalData.USD_SGD.day7;
          const eurData = historicalData.EUR_USD.day7;
          const minLength = Math.min(sgdData.length, eurData.length);
          
          for (let i = 0; i < minLength; i++) {
            chartData.push({
              date: new Date(sgdData[i].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: 1 / (eurData[i].price * sgdData[i].price)
            });
          }
          
          return chartData;
        }
        
        if (currencySymbol === 'GBP' && 
            historicalData.USD_SGD && historicalData.USD_SGD.day7.length > 0 &&
            historicalData.GBP_USD && historicalData.GBP_USD.day7.length > 0) {
          
          const sgdData = historicalData.USD_SGD.day7;
          const gbpData = historicalData.GBP_USD.day7;
          const minLength = Math.min(sgdData.length, gbpData.length);
          
          for (let i = 0; i < minLength; i++) {
            chartData.push({
              date: new Date(sgdData[i].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              value: 1 / (gbpData[i].price * sgdData[i].price)
            });
          }
          
          return chartData;
        }
      }
    } catch (error) {
      console.error('Error generating chart data:', error);
    }
    
    // If we reached here, none of the conditions matched or there was an error
    return getDefaultChartData();
  };
  
  // Get rate for a currency 24h ago
  const getRateAgo = (currency: CurrencySymbol) => {
    if (currency === 'USDC') return 1;
    
    if (currency === 'EUR' && historicalData.EUR_USD) {
      return historicalData.EUR_USD.hour24.price;
    }
    else if (currency === 'GBP' && historicalData.GBP_USD) {
      return historicalData.GBP_USD.hour24.price;
    }
    else if (currency === 'SGD' && historicalData.USD_SGD) {
      return 1 / historicalData.USD_SGD.hour24.price;
    }
    
    return 0;
  };
  
  // Add a helper function to check if a currency is USDC
  const isCurrencyUSDC = (currency: string): boolean => {
    return currency === 'USDC';
  };
  
  useEffect(() => {
    // Set the date client-side to avoid hydration mismatch
    setCurrentDate(new Date().toLocaleDateString());
    
    // Initial fetch
    fetchPriceHistory();
    
    // Set up 3-second interval for updates - updating only current rates every 3 seconds
    // Historical data will only update every minute to prevent rapid changes
    updateIntervalRef.current = setInterval(fetchPriceHistory, 3000);
    
    // Set up 1-second interval for the "Last Updated" counter
    secondsTimerRef.current = setInterval(() => {
      setSecondsSinceUpdate(prev => prev + 1);
    }, 1000);
    
    return () => {
      // Clean up intervals on unmount
      if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
      if (secondsTimerRef.current) clearInterval(secondsTimerRef.current);
    };
  }, []);

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never updated';
    if (secondsSinceUpdate < 3) return '<3s ago';
    return `${secondsSinceUpdate}s ago`;
  };
  
  // Format percentage change with + or - sign
  const formatPercentChange = (change: number) => {
    return (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar current="rates" />
      
      <main className="flex-1 flex flex-col px-4 py-8">
        <div className="w-full max-w-6xl mx-auto">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text">Conversion Table</h1>
              <p className="text-gray-400 text-sm">Live forex rates with Pyth Network price feeds</p>
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
          
          {/* Buy Rates Table */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-3">Buy Rates (1 {mainCurrency})</h2>
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900/80 to-black/80 shadow-xl">
              <table className="w-full">
                <thead>
                  <tr className="bg-black/40 text-sm">
                    <th className="text-left p-4">Currency</th>
                    <th className="text-center p-4">Rate</th>
                    <th className="text-center p-4" title="Rate change over the last hour - updates every minute">1H Change</th>
                    <th className="text-center p-4" title="Rate change over the last 24 hours - updates every minute">24H Change</th>
                    <th className="text-center p-4" title="Rate change over the last 7 days - updates every minute">7D Change</th>
                    <th className="text-center p-4" title="7-day price chart - updates every minute">Last 7 Days</th>
                  </tr>
                </thead>
                <tbody>
                  {currencies.filter(c => c.symbol !== mainCurrency).map((currency, index) => {
                    const rates = exchangeRates[mainCurrency][currency.symbol] || { buy: 0, sell: 0 };
                    
                    // Get rate changes relative to the main currency
                    const currencyKey = currency.symbol as CurrencySymbol;
                    const mainKey = mainCurrency as CurrencySymbol;
                    
                    // Get changes for this specific currency pair
                    let hour1Change = 0;
                    let hour24Change = 0;
                    let day7Change = 0;
                    
                    if (rateChanges[mainKey] && rateChanges[mainKey][currencyKey]) {
                      hour1Change = rateChanges[mainKey][currencyKey].hour1;
                      hour24Change = rateChanges[mainKey][currencyKey].hour24;
                      day7Change = rateChanges[mainKey][currencyKey].day7;
                    }
                    
                    // Chart data
                    const chartData = formatChartData(currency.symbol);
                    
                    const isLoadingThisCurrency = isLoading && 
                      (currency.symbol === 'EUR' || currency.symbol === 'GBP' || currency.symbol === 'SGD') && 
                      !isCurrencyUSDC(currency.symbol);
                    
                    const isUSDC = isCurrencyUSDC(currency.symbol);
                    
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
                            <span className="text-2xl">{isUSDC ? '🇺🇸' : currency.flag}</span>
                            <div>
                              <span className="font-semibold block">{currency.symbol}</span>
                              <span className="text-xs text-gray-400">{currency.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="font-mono text-cyan-400 font-bold">
                            {isLoadingThisCurrency ? 
                              'Loading...' : 
                              `${rates.buy?.toFixed(4) || 0} ${currency.symbol}`}
                          </div>
                        </td>
                        <td className="p-4 text-center" title="Historical rates update every minute">
                          <span className={`${hour1Change >= 0 ? 'text-green-400' : 'text-red-400'} font-medium`}>
                            {isLoadingThisCurrency ? 
                              'Loading...' :
                              formatPercentChange(hour1Change)}
                          </span>
                        </td>
                        <td className="p-4 text-center" title="Historical rates update every minute">
                          <span className={`${hour24Change >= 0 ? 'text-green-400' : 'text-red-400'} font-medium`}>
                            {isLoadingThisCurrency ? 
                              'Loading...' :
                              formatPercentChange(hour24Change)}
                          </span>
                        </td>
                        <td className="p-4 text-center" title="Historical rates update every minute">
                          <span className={`${day7Change >= 0 ? 'text-green-400' : 'text-red-400'} font-medium`}>
                            {isLoadingThisCurrency ? 
                              'Loading...' :
                              formatPercentChange(day7Change)}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="h-12 w-24 mx-auto">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke={day7Change >= 0 ? '#4ade80' : '#f87171'} 
                                  strokeWidth={2} 
                                  dot={false} 
                                />
                                <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Sell Rates Table */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-3">Sell Rates (1 {mainCurrency})</h2>
            <div className="overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900/80 to-black/80 shadow-xl">
              <table className="w-full">
                <thead>
                  <tr className="bg-black/40 text-sm">
                    <th className="text-left p-4">Currency</th>
                    <th className="text-center p-4">Rate</th>
                    <th className="text-center p-4" title="Rate change over the last hour - updates every minute">1H Change</th>
                    <th className="text-center p-4" title="Rate change over the last 24 hours - updates every minute">24H Change</th>
                    <th className="text-center p-4" title="Rate change over the last 7 days - updates every minute">7D Change</th>
                    <th className="text-center p-4" title="7-day price chart - updates every minute">Last 7 Days</th>
                  </tr>
                </thead>
                <tbody>
                  {currencies.filter(c => c.symbol !== mainCurrency).map((currency, index) => {
                    const rates = exchangeRates[mainCurrency][currency.symbol] || { buy: 0, sell: 0 };
                    
                    // Get rate changes relative to the main currency
                    const currencyKey = currency.symbol as CurrencySymbol;
                    const mainKey = mainCurrency as CurrencySymbol;
                    
                    // Get changes for this specific currency pair
                    let hour1Change = 0;
                    let hour24Change = 0;
                    let day7Change = 0;
                    
                    if (rateChanges[mainKey] && rateChanges[mainKey][currencyKey]) {
                      hour1Change = rateChanges[mainKey][currencyKey].hour1;
                      hour24Change = rateChanges[mainKey][currencyKey].hour24;
                      day7Change = rateChanges[mainKey][currencyKey].day7;
                    }
                    
                    // Chart data
                    const chartData = formatChartData(currency.symbol);
                    
                    const isLoadingThisCurrency = isLoading && 
                      (currency.symbol === 'EUR' || currency.symbol === 'GBP' || currency.symbol === 'SGD') && 
                      !isCurrencyUSDC(currency.symbol);
                    
                    const isUSDC = isCurrencyUSDC(currency.symbol);
                    
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
                            <span className="text-2xl">{isUSDC ? '🇺🇸' : currency.flag}</span>
                            <div>
                              <span className="font-semibold block">{currency.symbol}</span>
                              <span className="text-xs text-gray-400">{currency.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <div className="font-mono text-cyan-400 font-bold">
                            {isLoadingThisCurrency ? 
                              'Loading...' : 
                              `${rates.sell?.toFixed(4) || 0} ${currency.symbol}`}
                          </div>
                        </td>
                        <td className="p-4 text-center" title="Historical rates update every minute">
                          <span className={`${hour1Change >= 0 ? 'text-green-400' : 'text-red-400'} font-medium`}>
                            {isLoadingThisCurrency ? 
                              'Loading...' :
                              formatPercentChange(hour1Change)}
                          </span>
                        </td>
                        <td className="p-4 text-center" title="Historical rates update every minute">
                          <span className={`${hour24Change >= 0 ? 'text-green-400' : 'text-red-400'} font-medium`}>
                            {isLoadingThisCurrency ? 
                              'Loading...' :
                              formatPercentChange(hour24Change)}
                          </span>
                        </td>
                        <td className="p-4 text-center" title="Historical rates update every minute">
                          <span className={`${day7Change >= 0 ? 'text-green-400' : 'text-red-400'} font-medium`}>
                            {isLoadingThisCurrency ? 
                              'Loading...' :
                              formatPercentChange(day7Change)}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="h-12 w-24 mx-auto">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke={day7Change >= 0 ? '#4ade80' : '#f87171'} 
                                  strokeWidth={2} 
                                  dot={false} 
                                />
                                <YAxis domain={['dataMin', 'dataMax']} hide={true} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="mt-4 text-right text-xs text-gray-500">
            {isLoading ? 'Loading rates...' : 
              `Rates updated as of ${currentDate} • Last refresh: ${formatLastUpdated()} `}
          </div>
        </div>
      </main>
    </div>
  );
} 