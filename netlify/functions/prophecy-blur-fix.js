
const { Storage } = require('./lib/storage');

const storage = new Storage('sentiment-data');

exports.handler = async (event, context) => {
    try {
        console.log('[Blur Fix] Starting...');
        let data = await storage.get('data');

        if (!data || !data.prophecy) {
            return { statusCode: 404, body: "No prophecy found" };
        }

        console.log('[Blur Fix] Current State:', JSON.stringify(data.prophecy));

        // FORCE FALSE
        data.prophecy.ready = false;
        // Also clear any force flags just in case
        delete data.prophecy.forced_ready;

        await storage.set('data', data);

        console.log('[Blur Fix] FIXED. New State:', JSON.stringify(data.prophecy));

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: "Prophecy forced to BLURRED (ready: false)",
                prophecy: data.prophecy
            })
        };
    } catch (error) {
        return { statusCode: 500, body: error.message };
    }
};
