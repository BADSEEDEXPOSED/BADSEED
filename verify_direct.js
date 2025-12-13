const ENDPOINT = "https://badseed.netlify.app/.netlify/functions/dapp-config";

async function testDirect() {
    const { default: fetch } = await import('node-fetch');
    console.log(`Checking ${ENDPOINT}...`);
    try {
        const res = await fetch(ENDPOINT);
        if (res.ok) {
            const json = await res.json();
            console.log("✅ SUCCESS: Function is alive!", json);
        } else {
            console.error(`❌ FAILED: ${res.status} ${res.statusText}`);
            console.error(await res.text());
        }
    } catch (err) {
        console.error("❌ ERROR:", err.message);
    }
}
testDirect();
