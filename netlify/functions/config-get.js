const { Redis } = require('@upstash/redis');

// Initialize Redis
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
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: HEADERS, body: '' };
    }

    try {
        // Fetch config hash
        const config = await redis.hgetall('sacrifice_config');

        // Defaults if empty
        const defaultConfig = {
            targetMint: "3HPpMLK7LjKFqSnCsBYNiijhNTo7dkkx3FCSAHKSpump",
            destinationWallet: "CZ7Lv3QNVxbBivGPBhJG7m1HpCtfEDjEusBjjZ3qmVz5",
            isSweepEnabled: true // Stored as string "true"/"false" in Redis usually, but hgetall parses JSON if we store it right? No, standard strings.
        };

        const finalConfig = {
            targetMint: config?.targetMint || defaultConfig.targetMint,
            destinationWallet: config?.destinationWallet || defaultConfig.destinationWallet,
            isSweepEnabled: config?.isSweepEnabled === undefined ? defaultConfig.isSweepEnabled : (config.isSweepEnabled === 'true' || config.isSweepEnabled === true)
        };

        return {
            statusCode: 200,
            headers: HEADERS,
            body: JSON.stringify(finalConfig),
        };

    } catch (error) {
        console.error('Error fetching config:', error);
        return {
            statusCode: 500,
            headers: HEADERS,
            body: JSON.stringify({ error: 'Failed to fetch config' }),
        };
    }
};
