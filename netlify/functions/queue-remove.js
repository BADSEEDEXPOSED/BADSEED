const fs = require('fs');
const path = require('path');

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

    const { ids } = body; // Expecting array of IDs
    if (!Array.isArray(ids)) {
        return { statusCode: 400, body: 'Missing ids array' };
    }

    const file = path.resolve(__dirname, 'queue.json');
    if (!fs.existsSync(file)) {
        return { statusCode: 200, body: JSON.stringify({ removed: [] }) };
    }

    let queue = [];
    try {
        queue = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        queue = [];
    }

    const initialLength = queue.length;
    queue = queue.filter(item => !ids.includes(item.id));

    fs.writeFileSync(file, JSON.stringify(queue, null, 2));

    return {
        statusCode: 200,
        body: JSON.stringify({
            removedCount: initialLength - queue.length,
            remainingCount: queue.length
        }),
        headers: { 'Content-Type': 'application/json' }
    };
};
