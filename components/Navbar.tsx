import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useState, useEffect } from 'react';

type NavbarProps = {
  current: string;
};

export default function Navbar({ current }: NavbarProps) {
  const [mounted, setMounted] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Only access wallet after component mounts on client
  const wallet = mounted ? useWallet() : { connected: false, publicKey: null, disconnecting: false, connecting: false, disconnect: () => {} };
  const { connected, publicKey, disconnect } = wallet;

  // Set mounted to true after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (publicKey) {
      const address = publicKey.toString();
      setWalletAddress(address.slice(0, 4) + '...' + address.slice(-4));
    } else {
      setWalletAddress(null);
    }
  }, [publicKey]);

  // Return null or loading state while not mounted
  if (!mounted) {
    return (
      <nav className="w-full flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md border-b border-gray-800 sticky top-0 z-20">
        <div className="flex gap-2 text-lg font-bold tracking-widest text-cyan-400">
          <span className="text-white">STABLE</span>X
        </div>
        <div className="flex gap-6 text-gray-400">
          {['Swap', 'Rates', 'Pool'].map((item) => (
            <Link
              key={item}
              href={`/${item.toLowerCase()}`}
              className={`hover:text-cyan-400 transition-colors ${current === item.toLowerCase() ? 'text-cyan-400' : ''}`}
            >
              {item}
            </Link>
          ))}
        </div>
        <div className="relative">
          <button className="bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border border-cyan-400/30 text-cyan-300 font-medium px-2 !py-1 rounded-full">
            Loading...
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="w-full flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md border-b border-gray-800 sticky top-0 z-20">
      <div className="flex gap-2 text-lg font-bold tracking-widest text-cyan-400">
        <span className="text-white">STABLE</span>X
      </div>
      <div className="flex gap-6 text-gray-400">
        {['Swap', 'Rates', 'Pool'].map((item) => (
          <Link
            key={item}
            href={`/${item.toLowerCase()}`}
            className={`hover:text-cyan-400 transition-colors ${current === item.toLowerCase() ? 'text-cyan-400' : ''}`}
          >
            {item}
          </Link>
        ))}
      </div>
      <div className="relative">
        {!connected ? (
          <WalletMultiButton className="wallet-adapter-button wallet-adapter-button-trigger !px-2 !py-1" />
        ) : (
          <>
            <button 
              onClick={() => setShowDropdown(!showDropdown)} 
              className="bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border border-cyan-400/30 text-cyan-300 font-medium px-2 !py-1 rounded-full hover:bg-cyan-500/30 transition-colors flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {walletAddress}
              <svg 
                className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-full bg-gray-800 rounded-xl shadow-lg z-50 border border-gray-700 overflow-hidden py-1">
                <button
                  onClick={() => {
                    disconnect();
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-700 transition-colors text-gray-300 hover:text-white"
                >
                  Disconnect
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </nav>
  );
} 