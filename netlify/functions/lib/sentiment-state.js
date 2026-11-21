const KEYS = ['hope', 'greed', 'fear', 'mystery'];

function percentages(sentiments = {}) {
    const total = KEYS.reduce((sum, key) => sum + Math.max(0, Number(sentiments[key]) || 0), 0);
    return KEYS.reduce((result, key) => {
        result[key] = total ? Math.round((Math.max(0, Number(sentiments[key]) || 0) / total) * 100) : 0;
        return result;
    }, {});
}

function snapshot(data) {
    data.previousPercentages = percentages(data.sentiments);
    data.previousSentiments = { ...data.sentiments };
    data.previousAt = new Date().toISOString();
}

function applyImpact(data, impact, { analyzed = true } = {}) {
    data.sentiments = { hope: 0, greed: 0, fear: 0, mystery: 0, ...(data.sentiments || {}) };
    snapshot(data);
    for (const key of KEYS) {
        const change = Number(impact?.[key]) || 0;
        data.sentiments[key] = Math.max(0, (Number(data.sentiments[key]) || 0) + change);
    }
    if (analyzed) data.totalMemos = (Number(data.totalMemos) || 0) + 1;
    data.currentPercentages = percentages(data.sentiments);
    data.lastUpdated = new Date().toISOString();
    return data;
}

function rebuildFromEvents(data, events, now = Date.now()) {
    const activeEvents = (Array.isArray(events) ? events : []).filter((event) => {
        const time = new Date(event.timestamp).getTime();
        return Number.isFinite(time) && time > now - 24 * 60 * 60 * 1000 && time <= now;
    });
    data.sentiments = { hope: 0, greed: 0, fear: 0, mystery: 0, ...(data.sentiments || {}) };
    snapshot(data);
    data.sentiments = { hope: 0, greed: 0, fear: 0, mystery: 0 };
    for (const event of activeEvents) {
        for (const key of KEYS) data.sentiments[key] += Math.max(0, Number(event.impact?.[key]) || 0);
    }
    data.totalMemos = activeEvents.length;
    data.currentPercentages = percentages(data.sentiments);
    data.lastUpdated = new Date(now).toISOString();
    return activeEvents;
}

module.exports = { KEYS, percentages, snapshot, applyImpact, rebuildFromEvents };
