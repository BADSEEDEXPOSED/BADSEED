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
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const IRYS_NODE = "https://node1.irys.xyz";

exports.handler = async (event, context) => {
    console.log('[Manual Archive] Invoked at', new Date().toISOString());

    try {
        // 1. Gather Data
        const sentimentData = await sentimentStorage.get('data') || {};
        const queueHistory = await queueStorage.get('posted-history') || [];
        const queue = await queueStorage.get('queue') || [];

        // Construct the Daily Record
        const today = new Date().toISOString().split('T')[0];
        const dailyRecord = {
            date: today,
            timestamp: new Date().toISOString(),
            prophecy: sentimentData.prophecy || null,
            sentiments: sentimentData.sentiments || {},
            totalMemos: sentimentData.totalMemos || 0,
            transactions: queueHistory,
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
            if (archiveState.history.length > 50) archiveState.history.pop();
            await sentimentStorage.set('archive-state', archiveState);

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
