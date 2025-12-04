// Netlify Serverless Function: Get stored AI logs
// Returns cached AI responses for transactions (immutable once stored)

const { Storage } = require('./lib/storage');

const storage = new Storage('ai-logs-data');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        if (event.httpMethod === 'GET') {
            // Get all stored logs or specific signature
            const signature = event.queryStringParameters?.signature;

            if (signature) {
                const log = await storage.get(signature);
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ log })
                };
            }

            // Return all logs (for debugging)
            const allData = await storage.get('logs') || {};
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs: allData, binId: storage.binId })
            };
        }

        // POST: Store a new log (called by ai-narrative after generation)
        const { signature, log, sentiment } = JSON.parse(event.body || '{}');

        if (!signature || !log) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing signature or log' })
            };
        }

        // Get existing logs
        let logs = await storage.get('logs') || {};

        // Check if already exists (immutable - never overwrite)
        if (logs[signature]) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Log already exists (immutable)',
                    log: logs[signature]
                })
            };
        }

        // Store new log permanently
        logs[signature] = {
            log,
            sentiment: sentiment || 'mystery',
            storedAt: new Date().toISOString()
        };

        await storage.set('logs', logs);

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: 'Log stored permanently',
                binId: storage.binId
            })
        };
    } catch (error) {
        console.error('AI logs error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
