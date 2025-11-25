
const fetch = require('node-fetch');

const RPC_BASE = "aHR0cHM6Ly9tYWlubmV0LmhlbGl1cy1ycGMuY29tLw==";
const RPC_PARAM = "P2FwaS1rZXk9";
const RPC_KEY_P1 = "NjVjZmE5Zjc=";
const RPC_KEY_P2 = "N2JmZS00NGZm";
const RPC_KEY_P3 = "OGU5OC0yNGZmODBiMDFlOGM=";
const ENDPOINT = atob(RPC_BASE) + atob(RPC_PARAM) + atob(RPC_KEY_P1) + "-" + atob(RPC_KEY_P2) + "-" + atob(RPC_KEY_P3);

function atob(str) { return Buffer.from(str, 'base64').toString('binary'); }

async function testSingle() {
    try {
        const sig = "2aEbk4tt8GQHsuzCAZnWQeUtSrhS7YXojjiJEWBUyZsJDFUA8juAWLQ8HkND2qq3DZCPUNv124mBFEZaGc3UMmVh"; // Example from prev run
        console.log("Testing getTransaction for:", sig);

        const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getTransaction",
                params: [
                    sig,
                    { maxSupportedTransactionVersion: 0, commitment: "finalized", encoding: "jsonParsed" }
                ]
            })
        });
        const json = await res.json();
        console.log("getTransaction Result:", json.result ? "SUCCESS" : "FAIL");
        if (json.error) console.error(json.error);
        else console.log("Meta:", json.result ? "Found" : "Null");

    } catch (err) {
        console.error(err);
    }
}

testSingle();
