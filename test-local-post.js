// Uses Node 18+ native fetch
async function testPost() {
    const url = 'http://127.0.0.1:3000/.netlify/functions/x-poster';
    console.log(`Testing POST to ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: `Test post from local dev environment ${Date.now()}`
            })
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log('Response:', text);

        if (response.ok) {
            console.log('✅ SUCCESS: Function is reachable and executed.');
        } else {
            console.log('❌ FAILED: Function returned error.');
            if (response.status === 404) {
                console.log('👉 Check if netlify functions:serve is running on port 9999');
            }
            if (response.status === 500) {
                console.log('👉 Check function logs for errors (likely missing API keys)');
            }
        }
    } catch (error) {
        console.error('❌ ERROR: Could not connect to function.', error.message);
    }
}

testPost();
