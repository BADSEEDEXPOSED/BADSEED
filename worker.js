import * as aiLogsGet from './netlify/functions/ai-logs-get.js';
import * as aiNarrative from './netlify/functions/ai-narrative.js';
import * as analyticsGet from './netlify/functions/analytics-get.js';
import * as analyticsTrack from './netlify/functions/analytics-track.js';
import * as archiveDaily from './netlify/functions/archive-daily.js';
import * as archiveGet from './netlify/functions/archive-get.js';
import * as cloudQueuePoller from './netlify/functions/cloud-queue-poller.js';
import * as configGet from './netlify/functions/config-get.js';
import * as configSet from './netlify/functions/config-set.js';
import * as dailyReset from './netlify/functions/daily-reset.js';
import * as dappConfig from './netlify/functions/dapp-config.js';
import * as debugEnv from './netlify/functions/debug-env.js';
import * as heartbeatGet from './netlify/functions/heartbeat-get.js';
import * as jupiterProxy from './netlify/functions/jupiter-proxy.js';
import * as manualTriggerArchive from './netlify/functions/manual-trigger-archive.js';
import * as manualTriggerProphecy from './netlify/functions/manual-trigger-prophecy.js';
import * as prophecyBlurFix from './netlify/functions/prophecy-blur-fix.js';
import * as prophecyGenerate from './netlify/functions/prophecy-generate.js';
import * as prophecyGet from './netlify/functions/prophecy-get.js';
import * as prophecyReveal from './netlify/functions/prophecy-reveal.js';
import * as prophecySet from './netlify/functions/prophecy-set.js';
import * as queueAddTest from './netlify/functions/queue-add-test.js';
import * as queueAdd from './netlify/functions/queue-add.js';
import * as queueClear from './netlify/functions/queue-clear.js';
import * as queueForce from './netlify/functions/queue-force.js';
import * as queueGet from './netlify/functions/queue-get.js';
import * as queueProcessor from './netlify/functions/queue-processor.js';
import * as queueRemove from './netlify/functions/queue-remove.js';
import * as queueStatus from './netlify/functions/queue-status.js';
import * as queueToggle from './netlify/functions/queue-toggle.js';
import * as rootReflection from './netlify/functions/root-reflection.js';
import * as sentimentGet from './netlify/functions/sentiment-get.js';
import * as sentimentInject from './netlify/functions/sentiment-inject.js';
import * as sentimentUpdate from './netlify/functions/sentiment-update.js';
import * as transmissionLogClear from './netlify/functions/transmission-log-clear.js';
import * as transmissionLogGet from './netlify/functions/transmission-log-get.js';
import * as walletStatus from './netlify/functions/wallet-status.js';
import * as xPoster from './netlify/functions/x-poster.js';

const TOKEN_ORIGIN = 'https://token.badseed.exposed';

const ROUTES = {
  'ai-logs-get': aiLogsGet,
  'ai-narrative': aiNarrative,
  'analytics-get': analyticsGet,
  'analytics-track': analyticsTrack,
  'archive-daily': archiveDaily,
  'archive-get': archiveGet,
  'cloud-queue-poller': cloudQueuePoller,
  'config-get': configGet,
  'config-set': configSet,
  'daily-reset': dailyReset,
  'dapp-config': dappConfig,
  'debug-env': debugEnv,
  'heartbeat-get': heartbeatGet,
  'jupiter-proxy': jupiterProxy,
  'manual-trigger-archive': manualTriggerArchive,
  'manual-trigger-prophecy': manualTriggerProphecy,
  'prophecy-blur-fix': prophecyBlurFix,
  'prophecy-generate': prophecyGenerate,
  'prophecy-get': prophecyGet,
  'prophecy-reveal': prophecyReveal,
  'prophecy-set': prophecySet,
  'queue-add-test': queueAddTest,
  'queue-add': queueAdd,
  'queue-clear': queueClear,
  'queue-force': queueForce,
  'queue-get': queueGet,
  'queue-processor': queueProcessor,
  'queue-remove': queueRemove,
  'queue-status': queueStatus,
  'queue-toggle': queueToggle,
  'root-reflection': rootReflection,
  'sentiment-get': sentimentGet,
  'sentiment-inject': sentimentInject,
  'sentiment-update': sentimentUpdate,
  'transmission-log-clear': transmissionLogClear,
  'transmission-log-get': transmissionLogGet,
  'wallet-status': walletStatus,
  'x-poster': xPoster,
};

function syncEnv(env) {
  if (typeof process !== 'undefined' && process.env && env) {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string') process.env[k] = v;
    }
  }
}

