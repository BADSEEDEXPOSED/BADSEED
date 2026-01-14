const { Storage } = require('./lib/storage');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { walletAddress, eventType = 'wallet_connect' } = JSON.parse(event.body || '{}');

        if (!walletAddress) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Wallet address required' })
            };
        }

        const storage = new Storage('analytics');
        const analyticsData = await storage.get('wallet_connections') || [];

        // Add new connection event
        const connectionEvent = {
            walletAddress,
            eventType,
            timestamp: Date.now(),
            node: 'voice',
            userAgent: event.headers['user-agent'] || 'unknown'
        };

        analyticsData.push(connectionEvent);

        // Keep only last 1000 events
        const trimmedData = analyticsData.slice(-1000);
        await storage.set('wallet_connections', trimmedData);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, tracked: connectionEvent })
        };
    } catch (e) {
        console.error('Analytics tracking error:', e);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: e.message })
        };
    }
};
