// src/xPosting.js
// Utility module for batching memos + AI logs into X.com (Twitter) posts.
// Handles daily quota (2 posts), deduplication, tweet length limits, and scheduling.

import sha256 from "js-sha256";

const X_API_URL = process.env.REACT_APP_X_API_URL || "https://api.x.com/2/tweets";
const BEARER = process.env.REACT_APP_X_BEARER_TOKEN;
const ACCESS_TOKEN = process.env.REACT_APP_X_ACCESS_TOKEN;
const ACCESS_SECRET = process.env.REACT_APP_X_ACCESS_SECRET;

const QUEUE_KEY = "badseed_x_queue";
const COUNTER_KEY = "badseed_x_counter";
const POSTED_KEY = "badseed_x_posted";

// ---------- localStorage helpers ----------
const load = (key) => {
    try {
        return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
        return null;
    }
};
const save = (key, val) => {
    try {
        localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
        console.warn("Failed to persist", key, e);
    }
};

// ---------- public API ----------
export function queueMemo(memo, aiLog) {
    const hash = sha256(memo);
    const posted = new Set(load(POSTED_KEY) || []);
    if (posted.has(hash)) return; // already posted, ignore

    const queue = load(QUEUE_KEY) || [];
    queue.push({ memo, aiLog, hash, timestamp: Date.now() });
    save(QUEUE_KEY, queue);
}

export async function processQueue() {
    const today = new Date().toISOString().slice(0, 10);
    let counter = load(COUNTER_KEY) || { date: today, count: 0 };
    if (counter.date !== today) {
        counter = { date: today, count: 0 };
    }
    if (counter.count >= 2) return; // quota reached

    const queue = load(QUEUE_KEY) || [];
    if (!queue.length) return;

    const tweet = formatTweet(queue);
    if (!tweet) return;

    try {
        await fetch(X_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${BEARER}`,
                "X-Access-Token": ACCESS_TOKEN,
                "X-Access-Secret": ACCESS_SECRET,
            },
            body: JSON.stringify({ text: tweet }),
        });
        // success → update posted set & clear queue
        const posted = new Set(load(POSTED_KEY) || []);
        queue.forEach((i) => posted.add(i.hash));
        save(POSTED_KEY, Array.from(posted));
        save(QUEUE_KEY, []);
        counter.count += 1;
        save(COUNTER_KEY, counter);
    } catch (e) {
        console.warn("X.com post failed:", e);
    }
}

function formatTweet(items) {
    const maxLen = 280;
    const header = "🌱 BADSEED TRANSMISSION LOG 🌱\n\n";
    let body = "";

    for (const { memo, aiLog } of items) {
        const line = `📨 "${memo}"\n→ ${aiLog}\n\n`;
        const remaining = maxLen - header.length - body.length;
        if (remaining <= 0) break;

        if (line.length > remaining) {
            // Truncate gracefully
            const truncated = line.slice(0, remaining - 2) + "…";
            body += truncated;
            break;
        }
        body += line;
    }

    return (header + body).slice(0, maxLen);
}

export function scheduleDailyPosts() {
    const now = Date.now();
    const nextMidnight = new Date();
    nextMidnight.setUTCHours(0, 0, 0, 0);
    if (now >= nextMidnight) nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
    const nextNoon = new Date(nextMidnight);
    nextNoon.setUTCHours(12, 0, 0, 0);

    const schedule = (time) => {
        const delay = time - Date.now();
        setTimeout(() => {
            processQueue().then(() => schedule(time + 12 * 60 * 60 * 1000));
        }, delay);
    };
    schedule(nextMidnight);
    schedule(nextNoon);
}

// ---------- Queue inspection helpers ----------
export function getQueue() {
    return load(QUEUE_KEY) || [];
}

export function getDailyPostCount() {
    const today = new Date().toISOString().slice(0, 10);
    let counter = load(COUNTER_KEY) || { date: today, count: 0 };
    if (counter.date !== today) {
        return 0;
    }
    return counter.count;
}

export function getNextPostTime() {
    const now = new Date();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const midnight = new Date(today);
    midnight.setUTCDate(midnight.getUTCDate() + 1);

    const noon = new Date(today);
    noon.setUTCHours(12, 0, 0, 0);

    if (now.getTime() < noon.getTime()) {
        return noon;
    } else {
        return midnight;
    }
}
