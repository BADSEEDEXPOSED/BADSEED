// Manual Trigger: Force Daily Archive
// Endpoint: /.netlify/functions/manual-trigger-archive
// Usage: GET or POST request to force an archive attempt immediately
// Mirros logic from 'archive-daily.js' but returns immediate feedback

const { Storage } = require('./lib/storage');
const Irys = require('@irys/sdk');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const crypto = require('crypto');
const bs58 = require('bs58'); // Required for Keypair defaults in some envs

// Initialize Storage (Shared with daily cron)
const sentimentStorage = new Storage('sentiment-data');
const queueStorage = new Storage('queue-data');

// Constants
// Use reliable Helius RPC (same as App.js) to avoid rate limits
const SOLANA_RPC = "https://mainnet.helius-rpc.com/?api-key=65cfa9f7-7bfe-44ff-8e98-24ff80b01e8c";
const IRYS_NODE = "https://node1.irys.xyz";

exports.handler = async (event, context) => {
    console.log('[Manual Archive] Invoked at', new Date().toISOString());

    try {
        // 1. Gather Data
        const sentimentData = await sentimentStorage.get('data') || {};

        // Fetch Live Transactions (Source of Truth) directly from Chain
        let liveTransactions = [];
        try {
            const { Connection, PublicKey } = require('@solana/web3.js');
            const connection = new Connection(SOLANA_RPC, 'confirmed');
            // Assuming wallet public key is known or derivable. 
            // For now, let's use the one from env if possible, or skip if not.
            // Wait, we need the public key to fetch signatures.
            // We can derive it from the private key used for Irys, OR use the BAD_SEED_WALLET_ADDRESS if stored in env.
            // Let's assume process.env.BADSEED_WALLET_ADDRESS is set, or derive from Private Key.

            let pubKeyStr = process.env.BADSEED_WALLET_ADDRESS;
            // Fallback: Use the known hardcoded BAD SEED main wallet address if env var is missing
            // This matches the frontend configuration in App.js
            if (!pubKeyStr) {
                pubKeyStr = "9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr";
            }
            // Logic to derive from private key is risky if keys differ, so we prioritize the hardcoded/env address.
            if (!pubKeyStr && process.env.BADSEED_WALLET_PRIVATE_KEY) {
                const { Keypair } = require('@solana/web3.js');
                const bs58 = require('bs58');
                const secret = bs58.decode(process.env.BADSEED_WALLET_PRIVATE_KEY);
                pubKeyStr = Keypair.fromSecretKey(secret).publicKey.toBase58();
            }

            if (pubKeyStr) {
                const signatures = await connection.getSignaturesForAddress(new PublicKey(pubKeyStr), { limit: 20 });
                // We just want the list of signatures/memos essentially
                liveTransactions = signatures.map(sig => ({
                    signature: sig.signature,
                    slot: sig.slot,
                    blockTime: sig.blockTime,
                    memo: sig.memo, // Note: getSignaturesForAddress might not fully parse memos without 'confirmed' and further parsing, but let's see. 
                    // actually getSignaturesForAddress returns { signature, slot, err, memo, blockTime }
                }));
                console.log(`[Manual Archive] Fetched ${liveTransactions.length} live transactions.`);
            } else {
                console.warn("[Manual Archive] No Wallet Address found to fetch transactions.");
            }
        } catch (rpcErr) {
            console.warn("[Manual Archive] RPC Fetch Failed:", rpcErr);
            // Fallback to posted history if RPC fails
            liveTransactions = await queueStorage.get('posted-history') || [];
        }

        const queue = await queueStorage.get('queue') || [];

        // Construct the Daily Record
        const today = new Date().toISOString().split('T')[0];
        const dailyRecord = {
            date: today,
            timestamp: new Date().toISOString(),
            prophecy: sentimentData.prophecy || null,
            sentiments: sentimentData.sentiments || {},
            totalMemos: sentimentData.totalMemos || 0,
            transactions: liveTransactions, // Use LIVE data
            pendingQueueSize: queue.length,
            manualTrigger: true
        };

        const jsonString = JSON.stringify(dailyRecord, null, 2);
        const dataSize = Buffer.byteLength(jsonString, 'utf8');
        console.log(`[Manual Archive] Generated record. Size: ${dataSize} bytes`);

        // 2. Setup Wallet (Simplified Logic - reusing env vars)
        let walletKey;
        try {
            if (process.env.BADSEED_WALLET_PRIVATE_KEY) {
                const { Keypair } = require('@solana/web3.js');
                const decode = bs58.decode || (bs58.default ? bs58.default.decode : null);
                const keyString = process.env.BADSEED_WALLET_PRIVATE_KEY;
                const decodedKey = decode(keyString);
                walletKey = Keypair.fromSecretKey(decodedKey).secretKey;
            } else if (process.env.BADSEED_WALLET_SEED) {
                const mnemonic = process.env.BADSEED_WALLET_SEED;
                const seed = await bip39.mnemonicToSeed(mnemonic);
                const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
                const { Keypair } = require('@solana/web3.js');
                walletKey = Keypair.fromSeed(derivedSeed).secretKey;
            } else {
                throw new Error("Missing Wallet Credentials");
            }
        } catch (walletErr) {
            console.warn("[Manual Archive] Wallet setup failed:", walletErr);
            // Proceed to Chaos Mode logic (add to pending)
            return await addToPending(today, dailyRecord, "Wallet Setup Failed");
        }


        // 3. Initialize Irys
        let irys;
        try {
            irys = new Irys({
                url: IRYS_NODE,
                token: "solana",
                key: walletKey,
                config: { providerUrl: SOLANA_RPC }
            });
            await irys.ready();
        } catch (e) {
            console.warn("[Manual Archive] Irys init failed:", e);
            return await addToPending(today, dailyRecord, "Irys Connection Failed");
        }

        // 4. Check Cost & Balance (Chaos Check)
        let price, balance;
        try {
            price = await irys.getPrice(dataSize);
            balance = await irys.getLoadedBalance();
        } catch (e) {
            console.warn("[Manual Archive] Price check failed:", e);
            // Fallback attempt or fail
            return await addToPending(today, dailyRecord, "Price Check Failed");
        }

        let txId = null;
        let success = false;

        try {
            if (balance.lt(price)) {
                await irys.fund(price); // Try to fund
            }
            const receipt = await irys.upload(jsonString, {
                tags: [{ name: "Content-Type", value: "application/json" }, { name: "App-Name", value: "BADSEED-ARCHIVE" }]
            });
            txId = receipt.id;
            success = true;
        } catch (err) {
            console.warn(`[Manual Archive] Upload failed: ${err.message}`);
            success = false;
        }

        // 5. Update State
        let archiveState = await sentimentStorage.get('archive-state') || { pending: [], history: [] };

        if (success) {
            archiveState.history.unshift({
                date: today,
                txId: txId,
                timestamp: new Date().toISOString(),
                manual: true,
                data: dailyRecord // Store full data for local verification
            });
            if (archiveState.history.length > 256) archiveState.history.pop();
            await sentimentStorage.set('archive-state', archiveState);

            // Deduplication: Clear posted history
            await queueStorage.set('posted-history', []);
            console.log('[Manual Archive] Cleared posted-history.');

            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: "Archive Uploaded Successfully",
                    txId: txId
                })
            };

        } else {
            return await addToPending(today, dailyRecord, "Upload/Fund Failed");
        }

    } catch (error) {
        console.error('[Manual Archive Error]', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// Helper: Add to Pending Queue
async function addToPending(today, dailyRecord, reason) {
    const sentimentStorage = new Storage('sentiment-data');
    let archiveState = await sentimentStorage.get('archive-state') || { pending: [], history: [] };

    // Check if already pending for today
    const existingIndex = archiveState.pending.findIndex(p => p.date === today);
    if (existingIndex >= 0) {
        // Update existing (maybe data changed)
        archiveState.pending[existingIndex].data = dailyRecord;
        archiveState.pending[existingIndex].lastAttempt = new Date().toISOString();
        archiveState.pending[existingIndex].attempts = (archiveState.pending[existingIndex].attempts || 0) + 1;
    } else {
        // Add new
        archiveState.pending.push({
            date: today,
            data: dailyRecord,
            attempts: 1,
            lastAttempt: new Date().toISOString()
        });
    }

    await sentimentStorage.set('archive-state', archiveState);

    return {
        statusCode: 200,
        body: JSON.stringify({
            success: false,
            chaosMode: true,
            message: `Archive added to PENDING queue. Reason: ${reason}`,
            reason: reason
        })
    };
}