async function invokeNetlifyHandler(mod, request, env) {
  syncEnv(env);
  const fn = mod?.handler || mod?.default?.handler || mod?.default;
  if (typeof fn !== 'function') {
    return new Response(JSON.stringify({ error: 'Handler not found' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const queryStringParameters = {};
  url.searchParams.forEach((v, k) => { queryStringParameters[k] = v; });
  const body = request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined;

  const event = {
    httpMethod: request.method,
    path: url.pathname,
    rawUrl: request.url,
    rawQuery: url.search.replace(/^\?/, ''),
    headers,
    queryStringParameters,
    body,
    isBase64Encoded: false,
  };

  const result = await fn(event, {});
  if (result instanceof Response) return result;
  const outHeaders = new Headers();
  if (result?.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      if (v !== undefined && v !== null) outHeaders.set(k, String(v));
    }
  }
  return new Response(result?.body ?? '', {
    status: result?.statusCode || 200,
    headers: outHeaders,
  });
}

async function proxyToToken(request, env, targetPath) {
  const url = new URL(request.url);
  const dest = `${TOKEN_ORIGIN}${targetPath}${url.search}`;
  const reqHeaders = new Headers(request.headers);
  reqHeaders.delete('host');
  const proxiedReq = new Request(dest, {
    method: request.method,
    headers: reqHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'follow',
  });
  return env.TOKEN_WORKER ? env.TOKEN_WORKER.fetch(proxiedReq) : fetch(proxiedReq);
}

export default {
  async fetch(request, env) {
    syncEnv(env);
    const url = new URL(request.url);
    const p = url.pathname;

    // Reverse proxy routes for public token dashboard (/live, /live/*, /live-api/*, /assets/*)
    if (p === '/live' || p === '/live/') {
      return proxyToToken(request, env, '/');
    }
    if (p.startsWith('/live/')) {
      return proxyToToken(request, env, p.slice('/live'.length));
    }
    if (p.startsWith('/live-api/')) {
      return proxyToToken(request, env, '/.netlify/functions/' + p.slice('/live-api/'.length));
    }
    if (p.startsWith('/assets/')) {
      return proxyToToken(request, env, p);
    }
    if (p === '/badseed.gif') {
      return proxyToToken(request, env, '/badseed.gif');
    }

    // Serverless functions (preserving /.netlify/functions/* paths for full compatibility)
    if (p.startsWith('/.netlify/functions/')) {
      const name = p.slice('/.netlify/functions/'.length).split('/')[0];
      if (ROUTES[name]) {
        return invokeNetlifyHandler(ROUTES[name], request, env);
      }
      return new Response(JSON.stringify({ error: `Unknown function: ${name}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    syncEnv(env);
    const now = new Date(event.scheduledTime || Date.now());
    const minute = now.getUTCMinutes();
    const hour = now.getUTCHours();

    const runLocal = (name) => invokeNetlifyHandler(
      ROUTES[name],
      new Request(`https://badseed.exposed/.netlify/functions/${name}`, { method: 'POST' }),
      env
    ).catch((err) => console.error(`[cron] ${name} failed:`, err));

    const tasks = [
      // Every 1 minute: Value Node AMM poller
      fetch(`${TOKEN_ORIGIN}/.netlify/functions/amm-poller`).catch((err) => console.error('[cron] amm-poller failed:', err)),
    ];

    // Every 10 minutes: Cloud queue poller + Brain Cycle
    if (minute % 10 === 0) {
      tasks.push(runLocal('cloud-queue-poller'));
      tasks.push(fetch('https://mcp.badseed.exposed/.netlify/functions/brain-cycle').catch((err) => console.error('[cron] brain-cycle failed:', err)));
    }

    // 00:00 UTC: Prophecy generate, daily reset, queue processor
    if (hour === 0 && minute === 0) {
      tasks.push(runLocal('prophecy-generate'), runLocal('daily-reset'), runLocal('queue-processor'));
    }

    // 00:10 & 18:10 UTC: Guardian redundancy check
    if ((hour === 0 || hour === 18) && minute === 10) {
      tasks.push(fetch(`${TOKEN_ORIGIN}/.netlify/functions/guardian`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_run: now.toISOString() }),
      }).catch((err) => console.error('[cron] guardian failed:', err)));
    }

    // 12:00 UTC: Queue processor
    if (hour === 12 && minute === 0) {
      tasks.push(runLocal('queue-processor'));
    }

    // 18:00 UTC and every 10 minutes thereafter until posted: Prophecy reveal (idempotent auto-retry)
    if (hour >= 18 && minute % 10 === 0) {
      tasks.push(runLocal('prophecy-reveal'));
    }

    // 23:55 UTC daily Arweave archive runs via GitHub Actions (.github/workflows/daily-arweave-archive.yml)
    // using real Node.js + @irys/sdk against https://uploader.irys.xyz.

    ctx.waitUntil(Promise.allSettled(tasks));
  },
};
