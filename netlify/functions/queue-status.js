const { Storage } = require('./lib/storage');
exports.handler = async () => {
  const queue = new Storage('queue-data');
  const logs = await new Storage('transmission-log').get('logs') || [];
  const today = new Date().toISOString().slice(0, 10);
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({
    postsToday: logs.filter(item => item.date?.startsWith(today) && /DIGEST|FORCE/.test(item.type)).length,
    processor: await queue.get('processor-status'), heartbeat: await queue.get('last-heartbeat')
  }) };
};
