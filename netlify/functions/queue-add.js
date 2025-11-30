const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    const { memo, aiLog } = body;
    if (!memo) {
        return { statusCode: 400, body: 'Missing memo' };
    }

    const file = path.resolve(__dirname, 'queue.json');
    let queue = [];
    if (fs.existsSync(file)) {
        try {
            queue = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            console.error('Failed to parse queue.json', e);
            queue = [];
        }
    }

    const exists = queue.some(item => item.memo === memo);
    if (exists) {
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Already queued', skipped: true })
        };
    }

    const newItem = {
        id: randomUUID(),
        memo,
        aiLog: aiLog || '',
        createdAt: new Date().toISOString()
    };

    queue.push(newItem);
    try {
        fs.writeFileSync(file, JSON.stringify(queue, null, 2));
    } catch (e) {
        console.error('Failed to write queue.json', e);
        return { statusCode: 500, body: 'Server error: cannot write queue file' };
    }

    return {
        statusCode: 201,
        body: JSON.stringify(newItem),
        headers: { 'Content-Type': 'application/json' }
    };
};
