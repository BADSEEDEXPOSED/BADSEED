// Scheduled Function: Generate Daily Prophecy
// Runs at 12:00 UTC daily - generates prophecy based on morning sentiment

const { generateProphecy } = require('./lib/prophecy-logic');

exports.handler = async (event, context) => {
    console.log('[Prophecy Generate] Running at', new Date().toISOString());

    try {
        const result = await generateProphecy(false); // force = false

        if (result.skipped) {
            return { statusCode: 200, body: JSON.stringify({ message: result.message }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                dominant: result.dominant,
                prophecy: result.prophecy.text.substring(0, 50) + '...'
            })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

exports.config = {
    schedule: "0 12 * * *"  // 12:00 UTC daily
};
