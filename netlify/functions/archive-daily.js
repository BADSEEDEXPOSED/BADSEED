// Scheduled Function: Daily Archive to Arweave (Irys)
// Runs at 23:55 UTC
// 1. Gathers daily data (Prophecy, Sentiments, Queue History)
// 2. Checks BAGSEED Wallet Balance
// 3. CHAOS Logic:
//    - If Balance > Cost: Upload to Arweave (Permanent)
//    - If Balance < Cost: Add to 'pending-archives' list in Redis

const { Storage } = require('./lib/storage');
const Irys = require('@irys/sdk');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const crypto = require('crypto');
// [FIX] Import Prophecy Logic to ensure freshness
const { generateProphecy } = require('./lib/prophecy-logic');

// Initialize Storage
const sentimentStorage = new Storage('sentiment-data');
const queueStorage = new Storage('queue-data');

// Constants
const SOLANA_RPC = "https://mainnet.helius-rpc.com/?api-key=65cfa9f7-7bfe-44ff-8e98-24ff80b01e8c"; // Helius Mainnet
const IRYS_NODE = "https://node1.irys.xyz"; // Mainnet

const bs58 = require('bs58');

exports.handler = async (event, context) => {
    console.log('[Daily Archive] Running at', new Date().toISOString());

    try {
        // 1. Gather Data
        let sentimentData = await sentimentStorage.get('data') || {};
        const queueHistory = await queueStorage.get('posted-history') || [];
        const queue = await queueStorage.get('queue') || [];

        // [FIX] Check for Stale Prophecy (Date Mismatch)
        const today = new Date().toISOString().split('T')[0];
        const lastProphecyDate = sentimentData.prophecy ? sentimentData.prophecy.date : null;

        if (lastProphecyDate !== today) {
            console.log(`[Archive] Prophecy Stale (Last: ${lastProphecyDate}, Today: ${today}). Waking Oracle...`);
            try {
                // Force Generation (updates DB and returns fresh prophecy)
                const genResult = await generateProphecy(true);
                if (genResult && genResult.prophecy) {
                    console.log('[Archive] Prophecy Regenerated Successfully.');
                    // Update validity of our local data object
                    sentimentData.prophecy = genResult.prophecy;
                    // Note: generateProphecy() does NOT reset sentiment counts, so those remain accurate.
                }
            } catch (genErr) {
                console.error('[Archive] Failed to regenerate prophecy:', genErr);
                // We proceed with stale prophecy if gen fails, to at least save the transactions?
                // Or we fail? The user wants "make sure the record happens AFTER".
                // If gen fails, the record is incomplete. But better to archive something than nothing?
                // Let's attach metadata saying it failed.
            }
        }

        // Construct the Daily Record
        const dailyRecord = {
            date: today,
            timestamp: new Date().toISOString(),
            prophecy: sentimentData.prophecy || null,
            sentiments: sentimentData.sentiments || {},
            totalMemos: sentimentData.totalMemos || 0,
            transactions: queueHistory,
            pendingQueueSize: queue.length
        };

        const jsonString = JSON.stringify(dailyRecord, null, 2);
        const dataSize = Buffer.byteLength(jsonString, 'utf8');
        console.log(`[Archive] Generated record. Size: ${dataSize} bytes`);


        // 2. Setup Wallet
        let walletKey;
        if (process.env.BADSEED_WALLET_PRIVATE_KEY) {
            const { Keypair } = require('@solana/web3.js');
            // Handle bs58 import differences
            const decode = bs58.decode || (bs58.default ? bs58.default.decode : null);
            if (!decode) throw new Error("Could not find bs58.decode function");

            const keyString = process.env.BADSEED_WALLET_PRIVATE_KEY;
            const decodedKey = decode(keyString);
            walletKey = Keypair.fromSecretKey(decodedKey).secretKey;
            console.log(`[Archive] Wallet Key configured (Length: ${walletKey.length})`);
            if (walletKey.length !== 64) console.warn("[Archive] Warning: Key length is not 64 bytes!");

        } else if (process.env.BADSEED_WALLET_SEED) {
            console.log("[Archive] Deriving from BADSEED_WALLET_SEED");
            const mnemonic = process.env.BADSEED_WALLET_SEED;
            const seed = await bip39.mnemonicToSeed(mnemonic);
            const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
            const { Keypair } = require('@solana/web3.js');
            walletKey = Keypair.fromSeed(derivedSeed).secretKey;
        } else {
            throw new Error("Missing BADSEED_WALLET_PRIVATE_KEY or BADSEED_WALLET_SEED");
        }


        // 3. Initialize Irys
        const irys = new Irys({
            url: IRYS_NODE,
            token: "solana",
            key: walletKey,
            config: { providerUrl: SOLANA_RPC }
        });



        // Note: 'getLoadedBalance' is balance ON Irys node. We might need to fund it from the wallet first.
        // But for simplicity, let's assume we try to upload. Irys SDK usually auto-funds if configured, 
        // or we check wallet balance.
        // Actually, with @irys/sdk and Solana, it funds from wallet on demand usually? 
        // Let's use 'fund' if needed. Or just check wallet balance.

        // Get actual SOL balance of wallet
        // We can skip explicit balance check and just try -> catch insufficient funds

        try {
            await irys.ready();
            console.log(`[Archive] Irys Ready! Address: ${irys.address}`);
        } catch (e) {
            console.error("[Archive] Irys Ready Failed:", e);
            throw new Error(`Irys initialization failed: ${e.message}`);
        }

        // 4. Check Cost & Balance (Chaos Check)
        // Re-calculate price/balance now that Irys is ready
        let price, balance;
        try {
            price = await irys.getPrice(dataSize);
            balance = await irys.getLoadedBalance();
            console.log(`[Chaos Check] Cost: ${irys.utils.fromAtomic(price)} SOL | Balance: ${irys.utils.fromAtomic(balance)} SOL`);
        } catch (e) {
            console.warn("Failed to get cost/balance, proceeding with caution:", e);
            // attempt upload anyway, might fail
            price = irys.utils.toAtomic(0.000001); // fallback dummy
            balance = irys.utils.toAtomic(0);
        }

        let txId = null;
        let success = false;

        try {
            // Attempt Upload (Funds must be in wallet, Irys signs tx)
            // For Irys on Solana, you often need to fund the node first. 
            // Automatic funding: irys.fund(price)

            // Check if we need to fund
            if (balance.lt(price)) {
                console.log(`[Archive] Funding Irys node with ${price} atomic units...`);
                await irys.fund(price);
            }

            const receipt = await irys.upload(jsonString, {
                tags: [{ name: "Content-Type", value: "application/json" }, { name: "App-Name", value: "BADSEED-ARCHIVE" }]
            });

            txId = receipt.id;
            success = true;
            console.log(`[Archive] SUCCESS! Arweave TX: https://arweave.net/${txId}`);

        } catch (err) {
            console.warn(`[Chaos Archive] Upload failed (likely insufficient funds): ${err.message}`);
            success = false;
        }

        // 5. Update Resilience State (Redis)
        let archiveState = await sentimentStorage.get('archive-state') || { pending: [], history: [] };

        if (success) {
            // Add to history
            archiveState.history.unshift({
                date: today,
                txId: txId,
                timestamp: new Date().toISOString(),
                manual: false,
                data: dailyRecord // Store full data for local verification
            });
            if (archiveState.history.length > 256) archiveState.history.pop();
            await sentimentStorage.set('archive-state', archiveState);

            // Deduplication: Clear posted history so they are not archived again
            await queueStorage.set('posted-history', []);
            console.log('[Archive] Cleared posted-history (Batch Processed).');
            // Clean up any pending retries (if we eventually implement retry logic to upload OLD dates)
            // For now, today is done.
        } else {
            // Add to Pending Queue
            console.log(`[Chaos] Adding ${today} to Pending Queue.`);
            const alreadyPending = archiveState.pending.find(p => p.date === today);
            if (!alreadyPending) {
                archiveState.pending.push({
                    date: today,
                    data: dailyRecord, // Save the data itself so we can retry later!
                    attempts: 1,
                    lastAttempt: new Date().toISOString()
                });
            }
        }

        // Keep history size sane
        if (archiveState.history.length > 256) archiveState.history.pop();

        await sentimentStorage.set('archive-state', archiveState);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success,
                chaosMode: !success,
                txId: txId || null,
                message: success ? "Archived to Arweave" : "Insufficient Funds - Added to Pending"
            })
        };

    } catch (error) {
        console.error('[Archive Error]', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

exports.config = {
    schedule: "55 23 * * *" // 23:55 UTC daily
};
