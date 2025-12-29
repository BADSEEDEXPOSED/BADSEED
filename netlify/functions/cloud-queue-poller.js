// Scheduled Function: Cloud Queue Poller
// Polls Solana for new memos, generates AI logs, and adds to Queue.
// Replaces the client-side "listener" in App.js to ensure 24/7 reliability.

const { Storage } = require('./lib/storage');
const { randomUUID } = require('crypto');
const aiNarrative = require('./ai-narrative');

// Initialize Storage
const storage = new Storage('queue-data');

// Configuration
const BAD_SEED_WALLET = "9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr";
// Hardcoded Blacklist (Synced from App.js)
const BLACKLIST = [
    "EZvp2MfKaqZ14D95EMSECXfGqduScMCSUzpKSxBcNTzM",
    "AoX3EMzVXCNBdCNvboc7yGM4gsr3wcKd7hGsZ4yXcydU",
    "FLipG5QHjZe1H12f6rr5LCnrmqjhwuBTBp78GwzxnwkR"
];

const RPC_URL = process.env.REACT_APP_SOLANA_RPC_HOST || "https://api.mainnet-beta.solana.com";

// Helper: Fetch RPC
async function solanaRpc(method, params) {
    const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`RPC Error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.result;
}

exports.handler = async (event, context) => {
    console.log('[Cloud Poller] Starting check...');

    try {
        // 1. Fetch Recent Transactions
        const signatures = await solanaRpc("getSignaturesForAddress", [
            BAD_SEED_WALLET,
            { limit: 20 }
        ]);

        if (!signatures || signatures.length === 0) {
            console.log('[Cloud Poller] No signatures found.');
            return { statusCode: 200, body: 'No Data' };
        }

        // 2. Fetch Transaction Details (Batching not supported nicely on generic RPC, doing parallel)
        const sigsToFetch = signatures.map(s => s.signature);

        // Fetch details
        const txDetails = await Promise.all(sigsToFetch.map(async (sig) => {
            try {
                return await solanaRpc("getTransaction", [
                    sig,
                    { maxSupportedTransactionVersion: 0, commitment: "finalized", encoding: "jsonParsed" }
                ]);
            } catch (e) {
                console.warn(`Failed to fetch tx ${sig}:`, e.message);
                return null;
            }
        }));

        // 3. Filter & Process
        const newMemos = [];
        const NOW = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;

        // Load existing Queue & History to check duplicates
        const queue = await storage.get('queue') || [];
        const history = await storage.get('posted-history') || [];

        // Helper to check duplication
        const isDuplicate = (memo) => {
            if (history.includes(memo)) return true;
            if (queue.some(item => item.memo === memo)) return true;
            return false;
        };

        for (let i = 0; i < txDetails.length; i++) {
            const detail = txDetails[i];
            if (!detail) continue;

            const blockTime = detail.blockTime ? detail.blockTime * 1000 : NOW;
            // Age check (> 24h)
            if (NOW - blockTime > ONE_DAY) continue;

            // Extract Memo
            // Memo is usually in the log messages or instruction data. 
            // Simplified: App.js relies on Helius parsing 'memo' field? 
            // Wait, Helius 'getTransaction' result usually puts memo in a specific place?
            // Standard Solana JSONParsed format checks inner instructions.
            // Let's look for "Program log: Memo ... " or parsed instruction.
            // Actually, `App.js` seemed to access `tx.memo`. 
            // Helius enhanced RPC returns a top-level `memo`. 
            // Standard getTransaction does NOT.
            // If we are using Helius RPC URL, we might get standard Solana node response.
            // We need to parse memo manually from logMessages if needed.

            let memo = null;

            // Try extracting from logs
            if (detail.meta && detail.meta.logMessages) {
                const logs = detail.meta.logMessages;
                for (const log of logs) {
                    if (log.includes("Memo (")) {
                        // "Program log: Memo (len ..): "
                        const parts = log.split("): ");
                        if (parts.length > 1) memo = parts[1];
                    } else if (log.startsWith("Program log: Memo ")) {
                        // Some formats
                        // Just fallback to looking for Spl Memo instruction?
                    }
                }
            }
            // Better: Parse transaction instructions
            if (!memo && detail.transaction && detail.transaction.message) {
                const instructions = detail.transaction.message.instructions;
                for (const ix of instructions) {
                    if (ix.programId === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr") {
                        if (ix.parsed) {
                            memo = ix.parsed;
                        } else if (ix.data) {
                            // Decode base58 or base64 data
                            // Too complex for quick script. 
                            // Let's assume logs work or Helius returns it if enhanced.
                        }
                    }
                }
            }

            // Fallback: If App.js works, it implies Helius might be returning it.
            // BUT, `App.js` uses `getSignaturesForAddress` with `jsonParsed`? 
            // App.js uses `tx.memo`.
            // Let's assume standard log parsing is safest.

            // RE-READING APP.JS: App.js uses `solanaRpc("getTransaction", ... encoding: "jsonParsed")`
            // And then accesses `tx.memo`. 
            // Wait, standard Solana getTransaction does NOT have .memo.
            // Maybe the user is using Helius ENHANCED transactions endpoint?
            // "v0/transactions/..."? 
            // No, the code calls "getTransaction" method. 
            // This is standard RPC.
            // So `tx.memo` in App.js must be coming from somewhere.
            // Ah, App.js might be parsing it inside the mapping logic?
            // Checking App.js again... line 1339: `{tx.memo && ...}`
            // Step 2242 shows `processedTxs` mapping logic.
            // Line 609: `const processedTxs = ...`
            // It maps `sigResult` and uses `txDetails`.
            // Line 664: `return { ...sigEntry, ... note: "..." }`. It does NOT explicitly extract memo there.
            // Wait, does `sigEntry` (from getSignaturesForAddress) have memo? 
            // YES! `getSignaturesForAddress` returns `memo` field if it exists in the transaction log!
            // THAT IS IT. We don't need getTransaction for the memo!

            const sigEntry = signatures.find(s => s.signature === sigsToFetch[i]);
            if (sigEntry && sigEntry.memo) {
                memo = sigEntry.memo;
                // Remove the "Memo: " prefix if present (sometimes raw)
                if (memo.startsWith("[") && memo.endsWith("]")) {
                    // Sometimes it's weird. Let's trust the string.
                }
            }

            if (!memo) continue;

            // Check Blacklist
            let isBlacklisted = false;
            // To check blacklist we need the accounts from 'detail'
            if (detail && detail.transaction && detail.transaction.message) {
                const accountKeys = detail.transaction.message.accountKeys;
                isBlacklisted = accountKeys.some(k => {
                    const key = k.pubkey || k; // jsonParsed vs raw
                    return BLACKLIST.includes(key);
                });
            }
            if (isBlacklisted) {
                console.log(`[Cloud Poller] Ignored blacklist tx: ${sigsToFetch[i]}`);
                continue;
            }

            // Check Duplicates
            if (isDuplicate(memo)) {
                console.log(`[Cloud Poller] Ignored duplicate: "${memo}"`);
                continue;
            }

            // Process New Memo!
            console.log(`[Cloud Poller] Processing NEW memo: "${memo}"`);
            newMemos.push({
                signature: sigsToFetch[i],
                memo,
                blockTime: blockTime,
                detail: detail // Pass full detail for Amount check in AI
            });
        }

        if (newMemos.length === 0) {
            console.log('[Cloud Poller] No new clean memos.');
            return { statusCode: 200, body: 'No new memos' };
        }

        // 4. Generate AI Logs & Queue
        // We reuse the 'ai-narrative' logic by mocking the event object
        // We handle one by one to ensure sequence
        let addedCount = 0;

        for (const item of newMemos) {
            // Mock transaction object expected by ai-narrative
            // It expects: { signature, memo, amount, direction ... }
            // We need to extract Amount/Direction from detail
            let amount = 0;
            let direction = 'unknown';

            // Simplified Amount Parsing (SOL)
            if (item.detail && item.detail.meta) {
                const accountIndex = item.detail.transaction.message.accountKeys.findIndex(k => (k.pubkey || k) === BAD_SEED_WALLET);
                if (accountIndex !== -1) {
                    const diff = item.detail.meta.postBalances[accountIndex] - item.detail.meta.preBalances[accountIndex];
                    if (diff !== 0) {
                        amount = Math.abs(diff / 1e9);
                        direction = diff > 0 ? 'in' : 'out';
                    }
                }
            }

            const mockBody = {
                balanceSol: 6.66, // Dummy, needed for context?
                transactions: [{
                    signature: item.signature,
                    memo: item.memo,
                    amount: amount,
                    direction: direction,
                    blockTime: item.blockTime / 1000
                }]
            };

            // Invoke AI Logic
            // We call the handler directly
            const aiResponse = await aiNarrative.handler({
                httpMethod: 'POST',
                body: JSON.stringify(mockBody)
            });

            if (aiResponse.statusCode !== 200) {
                console.error('[Cloud Poller] AI Generation Failed:', aiResponse.body);
                continue;
            }

            const aiData = JSON.parse(aiResponse.body);
            const aiLog = aiData.logs && aiData.logs[0] ? aiData.logs[0] : "AI Silence...";

            // Add to Queue
            const newItem = {
                id: randomUUID(),
                memo: item.memo,
                aiLog: aiLog,
                createdAt: new Date().toISOString()
            };

            queue.push(newItem);
            addedCount++;
            console.log(`[Cloud Poller] Queued: "${newItem.memo}" -> "${newItem.aiLog}"`);
        }

        if (addedCount > 0) {
            await storage.set('queue', queue);
            console.log(`[Cloud Poller] Queue updated. Total items: ${queue.length}`);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ added: addedCount, queueSize: queue.length })
        };

    } catch (e) {
        console.error('[Cloud Poller] Critical Error:', e);
        return { statusCode: 500, body: e.message };
    }
};

exports.config = {
    schedule: "*/10 * * * *" // Run every 10 minutes
};
