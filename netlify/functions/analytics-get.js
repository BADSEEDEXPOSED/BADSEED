const { Storage } = require('./lib/storage');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    try {
        const storage = new Storage('analytics');
        const walletConnections = await storage.get('wallet_connections') || [];

        // Get unique wallets and their connection counts
        const walletStats = {};
        walletConnections.forEach(event => {
            if (!walletStats[event.walletAddress]) {
                walletStats[event.walletAddress] = {
                    address: event.walletAddress,
                    connections: 0,
                    firstSeen: event.timestamp,
                    lastSeen: event.timestamp
                };
            }
            walletStats[event.walletAddress].connections++;
            walletStats[event.walletAddress].lastSeen = Math.max(
                walletStats[event.walletAddress].lastSeen,
                event.timestamp
            );
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                totalEvents: walletConnections.length,
                uniqueWallets: Object.keys(walletStats).length,
                recentEvents: walletConnections.slice(-50),
                walletStats: Object.values(walletStats)
            })
        };
    } catch (e) {
        console.error('Analytics get error:', e);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: e.message })
        };
    }
};
