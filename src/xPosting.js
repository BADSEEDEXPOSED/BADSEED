// src/xPosting.js
// Utility module for batching memos + AI logs into X.com (Twitter) posts.
// Handles daily quota (2 posts), deduplication, tweet length limits, and scheduling.

const X_API_URL = "/.netlify/functions/x-poster";
// Server‑side handles OAuth; env vars kept for local dev if needed
// const BEARER = process.env.REACT_APP_X_BEARER_TOKEN;
// const ACCESS_TOKEN = process.env.REACT_APP_X_ACCESS_TOKEN;
// const ACCESS_SECRET = process.env.REACT_APP_X_ACCESS_SECRET;

// ---------- API helpers for centralized queue ----------
const API_BASE = "/.netlify/functions";

const fetchQueue = async () => {
    try {
        const res = await fetch(`${API_BASE}/queue-get`);
        if (!res.ok) throw new Error(`Queue fetch failed: ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error("Failed to fetch queue:", e);
        return [];
    }
};

const addToQueue = async ({ memo, aiLog, timestamp }) => {
    const res = await fetch(`${API_BASE}/queue-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, aiLog, timestamp }),
    });
    if (!res.ok) {
        const errText = await res.text();
        console.error(`Queue add failed: ${res.status}`, errText);
        throw new Error(`Queue add failed: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    if (data.binId) {
        console.warn("🚨 SAVE THIS TO NETLIFY ENV VARS 🚨");
        console.log("QUEUE_BIN_ID=" + data.binId);
    }
    return data;
};

const removeFromQueue = async (ids) => {
    const res = await fetch(`${API_BASE}/queue-remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`Queue remove failed: ${res.status}`);
    return await res.json();
};

// ---------- localStorage helpers for daily counter ----------
const loadCounter = () => {
    const today = new Date().toISOString().slice(0, 10);
    const stored = localStorage.getItem("badseed_x_counter");
    if (!stored) return { date: today, count: 0 };
    const obj = JSON.parse(stored);
    if (obj.date !== today) return { date: today, count: 0 };
    return obj;
};
const saveCounter = (counter) => {
    localStorage.setItem("badseed_x_counter", JSON.stringify(counter));
};

// ---------- public API ----------
export async function queueMemo(memo, aiLog, timestamp) {
    // Deduplication is handled server‑side; we just forward the memo.
    try {
        await addToQueue({ memo, aiLog, timestamp });
        console.log("Memo queued via API:", memo, timestamp || "(now)");
    } catch (e) {
        console.error("Failed to queue memo:", e);
    }
}

// Manual control: Force post immediately (admin only)
export async function forcePostNow() {
    console.log("Forcing post now...");
    return await processQueue(true);
}

// Manual control: Add test item (admin only)
export function addTestItem() {
    const testMemo = "Test memo " + Date.now();
    const testAi = "Test AI response " + Date.now();
    queueMemo(testMemo, testAi);
    console.log("Test item added to queue");
}

// Manual control: Clear queue (admin only)
export async function clearQueue() {
    console.log("Clearing queue...");
    try {
        const queueItems = await fetchQueue();
        if (!queueItems.length) {
            console.log("Queue already empty.");
            return;
        }
        const ids = queueItems.map((item) => item.id);
        await removeFromQueue(ids);
        console.log("Queue cleared successfully.");
    } catch (e) {
        console.error("Failed to clear queue:", e);
    }
}

// Core posting logic
export async function processQueue(force = false) {
    const counter = loadCounter();

    if (!force && counter.count >= 2) {
        console.log("Daily quota reached (2/2). Waiting for tomorrow.");
        return { success: false, reason: "quota_reached" };
    }

    let queueItems;
    try {
        queueItems = await fetchQueue();
    } catch (e) {
        console.error("Failed to fetch queue:", e);
        return { success: false, reason: e.message };
    }

    if (!queueItems.length) {
        console.log("Queue empty. Nothing to post.");
        return { success: false, reason: "empty_queue" };
    }

    // formatTweet expects objects with {memo, aiLog}
    const tweet = formatTweet(queueItems);
    if (!tweet) return { success: false, reason: "format_error" };

    console.log("Attempting to post to X.com:", tweet);

    try {
        const response = await fetch(X_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: tweet }),
        });
        if (!response.ok) {
            throw new Error(`X API Error: ${response.status} ${await response.text()}`);
        }
        console.log("X.com post successful!");

        // Remove posted items from server queue
        const ids = queueItems.map((item) => item.id);
        await removeFromQueue(ids);

        const newCounter = { ...counter, count: counter.count + 1 };
        saveCounter(newCounter);
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
    checkAndPost();
    setInterval(() => {
        checkAndPost();
    }, 60 * 1000);
}

function checkAndPost() {
    const now = new Date();
    const hour = now.getUTCHours();
    const isWindow = hour === 0 || hour === 12;
    if (isWindow) {
        console.log("In posting window. Checking queue...");
        processQueue();
    }
}

// ---------- Queue inspection helpers ----------
export async function getQueue() {
    return await fetchQueue();
}

export function getDailyPostCount() {
    const counter = loadCounter();
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
    return now.getTime() < noon.getTime() ? noon : midnight;
}
