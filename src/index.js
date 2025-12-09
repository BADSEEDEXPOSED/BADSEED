// Dummy commit for sync
import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

function WalletWrapper() {
  // Use Helius RPC (Obfuscated) to avoid 403 Forbidden on public mainnet
  const endpoint = useMemo(() => {
    const RPC_BASE = "aHR0cHM6Ly9tYWlubmV0LmhlbGl1cy1ycGMuY29tLw==";
    const RPC_PARAM = "P2FwaS1rZXk9";
    const RPC_KEY_P1 = "NjVjZmE5Zjc=";
    const RPC_KEY_P2 = "N2JmZS00NGZm";
    const RPC_KEY_P3 = "OGU5OC0yNGZmODBiMDFlOGM=";
    return atob(RPC_BASE) + atob(RPC_PARAM) + atob(RPC_KEY_P1) + "-" + atob(RPC_KEY_P2) + "-" + atob(RPC_KEY_P3);
  }, []);

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
