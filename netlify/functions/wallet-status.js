// API Endpoint: Get Wallet Status (Balance & Recent Txs)
// Mirrors the Cloud Poller's view of the blockchain.

const RPC_URL = process.env.REACT_APP_SOLANA_RPC_HOST || "https://api.mainnet-beta.solana.com";
const BAD_SEED_WALLET = "9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr";

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

exports.handler = async (event) => {
    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        // 1. Get Balance
        const balanceResult = await solanaRpc("getBalance", [
            BAD_SEED_WALLET,
            { commitment: "finalized" }
        ]);
        const solBalance = (balanceResult.value || 0) / 1e9;

        // 2. Get Recent Signatures (limit 5 for display)
        const signatures = await solanaRpc("getSignaturesForAddress", [
            BAD_SEED_WALLET,
            { limit: 5 }
        ]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                address: BAD_SEED_WALLET,
                balance: solBalance,
                recentParams: signatures.map(s => ({
                    signature: s.signature,
                    slot: s.slot,
                    err: s.err,
                    memo: s.memo,
                    blockTime: s.blockTime
                })),
                timestamp: new Date().toISOString()
            })
        };

    } catch (error) {
        console.error('Wallet Status Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
