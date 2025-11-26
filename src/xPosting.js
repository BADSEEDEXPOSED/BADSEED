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
    if (posted.has(hash)) {
        console.log("Memo already posted, skipping queue:", memo);
        return;
    }

    const queue = load(QUEUE_KEY) || [];
    // Check if already in queue
    if (queue.some(item => item.hash === hash)) {
        console.log("Memo already in queue, skipping:", memo);
        return;
    }

    queue.push({ memo, aiLog, hash, timestamp: Date.now() });
    save(QUEUE_KEY, queue);
    console.log("Memo queued:", memo);

    // Check if we should post immediately (e.g. if we missed a window)
    checkAndPost();
}

// Manual control: Force post immediately
export async function forcePostNow() {
    console.log("Forcing post now...");
    return await processQueue(true); // true = ignore quota/schedule
}

// Manual control: Add test item
export function addTestItem() {
    const testMemo = "Test memo " + Date.now();
    const testAi = "Test AI response " + Date.now();
    queueMemo(testMemo, testAi);
    console.log("Test item added to queue");
}

// Core posting logic
export async function processQueue(force = false) {
    const today = new Date().toISOString().slice(0, 10);
    let counter = load(COUNTER_KEY) || { date: today, count: 0 };

    // Reset counter if new day
    if (counter.date !== today) {
        counter = { date: today, count: 0 };
        save(COUNTER_KEY, counter);
    }

    if (!force && counter.count >= 2) {
        console.log("Daily quota reached (2/2). Waiting for tomorrow.");
        return { success: false, reason: "quota_reached" };
    }

    const queue = load(QUEUE_KEY) || [];
    if (!queue.length) {
        console.log("Queue empty. Nothing to post.");
        return { success: false, reason: "empty_queue" };
    }

    const tweet = formatTweet(queue);
    if (!tweet) return { success: false, reason: "format_error" };

    console.log("Attempting to post to X.com:", tweet);

    try {
        const response = await fetch(X_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${BEARER}`,
                "X-Access-Token": ACCESS_TOKEN,
                "X-Access-Secret": ACCESS_SECRET,
            },
            body: JSON.stringify({ text: tweet }),
        });

        if (!response.ok) {
            throw new Error(`X API Error: ${response.status} ${await response.text()}`);
        }

        console.log("X.com post successful!");

        // Success -> update posted set & clear queue
        const posted = new Set(load(POSTED_KEY) || []);
        queue.forEach((i) => posted.add(i.hash));
        save(POSTED_KEY, Array.from(posted));
        save(QUEUE_KEY, []); // Clear queue after successful post

        counter.count += 1;
        save(COUNTER_KEY, counter);

        return { success: true };
    } catch (e) {
        console.error("X.com post failed:", e);
        return { success: false, reason: e.message };
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

// Robust scheduling: Check on load + interval
export function scheduleDailyPosts() {
    console.log("Initializing X.com scheduler...");

    // Check immediately on load
    checkAndPost();

    // Check every minute
    setInterval(() => {
        checkAndPost();
    }, 60 * 1000);
}

function checkAndPost() {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    // Schedule: UTC Midnight (00:00) and Noon (12:00)
    // We check if we are in the target window (e.g. 00:00-00:59 or 12:00-12:59)
    // AND if we haven't posted enough for today yet.

    // Simplified logic: If queue has items AND quota not reached AND it's past a deadline, try to post.
    // Actually, let's stick to the specific windows to avoid spamming if something goes wrong.
    // Window: 00:xx or 12:xx UTC

    const isWindow = (currentHour === 0 || currentHour === 12);

    if (isWindow) {
        console.log("In posting window. Checking queue...");
        processQueue();
    } else {
        // console.log("Not in posting window. Next window at 00:00 or 12:00 UTC.");
    }
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

    // If we haven't passed noon yet today
    if (now.getTime() < noon.getTime()) {
        return noon;
    }
    // If we passed noon, next is midnight (tomorrow)
    else {
        return midnight;
    }
}
