// const fetch = require('node-fetch'); // Native fetch in Node 18+

async function testQueueAdd() {
    try {
        const response = await fetch('http://localhost:9999/.netlify/functions/queue-add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memo: 'Test Memo ' + Date.now(), aiLog: 'Test Log' })
        });
        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Body:', text);
    } catch (e) {
        console.error('Error:', e);
    }
}

testQueueAdd();
