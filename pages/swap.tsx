import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Navbar from '../components/Navbar';

const currencies = [
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'MYRC', name: 'Malaysian Ringgit Coin' },
  { symbol: 'THBC', name: 'Thai Baht Coin' },
];

const chains = [
  { id: 'solana', name: 'Solana', logo: '/solana-logo.png', color: '#14F195' },
  { id: 'ethereum', name: 'Ethereum', logo: '/ethereum-logo.png', color: '#627EEA' },
];

// Component for selecting from available currencies
const CurrencySelect = ({ value, onChange, currencies }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = currencies.find(c => c.symbol === value);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 hover:bg-gray-700 transition-colors rounded-xl px-3 py-2 flex items-center gap-2"
      >
        <span className="font-medium">{selected?.symbol}</span>
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-xl shadow-lg z-50 border border-gray-700 overflow-hidden">
          {currencies.map(currency => (
            <button
              key={currency.symbol}
              className={`w-full text-left px-4 py-2 hover:bg-gray-700 transition-colors flex items-center justify-between ${currency.symbol === value ? 'bg-gray-700' : ''}`}
              onClick={() => {
                onChange(currency.symbol);
                setIsOpen(false);
              }}
            >
              <span>{currency.symbol}</span>
              <span className="text-xs text-gray-400">{currency.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Component for selecting from available chains
const ChainSelect = ({ value, onChange, chains }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = chains.find(c => c.id === value);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center gap-1"
        style={{ 
          backgroundColor: `${selected?.color}10`,
          color: selected?.color,
          borderRadius: '9999px',
          padding: '0.25rem 0.5rem'
        }}
      >
        {/* Chain logo */}
        <div className="w-5 h-5 relative overflow-hidden rounded-full">
          <div 
            className="w-5 h-5 bg-contain bg-no-repeat bg-center" 
            style={{ backgroundImage: `url(${selected?.logo})` }}
          />
        </div>
        <span className="text-xs font-medium">{selected?.name}</span>
        <svg 
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute left-0 mt-2 w-40 bg-gray-800 rounded-xl shadow-lg z-50 border border-gray-700 overflow-hidden">
          {chains.map(chain => (
            <button
              key={chain.id}
              className={`w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors flex items-center gap-2 ${chain.id === value ? 'bg-gray-700' : ''}`}
              onClick={() => {
                onChange(chain.id);
                setIsOpen(false);
              }}
            >
              <div className="w-5 h-5 relative overflow-hidden rounded-full">
                <div 
                  className="w-5 h-5 bg-contain bg-no-repeat bg-center" 
                  style={{ backgroundImage: `url(${chain.logo})` }}
                />
              </div>
              <span className="text-xs font-medium">{chain.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function SwapPage() {
  const [fromCurrency, setFromCurrency] = useState('USDC');
  const [toCurrency, setToCurrency] = useState('MYRC');
  const [fromChain, setFromChain] = useState('solana');
  const [toChain, setToChain] = useState('ethereum');
  const [amount, setAmount] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const handleInverse = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setFromChain(toChain);
    setToChain(fromChain);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar current="swap" />
      
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text">Swap</h1>
            <p className="text-gray-400 text-sm">Trade tokens across chains instantly</p>
          </div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-gradient-to-br from-gray-900/80 to-black/80 rounded-2xl shadow-2xl p-5 border border-gray-800"
          >
            {/* From Row */}
            <div className="bg-black/40 p-4 rounded-xl mb-2 focus-within:bg-black/60 focus-within:ring-1 focus-within:ring-cyan-800/50 transition-all">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-400">From</span>
                <span className="text-sm text-gray-400">Balance: 0.00</span>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent border-none text-2xl font-semibold focus:outline-none text-white placeholder-gray-500"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                />
                <CurrencySelect 
                  value={fromCurrency} 
                  onChange={setFromCurrency} 
                  currencies={currencies} 
                />
              </div>
              <div className="flex justify-between mt-2 items-center">
                <ChainSelect 
                  value={fromChain} 
                  onChange={setFromChain} 
                  chains={chains} 
                />
                <div className="text-xs text-gray-500">~$100.00</div>
              </div>
            </div>
            
            {/* Inverse Button */}
            <div className="flex justify-center -my-4 z-10 relative">
              <button
                onClick={handleInverse}
                className="rounded-full bg-gray-800 hover:bg-cyan-700 p-2 border border-gray-700 hover:border-cyan-400 transition-colors shadow-lg"
                aria-label="Inverse"
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                  <path d="M10 3v10" />
                  <path d="M6 9l4 4 4-4" />
                </svg>
              </button>
            </div>
            
            {/* To Row */}
            <div className="bg-black/40 p-4 rounded-xl mt-2">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-400">To</span>
                <span className="text-sm text-gray-400">Balance: 0.00</span>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount ? (parseFloat(amount) * 4.7).toFixed(2) : ''}
                  readOnly
                  className="flex-1 bg-transparent border-none text-2xl font-semibold text-white placeholder-gray-500 opacity-90 cursor-not-allowed"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
                  tabIndex={-1}
                />
                <CurrencySelect 
                  value={toCurrency} 
                  onChange={setToCurrency} 
                  currencies={currencies} 
                />
              </div>
              <div className="flex justify-between mt-2 items-center">
                <ChainSelect 
                  value={toChain} 
                  onChange={setToChain} 
                  chains={chains} 
                />
                <div className="text-xs text-gray-500">~$100.00</div>
              </div>
            </div>
            
            {/* Rate and Details */}
            <div className="mt-4 bg-black/20 rounded-xl p-3">
              <button 
                onClick={() => setShowDetails(v => !v)} 
                className="w-full flex justify-between items-center"
              >
                <span className="text-sm text-gray-400">Rate</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-cyan-400">1 {fromCurrency} ≈ 4.7 {toCurrency}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} 
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </div>
              </button>
              
              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden text-xs text-gray-400 mt-2 pt-2 border-t border-gray-800"
                  >
                    <div className="flex justify-between py-1">
                      <span>Exchange Rate</span>
                      <span>1 {fromCurrency} = 4.7 {toCurrency}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Network Fee</span>
                      <span>0.1%</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Slippage Tolerance</span>
                      <span>0.05%</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Route</span>
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 relative overflow-hidden rounded-full">
                          <div 
                            className="w-4 h-4 bg-contain bg-no-repeat bg-center" 
                            style={{ backgroundImage: `url(${chains.find(c => c.id === fromChain)?.logo})` }}
                          />
                        </div>
                        <span>→</span>
                        <div className="w-4 h-4 relative overflow-hidden rounded-full">
                          <div 
                            className="w-4 h-4 bg-contain bg-no-repeat bg-center" 
                            style={{ backgroundImage: `url(${chains.find(c => c.id === toChain)?.logo})` }}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Swap Button */}
            <button className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold text-lg shadow-lg hover:scale-[1.02] transition-transform">
              Swap
            </button>
          </motion.div>
        </div>
      </main>
    </div>
  );
} 