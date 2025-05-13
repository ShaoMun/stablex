import "@/styles/globals.css";
import type { AppProps } from "next/app";
import dynamic from 'next/dynamic';
import '@solana/wallet-adapter-react-ui/styles.css';

// Import WalletConnectionProvider dynamically to avoid SSR issues
const WalletConnectionProvider = dynamic(
  () => import('../components/WalletConnectionProvider'),
  {
    ssr: false,
  }
);

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletConnectionProvider>
      <Component {...pageProps} />
    </WalletConnectionProvider>
  );
}