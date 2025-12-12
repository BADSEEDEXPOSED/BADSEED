// Dummy commit for sync
import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
// import { clusterApiUrl } from "@solana/web3.js"; // Unused

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

function WalletWrapper() {
  // Use mainnet
  // Priority: Hardcoded Helius for Reliability (User provided key)
  // Fallback: Custom Env Var -> Standard Mainnet
  const endpoint = useMemo(() => "https://mainnet.helius-rpc.com/?api-key=273e36fb-f6f8-4556-8166-a2299b594197", []);

  // Configure wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <WalletWrapper />
  </React.StrictMode>
);
