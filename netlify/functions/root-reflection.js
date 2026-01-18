const { Storage } = require('./lib/storage');

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const storage = new Storage('dapp-config');
        const config = await storage.get('config') || { systemMetadata: {}, activePersona: null, meditationMode: false };

        // Activate Meditation/Reflection flag
        config.meditationMode = true;
        config.lastUpdated = new Date().toISOString();

        await storage.set('config', config);

        console.log("🧘 Root Reflection Triggered: AI Meditation Mode Activated.");

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: "success",
                message: "Meditation cycle initiated. The AI will reflect on its state in the next narrative generation.",
                meditationMode: true
            })
        };

    } catch (error) {
        console.error("Root Reflection Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
