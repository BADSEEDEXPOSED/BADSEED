
const fetch = require('node-fetch');

const RPC_BASE = "aHR0cHM6Ly9tYWlubmV0LmhlbGl1cy1ycGMuY29tLw==";
const RPC_PARAM = "P2FwaS1rZXk9";
const RPC_KEY_P1 = "NjVjZmE5Zjc=";
const RPC_KEY_P2 = "N2JmZS00NGZm";
const RPC_KEY_P3 = "OGU5OC0yNGZmODBiMDFlOGM=";
const SOLANA_RPC_ENDPOINT = atob(RPC_BASE) + atob(RPC_PARAM) + atob(RPC_KEY_P1) + "-" + atob(RPC_KEY_P2) + "-" + atob(RPC_KEY_P3);

// Polyfill atob for Node environment if needed (Node > 16 has global atob, but just in case)
function atob(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

const ENDPOINT = atob(RPC_BASE) + atob(RPC_PARAM) + atob(RPC_KEY_P1) + "-" + atob(RPC_KEY_P2) + "-" + atob(RPC_KEY_P3);

console.log("Testing RPC Endpoint:", ENDPOINT.replace(/api-key=.*/, "api-key=HIDDEN"));

async function testRpc() {
    try {
        // 1. Test getBalance (Lightweight)
        console.log("\n1. Testing getBalance...");
        const balanceRes = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getBalance",
                params: ["9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr"]
            })
        });
        const balanceJson = await balanceRes.json();
        console.log("getBalance Result:", balanceJson.result ? "SUCCESS" : "FAIL", balanceJson);

        // 2. Test getSignaturesForAddress
        console.log("\n2. Testing getSignaturesForAddress...");
        const sigRes = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getSignaturesForAddress",
                params: ["9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr", { limit: 2 }]
            })
        });
        const sigJson = await sigRes.json();
        console.log("getSignaturesForAddress Result:", sigJson.result ? "SUCCESS" : "FAIL");

        if (!sigJson.result || sigJson.result.length === 0) {
            console.log("No signatures found, skipping parse test.");
            return;
        }

        const signatures = sigJson.result.map(s => s.signature);
        console.log("Found signatures:", signatures);

        // 3. Test getParsedTransactions (Heavy)
        console.log("\n3. Testing getParsedTransactions...");
        const parseRes = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getParsedTransactions",
                params: [signatures, { maxSupportedTransactionVersion: 0, commitment: "finalized" }]
            })
        });
        const parseJson = await parseRes.json();
        console.log("getParsedTransactions Result:", parseJson.result ? "SUCCESS" : "FAIL");
        if (parseJson.error) {
            console.error("RPC Error:", parseJson.error);
        } else {
            console.log("Parsed Data Sample:", parseJson.result[0] ? "Found Data" : "Null");
        }

    } catch (err) {
        console.error("Test Failed:", err);
    }
}

testRpc();
