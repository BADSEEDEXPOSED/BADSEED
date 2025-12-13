// Test Local Proxy Connectivity
const ENDPOINT = "http://127.0.0.1:3000/.netlify/functions/dapp-config";

async function testLocalProxy() {
    const { default: fetch } = await import('node-fetch');

    console.log(`Testing Proxy at: ${ENDPOINT}`);

    try {
        // 1. GET
        console.log("1. GET Request...");
        const res1 = await fetch(ENDPOINT);
        if (!res1.ok) {
            const txt = await res1.text();
            throw new Error(`GET failed (${res1.status}): ${txt}`);
        }
        const data1 = await res1.json();
        console.log("SUCCESS: Retrieved Config:", data1);

        // 2. POST
        console.log("\n2. POST Request (Update Sweep -> FALSE)...");
        const update = { isSweepEnabled: false, updatedBy: "local_proxy_test" };
        const res2 = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update)
        });
        if (!res2.ok) {
            const txt = await res2.text();
            throw new Error(`POST failed (${res2.status}): ${txt}`);
        }
        const data2 = await res2.json();
        console.log("SUCCESS: Updated Config:", data2);

        // 3. Verify Persistence
        console.log("\n3. GET Verify...");
        const res3 = await fetch(ENDPOINT);
        const data3 = await res3.json();
        if (data3.isSweepEnabled === false) {
            console.log("✅ VERIFIED: Local proxy successfully updated production DB!");
        } else {
            console.error("❌ FAILED: Update did not persist. Current value:", data3.isSweepEnabled);
        }

    } catch (err) {
        console.error("\n❌ PROXY ERROR:", err.message);
        if (err.message.includes("ECONNREFUSED")) {
            console.error("HINT: Is the local server (npm start) actually running on port 3000?");
        }
    }
}

testLocalProxy();
