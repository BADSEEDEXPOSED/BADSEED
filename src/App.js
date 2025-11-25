import React, { useMemo, useState, useEffect } from "react";
// Generator imports removed to avoid polyfill issues

// Generator UI disabled - removed to avoid polyfill issues

// ===========================
// CONFIG: SEED + SOLANA
// ===========================

// 1) BAD SEED wallet Solana address
// TODO: after you choose a seed you like with the generator below,
//       paste the resulting public key here.
const BAD_SEED_WALLET_ADDRESS = "9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr";

// 2) Seed phrase (base64-encoded to avoid plain text in source)
//
// TODO after you choose a seed you like, take the base64 string printed
//      by the generator and paste it here.
const ENCODED_SEED_PHRASE =
  "YmFkIHNlZWQgZXhwZXJpbWVudCBwdWJsaWMgc2hhcmVkIHdhbGxldCBvcGVuIGNvbGxlY3RpdmUgc2lnbmFsIGNoYW9zIGJhbGFuY2UgZmx1eA==";

// Obfuscated RPC configuration (reconstructed at runtime)
const RPC_BASE = "aHR0cHM6Ly9tYWlubmV0LmhlbGl1cy1ycGMuY29tLw==";
const RPC_PARAM = "P2FwaS1rZXk9";
const RPC_KEY_P1 = "NjVjZmE5Zjc=";
const RPC_KEY_P2 = "N2JmZS00NGZm";
const RPC_KEY_P3 = "OGU5OC0yNGZmODBiMDFlOGM=";
const SOLANA_RPC_ENDPOINT = atob(RPC_BASE) + atob(RPC_PARAM) + atob(RPC_KEY_P1) + "-" + atob(RPC_KEY_P2) + "-" + atob(RPC_KEY_P3);

// ===========================
// Helper: decode base64 seed
// ===========================
function decodeSeedPhrase(encoded) {
  try {
    if (!encoded) return "";
    return window.atob(encoded);
  } catch (e) {
    console.warn("Failed to decode seed phrase:", e);
    return "";
  }
}

