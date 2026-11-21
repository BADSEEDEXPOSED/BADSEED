const { KEYS } = require('./sentiment-state');

const LEXICON = {
    hope: [/\b(dawn|sprout|grow|growth|bloom|believe|belief|faith|together|hold|build|rise|rising|harvest|light|alive|love)\b/gi],
    greed: [/\b(moon|pump|profit|rich|wealth|100x|1000x|gain|gains|buy|lamb(o)?|cash|money|more)\b/gi],
    fear: [/\b(fear|afraid|panic|dump|rug|scam|crash|loss|die|dead|kill|abandon|bleed|fall|falling)\b/gi],
    mystery: [/\b(seed|root|soil|unknown|silence|void|secret|cipher|shadow|ritual|reveal|whisper|dark|night)\b/gi]
};

function emptyImpact() { return { hope: 0, greed: 0, fear: 0, mystery: 0 }; }

function add(target, effect, value) {
    if (KEYS.includes(effect) && Number.isFinite(value)) target[effect] += value;
}

function matchedCount(text, patterns) {
    return patterns.reduce((count, pattern) => count + (text.match(pattern) || []).length, 0);
}

function applyRules(impact, rules, transaction, aiSentiment) {
    const memo = String(transaction.memo || '').toLowerCase();
    const amount = Math.abs(Number(transaction.amount) || 0);
    const direction = String(transaction.direction || '').toLowerCase();
    for (const rule of Array.isArray(rules) ? rules : []) {
        const condition = String(rule.condition || '');
        let matches = false;
        if (condition === 'direction:in') matches = direction === 'in';
        else if (condition === 'direction:out') matches = direction === 'out';
        else if (condition === 'memo:none') matches = !memo;
        else if (condition === 'memo:exists') matches = !!memo;
        else if (condition === 'ai:mystery') matches = aiSentiment === 'mystery';
        else if (condition.startsWith('memo:')) matches = memo.includes(condition.slice(5).toLowerCase());
        else if (condition.startsWith('memo_regex:')) {
            try { matches = new RegExp(condition.slice(11), 'i').test(memo); } catch { matches = false; }
        } else if (condition.startsWith('amount_gt:')) matches = amount > Number(condition.slice(10));
        else if (condition.startsWith('amount_lt:')) matches = amount < Number(condition.slice(10));
        if (matches) add(impact, rule.effect, Number(rule.value) || 0);
    }
}

function calculateImpact(transaction, aiSentiment = 'mystery', rules = []) {
    const impact = emptyImpact();
    const memo = String(transaction.memo || '').toLowerCase();
    const amount = Math.abs(Number(transaction.amount) || 0);
    const direction = String(transaction.direction || '').toLowerCase();

    // The AI supplies a reading of meaning; literal language can refine it but
    // cannot overwhelm it with repeated keyword stuffing.
    add(impact, aiSentiment, memo ? 2 : 0);
    if (memo) {
        for (const [sentiment, patterns] of Object.entries(LEXICON)) {
            add(impact, sentiment, Math.min(2, matchedCount(memo, patterns)));
        }
    } else {
        add(impact, 'mystery', 1);
    }

    // Value and direction are public behaviour signals, with large movements
    // carrying more weight while avoiding a single transfer dominating a day.
    const scale = amount >= 1 ? 2 : amount >= 0.1 ? 1 : 0;
    if (direction === 'in') add(impact, 'hope', 1 + scale);
    if (direction === 'out') {
        add(impact, 'greed', 1 + scale);
        add(impact, 'fear', scale);
    }

    applyRules(impact, rules, transaction, aiSentiment);
    for (const key of KEYS) impact[key] = Math.max(0, impact[key]);
    return impact;
}

function mergeImpact(target, impact) {
    for (const key of KEYS) target[key] = (target[key] || 0) + (impact[key] || 0);
    return target;
}

module.exports = { calculateImpact, mergeImpact };
