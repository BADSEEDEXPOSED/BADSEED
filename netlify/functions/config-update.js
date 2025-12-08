const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: HEADERS, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { targetMint, destinationWallet, isSweepEnabled } = body;

        // Validate simple inputs
        if (!targetMint || !destinationWallet) {
            return { statusCode: 400, headers: HEADERS, body: 'Missing required fields' };
        }

        // Save to Redis Hash
        await redis.hset('sacrifice_config', {
            targetMint,
            destinationWallet,
            isSweepEnabled: String(isSweepEnabled)
        });

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify({ success: true, config: { targetMint, destinationWallet, isSweepEnabled } }),
        };

    } catch (error) {
        console.error('Error updating config:', error);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: 'Failed to update config' }),
        };
    }
};
