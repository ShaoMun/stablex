import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';

// Pool data is accessible by all components
export const poolData = [
  { 
    symbol: 'USDC', 
    name: 'USD Coin', 
    tvl: '$1,245,600', 
    apr: '5.2%', 
    vol1d: '$120,450',
    details: {
      description: 'USD Coin is a stablecoin pegged to the US Dollar',
      totalDeposits: '$1,245,600',
      totalUsers: 347,
      weeklyVolume: '$520,750',
      yourBalance: '0.00',
      chart: [65, 72, 78, 85, 82, 91, 96]
    }
  },
  { 
    symbol: 'MYRC', 
    name: 'Malaysian Ringgit Coin', 
    tvl: '$856,400', 
    apr: '4.8%', 
    vol1d: '$85,200',
    details: {
      description: 'Malaysian Ringgit Coin is a stablecoin pegged to the Malaysian Ringgit',
      totalDeposits: '$856,400',
      totalUsers: 215,
      weeklyVolume: '$392,800',
      yourBalance: '0.00',
      chart: [45, 52, 59, 68, 75, 82, 85]
    }
  },
  { 
    symbol: 'THBC', 
    name: 'Thai Baht Coin', 
    tvl: '$624,300', 
    apr: '4.5%', 
    vol1d: '$62,350',
    details: {
      description: 'Thai Baht Coin is a stablecoin pegged to the Thai Baht',
      totalDeposits: '$624,300',
      totalUsers: 189,
      weeklyVolume: '$278,400',
      yourBalance: '0.00',
      chart: [35, 42, 48, 52, 58, 63, 65]
    }
  }
];

export default function PoolPage() {
  const router = useRouter();
  
  // Display only the pool list on the main page
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar current="pool" />
      
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
                {poolData.map((pool, index) => (
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
  
  // Find the selected pool based on the URL parameter
  const selectedPool = poolData.find(p => p.symbol.toLowerCase() === symbol);
  
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
  
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar current="pool" />
      
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
                {selectedPool.name} Vault
              </h1>
              <p className="text-gray-400 text-sm">{selectedPool.details.description}</p>
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
                    <div className="text-lg font-bold text-cyan-400">{selectedPool.details.totalDeposits}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-xs text-gray-400">Users</div>
                    <div className="text-lg font-bold text-purple-400">{selectedPool.details.totalUsers}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-xs text-gray-400">Weekly Volume</div>
                    <div className="text-lg font-bold text-blue-400">{selectedPool.details.weeklyVolume}</div>
                  </div>
                  <div className="bg-black/30 p-3 rounded-lg">
                    <div className="text-xs text-gray-400">APR</div>
                    <div className="text-lg font-bold text-green-400">{selectedPool.apr}</div>
                  </div>
                </div>
                
                <div className="bg-black/20 rounded-xl p-4 border border-gray-800/50 mb-4">
                  <div className="text-sm text-gray-400 mb-3">Weekly Activity</div>
                  <div className="h-20 flex items-end justify-between">
                    {selectedPool.details.chart.map((value, i) => (
                      <div 
                        key={i} 
                        className="w-1/12 bg-gradient-to-t from-cyan-500 to-purple-500 rounded-sm" 
                        style={{ height: `${value}%` }}
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
                    The {selectedPool.name} vault allows you to earn yield on your {selectedPool.symbol} deposits. 
                    Yields are generated from trading fees and cross-chain arbitrage opportunities.
                  </p>
                  <p className="mt-2">
                    All deposits are secured by multi-signature wallets and audited smart contracts for maximum security.
                  </p>
                </div>
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
                        <span className="text-xs text-gray-500">Balance: 0.00 {selectedPool.symbol}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={depositAmount}
                          onChange={e => setDepositAmount(e.target.value)}
                          className="flex-1 bg-black/60 border border-gray-700 rounded-lg px-4 py-3 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder-gray-500"
                        />
                        <button className="bg-gray-800 px-3 rounded-lg font-bold text-cyan-400">MAX</button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-400 bg-black/30 p-3 rounded-lg">
                      <div className="flex justify-between py-1">
                        <span>Expected APR</span>
                        <span className="text-green-400">{selectedPool.apr}</span>
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
                    
                    <button className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold text-lg shadow-lg hover:scale-[1.02] transition-transform">
                      Deposit {selectedPool.symbol}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-sm text-gray-400">Amount to Withdraw</label>
                        <span className="text-xs text-gray-500">Your balance: 0.00 {selectedPool.symbol}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={withdrawAmount}
                          onChange={e => setWithdrawAmount(e.target.value)}
                          className="flex-1 bg-black/60 border border-gray-700 rounded-lg px-4 py-3 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400 text-white placeholder-gray-500"
                        />
                        <button className="bg-gray-800 px-3 rounded-lg font-bold text-cyan-400">MAX</button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-400 bg-black/30 p-3 rounded-lg">
                      <div className="flex justify-between py-1">
                        <span>Withdrawal Fee</span>
                        <span>0.05%</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Slippage Tolerance</span>
                        <span>0.5%</span>
                      </div>
                    </div>
                    
                    <button className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold text-lg shadow-lg hover:scale-[1.02] transition-transform">
                      Withdraw {selectedPool.symbol}
                    </button>
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