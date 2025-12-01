import React, { useMemo, useState, useEffect } from "react";
import { queueMemo, scheduleDailyPosts, getQueue, getDailyPostCount, getNextPostTime, forcePostNow, addTestItem, clearQueue } from "./xPosting";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction, SystemProgram, TransactionInstruction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import sha256 from "js-sha256";

// BAD SEED wallet address (receiver)
const BAD_SEED_WALLET_ADDRESS = "9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr";

// Solana RPC endpoint (mainnet)
// 2) SOLANA_RPC_ENDPOINT is defined later in the file (using Helius)

// Memo program ID
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// ---------- localStorage cache helpers ----------
function getCachedLog(signature) {
  try {
    const cached = localStorage.getItem(`badseed_ai_log_${signature}`);
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function saveCachedLog(signature, log) {
  try {
    localStorage.setItem(`badseed_ai_log_${signature}`, JSON.stringify(log));
  } catch (e) {
    console.warn("Failed to cache AI log:", e);
  }
}

// ---------- Blacklist helpers ----------
const DEFAULT_BLACKLIST = [
  "EZvp2MfKaqZ14D95EMSECXfGqduScMCSUzpKSxBcNTzM",
  "AoX3EMzVXCNBdCNvboc7yGM4gsr3wcKd7hGsZ4yXcydU",
  "FLipG5QHjZe1H12f6rr5LCnrmqjhwuBTBp78GwzxnwkR"
];

// Detect if running locally (localhost) vs deployed
function isLocalEnvironment() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function getBlacklistedAddresses() {
  // Always return DEFAULT_BLACKLIST from code
  return DEFAULT_BLACKLIST;
}


function copyBlacklistToClipboard(blacklist) {
  const arrayString = `const DEFAULT_BLACKLIST = [\n${blacklist.map(addr => `  "${addr}"`).join(',\n')}\n];`;
  navigator.clipboard.writeText(arrayString).then(() => {
    alert('Blacklist copied to clipboard! Paste into App.js DEFAULT_BLACKLIST and commit.');
  }).catch(err => {
    console.error('Failed to copy:', err);
    prompt('Copy this array definition:', arrayString);
  });
}
// // duplicate import removed // duplicate removed
// BADSEED AI: v1.0 - Real OpenAI Integration Active

// Generator UI disabled - removed to avoid polyfill issues

// ===========================
// CONFIG: SEED + SOLANA
// ===========================

// 1) BAD_SEED_WALLET_ADDRESS is defined at the top of the file


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
async function fetchAiLogsForTransactions(transactions, balanceSol, walletAddress, totalTxCount, recentHistory) {
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
          memo: tx.memo || null,
          type: tx.type || "Unknown",
          direction: tx.direction || "Unknown",
          amount: tx.amount || "0",
          token: tx.token || "SOL",
          // Pass context as part of first transaction for simplicity
          ...(transactions.indexOf(tx) === 0 ? {
            walletAddress,
            totalTxCount,
            recentHistory
          } : {})
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
  const [postQueue, setPostQueue] = useState([]); // X.com post queue
  const [dailyPostCount, setDailyPostCount] = useState(0);
  const [nextPostTime, setNextPostTime] = useState(null);
  const [blacklist, setBlacklist] = useState([]);
  const [blacklistedTxs, setBlacklistedTxs] = useState([]);
  const [newBlacklistAddress, setNewBlacklistAddress] = useState("");

  // Wallet connection
  const { publicKey, sendTransaction } = useWallet();

  // Send message modal state
  const [showSendModal, setShowSendModal] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [solAmount, setSolAmount] = useState("0.001");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  // Logo pulse enhancement
  const [logoPulseEnhanced, setLogoPulseEnhanced] = useState(false);

  function triggerLogoPulse() {
    setLogoPulseEnhanced(true);
    setTimeout(() => setLogoPulseEnhanced(false), 5000);
  }

  // Effect to trigger pulse when modal opens
  useEffect(() => {
    if (showSendModal) {
      triggerLogoPulse();
    }
  }, [showSendModal]);

  // Auto-refresh X.com queue display every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      updateQueueDisplay();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
      // start the twice‑daily X.com posting scheduler
      scheduleDailyPosts();
      // Update queue display
      updateQueueDisplay();
      // Load blacklist from code (DEFAULT_BLACKLIST)
      setBlacklist(getBlacklistedAddresses());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDashboard]);


  // Blacklist management functions (in-memory for local dev)
  function handleAddToBlacklist() {
    const trimmed = newBlacklistAddress.trim();
    if (trimmed && trimmed.length > 30) { // Basic Solana address validation
      if (!blacklist.includes(trimmed)) {
        setBlacklist([...blacklist, trimmed]);
        setNewBlacklistAddress("");
      }
    }
  }

  function handleRemoveFromBlacklist(address) {
    setBlacklist(blacklist.filter(addr => addr !== address));
  }

  function handleCopyBlacklist() {
    copyBlacklistToClipboard(blacklist);
  }

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

  // Send transaction with SOL + memo
  async function handleSendTransaction() {
    setSendError("");
    setSendSuccess(false);

    // Validation
    if (!memoText.trim()) {
      setSendError("Please enter a message");
      return;
    }
    // Enforce max 100 characters for memo
    if (memoText.length > 100) {
      setSendError("Memo must be 100 characters or less");
      return;
    }

    const amount = parseFloat(solAmount);
    if (isNaN(amount) || amount < 0.001) {
      setSendError("Amount must be at least 0.001 SOL");
      return;
    }

    if (!publicKey) {
      setSendError("Please connect your wallet first");
      return;
    }

    setIsSending(true);

    try {
      // Create connection (use same RPC endpoint as dashboard)
      const { Connection } = await import("@solana/web3.js");
      const connection = new Connection(SOLANA_RPC_ENDPOINT);

      // Create transaction
      const transaction = new Transaction();

      // 1. Add SOL transfer instruction
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      const transferIx = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(BAD_SEED_WALLET_ADDRESS),
        lamports,
      });
      transaction.add(transferIx);

      // 2. Add memo instruction
      const memoData = Buffer.from(memoText.trim(), "utf-8");
      const memoIx = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: memoData,
      });
      transaction.add(memoIx);

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction (wallet will sign)
      const signature = await sendTransaction(transaction, connection);

      console.log("Transaction sent:", signature);

      // Success
      setSendSuccess(true);

      // Reload wallet data after a short delay to fetch the new transaction
      // This will trigger AI analysis and queue the memo for X.com
      setTimeout(async () => {
        setShowSendModal(false);
        setMemoText("");
        setSolAmount("0.001");
        setSendSuccess(false);

        // Wait a bit more for blockchain confirmation, then refresh
        setTimeout(() => {
          loadWalletData();
        }, 3000); // Wait 3 seconds for transaction to confirm
      }, 2000);

    } catch (err) {
      console.error("Transaction error:", err);
      if (err.message && err.message.includes("User rejected")) {
        setSendError("Transaction cancelled");
      } else {
        setSendError(err.message || "Transaction failed. Please try again.");
      }
    } finally {
      setIsSending(false);
    }
  }


  // After AI logs are fetched and cached, forward any new memos
  // This is called inside loadWalletData after setAiLogs(logs);
  // This is called inside loadWalletData after setAiLogs(logs);
  async function forwardMemosIfNeeded(processedTxs, logsArray) {
    const currentQueue = await getQueue();
    const queueArray = Array.isArray(currentQueue) ? currentQueue : [];
    const queuedSignatures = new Set(queueArray.map(item => item.hash || sha256(item.memo)));

    for (const tx of processedTxs) {
      if (tx.memo) {
        // Check if this memo is already queued (using hash of memo)
        const memoHash = sha256(tx.memo);
        if (!queuedSignatures.has(memoHash)) {
          const aiLog = logsArray[processedTxs.indexOf(tx)];
          if (aiLog) {
            // Queue memo + AI log for later X.com posting
            queueMemo(tx.memo, aiLog);
            console.log("Queued memo:", tx.memo, "with AI log:", aiLog);
          }
        }
      }
    }
  }

  async function updateQueueDisplay() {
    const queue = await getQueue();
    setPostQueue(queue);
    setDailyPostCount(getDailyPostCount());
    setNextPostTime(getNextPostTime());
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
      // 1. Get Balance
      const balanceResult = await solanaRpc("getBalance", [
        BAD_SEED_WALLET_ADDRESS,
        { commitment: "finalized" },
      ]);
      const lamports = balanceResult.value ?? 0;
      const sol = lamports / 1_000_000_000;
      setBalanceText(`${sol.toFixed(9)} SOL`);

      // 2. Get Recent Signatures
      const sigResult = await solanaRpc("getSignaturesForAddress", [
        BAD_SEED_WALLET_ADDRESS,
        { limit: 10 }, // Increased limit to see more activity
      ]);

      if (!Array.isArray(sigResult) || sigResult.length === 0) {
        setTxItems([]);
        setAiLogs([]);
        return;
      }

      // 3. Get Parsed Transaction Details (for USDC/SPL support)
      // Note: Helius free tier might not support batch getParsedTransactions, so we use parallel getTransaction
      const signatures = sigResult.map(s => s.signature);

      const txDetails = await Promise.all(
        signatures.map(async (sig) => {
          try {
            return await solanaRpc("getTransaction", [
              sig,
              { maxSupportedTransactionVersion: 0, commitment: "finalized", encoding: "jsonParsed" }
            ]);
          } catch (e) {
            console.warn(`Failed to fetch details for ${sig}`, e);
            return null;
          }
        })
      );

      // Process transactions to extract useful info (amount, direction, token)
      const processedTxs = sigResult.map((sigEntry, idx) => {
        const detail = txDetails && txDetails[idx] ? txDetails[idx] : null;
        let type = "Unknown";
        let amount = "";
        let direction = "";
        let token = "SOL";

        if (detail) {
          const meta = detail.meta;
          const transaction = detail.transaction;

          // Check for SOL balance change
          const accountIndex = transaction.message.accountKeys.findIndex(
            k => (k.pubkey || k) === BAD_SEED_WALLET_ADDRESS
          );

          if (accountIndex !== -1 && meta) {
            const pre = meta.preBalances[accountIndex];
            const post = meta.postBalances[accountIndex];
            const diff = post - pre;

            if (diff !== 0) {
              const solDiff = diff / 1_000_000_000;
              direction = solDiff > 0 ? "IN" : "OUT";
              amount = Math.abs(solDiff).toFixed(4);
              type = "Transfer";
            }
          }

          // Check for Token balance changes (USDC, etc)
          if (meta && meta.preTokenBalances && meta.postTokenBalances) {
            // Simple logic: find any token balance change for this wallet
            // This is a simplification; robust parsing is complex
            const preToken = meta.preTokenBalances.find(b => b.owner === BAD_SEED_WALLET_ADDRESS);
            const postToken = meta.postTokenBalances.find(b => b.owner === BAD_SEED_WALLET_ADDRESS);

            if (preToken || postToken) {
              const preAmt = preToken ? preToken.uiTokenAmount.uiAmount : 0;
              const postAmt = postToken ? postToken.uiTokenAmount.uiAmount : 0;
              const tokenDiff = postAmt - preAmt;

              if (tokenDiff !== 0) {
                direction = tokenDiff > 0 ? "IN" : "OUT";
                amount = Math.abs(tokenDiff).toFixed(2);
                token = "SPL"; // Could look up mint, but keeping it simple for now
                type = "Token Transfer";
                // Try to guess USDC based on decimals/mint if needed, but generic SPL is safer
                if (postToken && postToken.mint === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") {
                  token = "USDC";
                }
              }
            }
          }
        }

        return {
          ...sigEntry,
          type,
          amount,
          direction,
          token,
          note: "On-chain activity"
        };
      });

      // Filter transactions by blacklist
      const currentBlacklist = getBlacklistedAddresses();
      const displayed = [];
      const blacklisted = [];

      processedTxs.forEach(tx => {
        // Check if transaction involves any blacklisted address
        // We need to check the transaction details for account keys
        const txIndex = processedTxs.indexOf(tx);
        const detail = txDetails && txDetails[txIndex] ? txDetails[txIndex] : null;

        let isBlacklisted = false;
        if (detail && detail.transaction && detail.transaction.message) {
          const accountKeys = detail.transaction.message.accountKeys || [];
          // Check if any account matches blacklist
          isBlacklisted = accountKeys.some(key => {
            const address = typeof key === 'string' ? key : key.pubkey || key;
            return currentBlacklist.includes(address);
          });
        }

        if (isBlacklisted) {
          blacklisted.push(tx);
        } else {
          displayed.push(tx);
        }
      });

      setTxItems(displayed);
      setBlacklistedTxs(blacklisted);

      // 4. AI Logs with Caching (only for displayed transactions)
      // Check cache first
      const logs = [];
      const txsToFetch = [];
      const txsToFetchIndices = [];

      displayed.forEach((tx, i) => {
        const cached = getCachedLog(tx.signature);
        if (cached) {
          logs[i] = cached;
        } else {
          logs[i] = null; // Placeholder
          txsToFetch.push(tx);
          txsToFetchIndices.push(i);
        }
      });

      if (txsToFetch.length > 0) {
        // Build recent history context (last 5-10 transactions with memos and AI logs)
        const recentHistory = displayed.slice(0, 10).map((tx) => ({
          signature: tx.signature,
          type: tx.type || "Unknown",
          direction: tx.direction || "",
          amount: tx.amount || "",
          token: tx.token || "SOL",
          memo: tx.memo || null,
          aiLog: getCachedLog(tx.signature) || null
        }));

        // Fetch only missing logs with full context
        const fetchedLogs = await fetchAiLogsForTransactions(
          txsToFetch,
          sol,
          BAD_SEED_WALLET_ADDRESS,
          displayed.length,
          recentHistory
        );

        // Merge and save to cache
        fetchedLogs.forEach((log, fetchIdx) => {
          const originalIdx = txsToFetchIndices[fetchIdx];
          logs[originalIdx] = log;
          saveCachedLog(displayed[originalIdx].signature, log);
        });
      }

      setAiLogs(logs);
      // Forward any new memos to X.com after logs are stored
      await forwardMemosIfNeeded(displayed, logs);
      // Update queue display
      updateQueueDisplay();

    } catch (err) {
      console.error("Error loading Solana data:", err);
      // Only show error in UI if we failed to load critical data (balance/txs)
      // If we have data but failed on AI/Queue steps, keep showing the data
      if (!balanceText || balanceText === "Loading...") {
        setBalanceText("Error loading balance");
      }
      if (txItems.length === 0) {
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
  }

  // ===========================
  // DEV: generate a new seed on click
  // ===========================
  // Generator function removed

  return (
    <div id="app">
      {/* Wallet Controls - Fixed top right corner of page */}
      <div className="wallet-controls">
        <button
          className="send-message-btn"
          onClick={() => setShowSendModal(true)}
          disabled={!publicKey || isSending}
          style={{ display: publicKey ? 'block' : 'none' }}
        >
          Send Message to the Seed
        </button>
        <WalletMultiButton />
      </div>

      {/* Wallet Address Display - Seed Screen Only */}
      {!showDashboard && (
        <div
          className="seed-wallet-address fade-out-target"
          onClick={() => {
            navigator.clipboard.writeText(BAD_SEED_WALLET_ADDRESS);
            triggerLogoPulse();
          }}
          title="Click to copy address"
        >
          <span className="clipboard-icon">📋</span>
          {BAD_SEED_WALLET_ADDRESS.slice(0, 4)}...{BAD_SEED_WALLET_ADDRESS.slice(-4)}
        </div>
      )}

      {/* LOGO */}
      <header className="site-header">
        <img src="/logo.gif" alt="Bad Seed Logo" className={`logo ${logoPulseEnhanced ? 'logo--pulse-enhanced' : ''}`} />
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
            onClick={() => {
              loadWalletData();
              triggerLogoPulse();
            }}
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

                // Direction colors
                const dirColor = tx.direction === "IN" ? "#a0ffa0" : "#d4a5a5";
                const dirArrow = tx.direction === "IN" ? "↓ IN" : "↑ OUT";

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

                      {/* Amount & Direction (New) */}
                      {tx.amount && (
                        <div style={{ marginBottom: "0.25rem", color: dirColor, fontWeight: "bold" }}>
                          {dirArrow} {tx.amount} {tx.token}
                        </div>
                      )}

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
                        <div style={{ marginBottom: "0.25rem" }}>
                          <span className="tx-memo-label">Memo:</span>
                          <span className="tx-memo-text">{tx.memo}</span>
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
                      <div className="tx-ai-header">[BADSEED AI LOG]</div>
                      <div className="tx-ai-body">{aiLog}</div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* X.com Post Queue section */}
        <section id="queue-section" className="dashboard-card dashboard-card--glow post-queue-section">
          <h2 className="section-title">🌱 X.com Post Queue</h2>

          <div className="queue-status">
            <div className="queue-stat">
              <span className="queue-stat-label">Posts Today:</span>
              <span className="queue-stat-value">{dailyPostCount} / 2</span>
            </div>
            <div className="queue-stat">
              <span className="queue-stat-label">Queued:</span>
              <span className="queue-stat-value">{postQueue.length}</span>
            </div>
            <div className="queue-stat">
              <span className="queue-stat-label">Next Post:</span>
              <span className="queue-stat-value">
                {nextPostTime ? new Date(nextPostTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : 'N/A'}
              </span>
            </div>
          </div>

          {/* Manual Queue Controls - Dev Only */}
          {process.env.NODE_ENV === 'development' && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', justifyContent: 'center' }}>
              <button
                onClick={async () => {
                  const result = await forcePostNow();
                  if (result.success) {
                    alert("Post sent successfully!");
                  } else {
                    alert("Post failed: " + result.reason);
                  }
                  updateQueueDisplay();
                }}
                className="blacklist-btn"
                style={{ fontSize: '0.8rem', padding: '5px 10px' }}
              >
                ⚡ Force Post Now
              </button>
              <button
                onClick={() => {
                  addTestItem();
                  updateQueueDisplay();
                }}
                className="blacklist-btn"
                style={{ fontSize: '0.8rem', padding: '5px 10px' }}
              >
                🧪 Add Test Item
              </button>
              <button
                onClick={async () => {
                  if (window.confirm("Are you sure you want to clear the queue? This will remove all pending posts.")) {
                    await clearQueue();
                    updateQueueDisplay();
                  }
                }}
                className="blacklist-btn"
                style={{ fontSize: '0.8rem', padding: '5px 10px', backgroundColor: '#ff4444' }}
              >
                🗑️ Clear Queue
              </button>
            </div>
          )}

          <div className="queue-items">
            {postQueue.length === 0 ? (
              <div className="queue-empty">
                <p>No posts queued. Memos will automatically queue when new transactions with memos are detected.</p>
              </div>
            ) : (
              <ul className="queue-list">
                {postQueue.map((item, idx) => (
                  <li key={idx} className="queue-item">
                    <div className="queue-item-header">
                      <span className="queue-item-number">#{idx + 1}</span>
                      <span className="queue-item-time">
                        {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div className="queue-item-content">
                      <div className="queue-memo">
                        <span className="queue-label">📨 Memo:</span>
                        <span className="queue-text">"{item.memo}"</span>
                      </div>
                      <div className="queue-ai">
                        <span className="queue-label">→ AI:</span>
                        <span className="queue-text">{item.aiLog}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="queue-info">
            <p>🕒 Posts are sent twice daily (UTC midnight & noon). Limit: 2 posts/day.</p>
            <p>🔄 Duplicate memos are automatically filtered.</p>
          </div>
        </section>

        {/* Blacklist section */}
        <section className="dashboard-card dashboard-card--glow blacklist-section">
          <h2 className="section-title">🚫 Blacklisted Addresses</h2>

          <div className="blacklist-stats">
            <div className="blacklist-stat">
              <span className="blacklist-stat-label">Blacklisted Addresses:</span>
              <span className="blacklist-stat-value">{blacklist.length}</span>
            </div>
            <div className="blacklist-stat">
              <span className="blacklist-stat-label">Filtered Transactions:</span>
              <span className="blacklist-stat-value">{blacklistedTxs.length}</span>
            </div>
          </div>

          {/* Add address input - only show in local development */}
          {isLocalEnvironment() && (
            <div className="blacklist-add">
              <input
                type="text"
                className="blacklist-input"
                placeholder="Enter Solana address to blacklist..."
                value={newBlacklistAddress}
                onChange={(e) => setNewBlacklistAddress(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddToBlacklist();
                  }
                }}
              />
              <button
                className="blacklist-btn blacklist-btn-add"
                onClick={handleAddToBlacklist}
              >
                Add Address
              </button>
              <button
                className="blacklist-btn blacklist-btn-copy"
                onClick={handleCopyBlacklist}
                title="Copy blacklist array to clipboard for code update"
              >
                📋 Copy Blacklist for Code
              </button>
            </div>
          )}

          <div className="blacklist-list">
            {blacklist.length === 0 ? (
              <div className="blacklist-empty">
                <p>No addresses blacklisted. Add addresses above to filter unwanted transactions.</p>
              </div>
            ) : (
              <ul className="blacklist-addresses">
                {blacklist.map((address, idx) => (
                  <li key={idx} className="blacklist-item">
                    <span className="blacklist-address">{address}</span>
                    {/* Remove button - only show in local development */}
                    {isLocalEnvironment() && (
                      <button
                        className="blacklist-btn blacklist-btn-remove"
                        onClick={() => handleRemoveFromBlacklist(address)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {blacklistedTxs.length > 0 && (
            <details className="blacklist-transactions">
              <summary className="blacklist-tx-summary">
                View {blacklistedTxs.length} Filtered Transaction{blacklistedTxs.length !== 1 ? 's' : ''}
              </summary>
              <ul className="blacklist-tx-list">
                {blacklistedTxs.map((tx, idx) => (
                  <li key={idx} className="blacklist-tx-item">
                    <div className="blacklist-tx-info">
                      <span className="blacklist-tx-sig">
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tx.signature.slice(0, 20)}...
                        </a>
                      </span>
                      <span className="blacklist-tx-time">
                        {tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </main>
      {/* Send Message Modal */}
      {showSendModal && (
        <div className="modal-overlay" onClick={(e) => {
          // Only close if clicking on the overlay itself, not the modal content
          if (e.target.className === 'modal-overlay') {
            // Don't close - per requirements
          }
        }}>
          <div className="send-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Send a Transmission to the Seed</h2>

            <div style={{ marginBottom: "1rem" }}>
              <label>Message (Memo)</label>
              <textarea
                value={memoText}
                onChange={(e) => setMemoText(e.target.value)}
                placeholder="Type your message here..."
                maxLength={100}
              />
              <div style={{ textAlign: "right", fontSize: "0.8rem", color: "#666" }}>
                {memoText.length}/100
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label>Amount (SOL)</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value)}
              />
              <div className="modal-info">
                This will send SOL to the BAD SEED wallet with your message attached on-chain.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Scroll Buttons */}
      {showDashboard && (
        <div className="scroll-buttons">
          <button
            className="scroll-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="Scroll to Top"
          >
            ▲ Top
          </button>
          <button
            className="scroll-btn"
            onClick={() => {
              const queueSection = document.getElementById('queue-section');
              if (queueSection) queueSection.scrollIntoView({ behavior: 'smooth' });
            }}
            title="Scroll to Queue"
          >
            ▼ Queue
          </button>
        </div>
      )}

    </div>
  );
}

export default App;
