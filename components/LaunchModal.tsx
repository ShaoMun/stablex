import { FC, useState, useEffect } from 'react';

const LaunchModal: FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Show modal after 2 seconds when component mounts
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-gray-900/90 to-black/90 rounded-2xl shadow-2xl p-6 border border-gray-800 max-w-md">
        <h2 className="text-xl font-bold text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text mb-4">
          Welcome to StableX!
        </h2>
        <p className="text-gray-300 mb-4">
          This is a cross-chain forex-stablecoin DEX built on Solana.
        </p>
        <div className="flex justify-end">
          <button
            onClick={() => setIsOpen(false)}
            className="bg-gradient-to-r from-cyan-400 to-purple-600 text-black font-bold px-6 py-2 rounded-full shadow hover:scale-105 transition-transform"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default LaunchModal; 