// ===========================
// Helper: Solana JSON-RPC
// ===========================
async function solanaRpc(method, params) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  };

  const res = await fetch(SOLANA_RPC_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Solana RPC HTTP error ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Solana RPC error: ${JSON.stringify(json.error)}`);
  }

  return json.result;
}

// Fetch AI narrative logs from Netlify serverless function (calls OpenAI)
async function fetchAiLogsForTransactions(transactions, balanceSol) {
  if (!transactions || transactions.length === 0) {
    return [];
  }

  try {
    const response = await fetch("/.netlify/functions/ai-narrative", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        balanceSol,
        transactions: transactions.map((tx) => ({
          signature: tx.signature || "",
          slot: tx.slot ?? null,
          blockTime: tx.blockTime ?? null,
          confirmationStatus: tx.confirmationStatus || "unknown",
          err: tx.err || null,
          memo: tx.memo || null
        }))
      })
    });

    if (!response.ok) {
      console.error("AI narrative endpoint error:", response.status);
      return transactions.map((tx, idx) =>
        `[SEED_LOG] slot=${tx.slot ?? "?"} idx=${idx} note="AI endpoint unavailable."`
      );
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.logs)) {
      console.warn("AI narrative returned unexpected format:", data);
      return transactions.map((tx, idx) =>
        `[SEED_LOG] slot=${tx.slot ?? "?"} idx=${idx} note="AI format error."`
      );
    }

    // Normalize logs to match transaction count
    return transactions.map((_, idx) => {
      return typeof data.logs[idx] === "string"
        ? data.logs[idx]
        : `[SEED_LOG] slot=${transactions[idx].slot ?? "?"} note="AI log missing."`;
    });
  } catch (err) {
    console.error("Error fetching AI logs:", err);
    return transactions.map((tx, idx) =>
      `[SEED_LOG] slot=${tx.slot ?? "?"} idx=${idx} note="AI connection failed."`
    );
  }
}

function App() {
  const [showDashboard, setShowDashboard] = useState(false);
  const [balanceText, setBalanceText] = useState("Loading…");
  const [txItems, setTxItems] = useState([]);
  const [aiLogs, setAiLogs] = useState([]); // AI terminal logs per transaction

  // DEV generator state
  // Dev generator state removed

  // Decode seed phrase once for the main BAD SEED wallet
  const seedPhrase = useMemo(
    () => decodeSeedPhrase(ENCODED_SEED_PHRASE),
    []
  );

  const seedWords = useMemo(
    () =>
      seedPhrase
        ? seedPhrase.split(" ").filter((w) => w.trim().length > 0)
        : [],
    [seedPhrase]
  );

  // Load Solana data when dashboard is shown (no auto-refresh)
  useEffect(() => {
    if (showDashboard) {
      loadWalletData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDashboard]);

  async function handleCopyAndEnter() {
    const phrase = seedPhrase || "";

    if (!phrase) {
      alert("Seed phrase is not configured yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(phrase);
    } catch (err) {
      console.warn("Clipboard copy failed, falling back to prompt:", err);
      window.prompt("Copy this seed phrase manually:", phrase);
    }

    // Trigger the transition to the dashboard
    setShowDashboard(true);
  }

  async function loadWalletData() {
    if (!BAD_SEED_WALLET_ADDRESS) {
      setBalanceText("Set BAD_SEED_WALLET_ADDRESS in App.js");
      setTxItems([
        {
          signature: "CONFIG_PLACEHOLDER",
          confirmationStatus: "unknown",
          slot: "?",
          blockTime: null,
          note: "Configure the wallet address to load real data.",
        },
      ]);
      return;
    }

    setBalanceText("Loading…");

    try {
      // getBalance -> lamports
      const balanceResult = await solanaRpc("getBalance", [
        BAD_SEED_WALLET_ADDRESS,
        { commitment: "finalized" },
      ]);
      const lamports = balanceResult.value ?? 0;
      const sol = lamports / 1_000_000_000;
      setBalanceText(`${sol.toFixed(9)} SOL`);

      // getSignaturesForAddress -> recent signatures
      const sigResult = await solanaRpc("getSignaturesForAddress", [
        BAD_SEED_WALLET_ADDRESS,
        { limit: 5 },
      ]);

      if (!Array.isArray(sigResult) || sigResult.length === 0) {
        setTxItems([]);
        setAiLogs([]); // no tx = no AI logs
        return;
      }

      const txList = sigResult.map((entry) => ({
        ...entry,
        note: "Recent on-chain activity",
      }));

      setTxItems(txList);

      // Fetch AI logs from OpenAI via Netlify function
      const logs = await fetchAiLogsForTransactions(txList, sol);
      setAiLogs(logs);
    } catch (err) {
      console.error("Error loading Solana data:", err);
      setBalanceText("Error loading balance");
      setTxItems([
        {
          signature: "RPC_ERROR",
          confirmationStatus: "unknown",
          slot: "?",
          blockTime: null,
          note: "Error loading transactions. RPC might be rate-limited or unavailable.",
        },
      ]);
    }
  }

  // ===========================
  // DEV: generate a new seed on click
  // ===========================
  // Generator function removed

  return (
    <div id="app">
      {/* LOGO */}
      <header className="site-header">
        <img src="/logo.gif" alt="Bad Seed Logo" className="logo" />
      </header>

      {/* SEED SCREEN */}
      <main
        id="seed-screen"
        className={
          "screen" + (!showDashboard ? " screen--active screen--fade-in" : "")
        }
      >
        {/* DEV-ONLY GENERATOR PANEL */}
        {/* Generator UI removed */}

        <h1 className="title">Seed Phrase</h1>
        <p className="subtitle">
          This is the public seed phrase for the BAD SEED experiment.
          <br />
          Anyone who knows it can access the same wallet.
        </p>

        <div id="seed-phrase" className="seed-phrase-container">
          {seedWords.length === 0 ? (
            <div className="seed-word" data-index="1">
              (configure ENCODED_SEED_PHRASE in App.js)
            </div>
          ) : (
            seedWords.map((word, idx) => (
              <div
                key={`${word}-${idx}`}
                className="seed-word"
                data-index={idx + 1}
              >
                {word}
              </div>
            ))
          )}
        </div>

        <button
          id="copy-btn"
          className="btn btn-primary"
          onClick={handleCopyAndEnter}
        >
          Copy Seed Phrase &amp; Enter
        </button>
      </main>

      {/* DASHBOARD SCREEN */}
      <main
        id="dashboard-screen"
        className={
          "screen" + (showDashboard ? " screen--active screen--fade-in" : "")
        }
      >
        <section className="dashboard-card dashboard-card--glow">
          <h2 className="section-title">Wallet Overview</h2>

          <div className="wallet-row">
            <span className="label">Address</span>
            <span className="mono">
              {BAD_SEED_WALLET_ADDRESS || "Not set yet"}
            </span>
          </div>

          <div className="wallet-row">
            <span className="label">Network</span>
            <span className="mono">Solana mainnet-beta</span>
          </div>

          <div className="wallet-row">
            <span className="label">Balance</span>
            <span className="mono">{balanceText}</span>
          </div>

          <button
            onClick={loadWalletData}
            style={{
              marginTop: "1rem",
              width: "100%",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: "600",
              backgroundColor: "#000",
              color: "#c0c0c0",
              border: "1px solid #c0c0c0",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.3s ease"
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#1a1a1a";
              e.target.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#000";
              e.target.style.color = "#c0c0c0";
            }}
          >
            Refresh Data
          </button>
        </section>

        <section className="dashboard-card dashboard-card--glow">
          <h2 className="section-title">Recent Transactions</h2>
          <ul id="tx-list" className="tx-list">
            {txItems.length === 0 ? (
              <li className="tx-item">
                No recent transactions found for this address.
              </li>
            ) : (
              txItems.map((tx, i) => {
                const timeText = tx.blockTime
                  ? new Date(tx.blockTime * 1000).toLocaleString()
                  : "time unknown";

                const aiLog =
                  aiLogs && typeof aiLogs[i] === "string"
                    ? aiLogs[i]
                    : "[AI_LOG] awaiting interpretation…";

                return (
                  <li key={tx.signature || `tx-${i}`} className="tx-item tx-row">
                    {/* Left: existing tx details */}
                    <div className="tx-main">
                      {/* Signature */}
                      <div style={{ marginBottom: "0.25rem" }}>
                        <strong>Signature:</strong>{" "}
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#c0c0c0", textDecoration: "none" }}
                        >
                          {tx.signature ? `${tx.signature.slice(0, 20)}...${tx.signature.slice(-20)}` : "(no signature)"}
                        </a>
                      </div>

                      {/* Status, Slot, Time on one line */}
                      <div style={{ marginBottom: "0.25rem", fontSize: "0.9rem" }}>
                        <strong>Status:</strong> {tx.confirmationStatus || "unknown"} • {" "}
                        <strong>Slot:</strong>{" "}
                        <a
                          href={`https://solscan.io/block/${tx.slot}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#c0c0c0", textDecoration: "none" }}
                        >
                          {tx.slot ?? "?"}
                        </a> • {" "}
                        <strong>Time:</strong> {timeText}
                      </div>

                      {/* Error if any */}
                      {tx.err && (
                        <div style={{ marginBottom: "0.25rem", color: "#d4a5a5" }}>
                          <strong>Error:</strong> {JSON.stringify(tx.err)}
                        </div>
                      )}

                      {/* Memo if any */}
                      {tx.memo && (
                        <div style={{ marginBottom: "0.25rem", color: "#c0c0c0" }}>
                          <strong>Memo:</strong> {tx.memo}
                        </div>
                      )}

                      {/* Account */}
                      <div style={{ fontSize: "0.9rem" }}>
                        <strong>Account:</strong>{" "}
                        <a
                          href={`https://solscan.io/account/${BAD_SEED_WALLET_ADDRESS}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#c0c0c0", textDecoration: "none" }}
                        >
                          {BAD_SEED_WALLET_ADDRESS.slice(0, 20)}...
                        </a>
                      </div>
                    </div>

                    {/* Right: AI terminal toast */}
                    <div className="tx-ai-log">
                      <div className="tx-ai-header">[AI_LOG]</div>
                      <div className="tx-ai-body">{aiLog}</div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
