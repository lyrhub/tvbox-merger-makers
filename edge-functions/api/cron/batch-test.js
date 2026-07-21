/**
 * 定时任务入口 - 每15分钟由 schedules 触发
 * 分批测试站点连通性，结果存入 Blob
 */

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/oktv.json',
  'https://raw.githubusercontent.com/qist/tvbox/refs/heads/master/jsm.json',
  'https://raw.githubusercontent.com/gaotianliuyun/gao/master/js.json',
  'https://raw.liucn.cc/box/m.json'
];

const BATCH_SIZE = 20;

function isUrl(str) { return str && (str.startsWith('http://') || str.startsWith('https://')); }

async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Merger/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  return JSON.parse(text.replace(/^\uFEFF/, '').replace(/^\s*\/\/.*$/gm, '').trim());
}

async function testSiteUrl(url) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'TVBox-Merger/1.0' }, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    if (res.ok) return { status: 'ok', latency, http_code: res.status };
    return { status: 'http_error', latency, http_code: res.status };
  } catch (e) {
    return { status: e.name === 'AbortError' ? 'timeout' : 'network_error', latency: Date.now() - start, error: e.message?.substring(0, 60) };
  }
}

function extractTestUrl(site) {
  if (site.api && isUrl(site.api) && !site.api.includes('drpy')) return site.api;
  if (site.ext && typeof site.ext === 'string' && isUrl(site.ext)) return site.ext;
  if (site.ext && typeof site.ext === 'object') {
    if (site.ext.siteUrl && isUrl(site.ext.siteUrl)) return site.ext.siteUrl;
    if (Array.isArray(site.ext.site) && site.ext.site.length > 0 && isUrl(site.ext.site[0])) return site.ext.site[0];
  }
  return '';
}

export async function onRequest({ request }) {
  console.log('[cron] batch-test triggered');
  try {
    const { getStore } = await import("@edgeone/pages-blob");
    const store = getStore("tvbox-data");

    // 拉取源
    const fetchResults = await Promise.allSettled(SOURCES.map(u => fetchSource(u)));
    const configs = [];
    fetchResults.forEach((r) => { if (r.status === 'fulfilled' && r.value) configs.push(r.value); });

    if (configs.length === 0) {
      console.error('[cron] all sources failed');
      return new Response(JSON.stringify({ error: 'all sources failed' }), { status: 502 });
    }

    console.log(`[cron] fetched ${configs.length} sources`);

    // 合并站点
    const allSites = [];
    const seenKeys = new Set();
    for (const config of configs) {
      if (Array.isArray(config.sites)) {
        for (const site of config.sites) {
          const key = site.key || site.name;
          if (!key || seenKeys.has(key)) continue;
          seenKeys.add(key);
          allSites.push(site);
        }
      }
    }

    // 读取已有结果和 meta
    let allResults = {};
    let meta = { batchIndex: 0 };
    try {
      const raw = await store.get('site_results.json');
      if (raw) allResults = JSON.parse(raw);
    } catch (e) { console.log('[cron] no existing results'); }
    try {
      const raw = await store.get('meta.json');
      if (raw) meta = JSON.parse(raw);
    } catch (e) {}

    // 构建测试任务
    const tasks = [];
    for (const site of allSites) {
      const url = extractTestUrl(site);
      if (url) tasks.push({ key: site.key || site.name, name: site.name, testUrl: url });
    }

    const totalBatches = Math.ceil(tasks.length / BATCH_SIZE) || 1;
    const currentBatch = (meta.batchIndex || 0) % totalBatches;
    const batch = tasks.slice(currentBatch * BATCH_SIZE, (currentBatch + 1) * BATCH_SIZE);

    console.log(`[cron] testing batch ${currentBatch + 1}/${totalBatches}, ${batch.length} tasks`);

    // 并发测试
    const testResults = await Promise.allSettled(batch.map(t => testSiteUrl(t.testUrl)));
    const now = new Date().toISOString();

    batch.forEach((task, i) => {
      const result = testResults[i].status === 'fulfilled' ? testResults[i].value : { status: 'error' };
      allResults[task.key] = { ...result, tested_at: now, name: task.name, testUrl: task.testUrl };
    });

    // 更新 meta
    meta.batchIndex = (meta.batchIndex || 0) + 1;
    meta.lastRun = { batch: currentBatch + 1, totalBatches, tested: batch.length, total: tasks.length, time: now };

    // 写入 Blob
    await store.set('site_results.json', JSON.stringify(allResults));
    await store.set('meta.json', JSON.stringify(meta));

    // 记录运行历史（保留最近 20 条）
    let history = [];
    try {
      const raw = await store.get('run_history.json');
      if (raw) history = JSON.parse(raw);
    } catch (e) {}
    
    const runLog = {
      time: now,
      batch: currentBatch + 1,
      totalBatches,
      tested: batch.length,
      totalTasks: tasks.length,
      totalResults: Object.keys(allResults).length,
      aliveCount,
      sources: configs.length
    };
    history.unshift(runLog);
    if (history.length > 20) history = history.slice(0, 20);
    await store.set('run_history.json', JSON.stringify(history));

    console.log(`[cron] done. batch ${currentBatch + 1}/${totalBatches}, alive: ${aliveCount}/${Object.keys(allResults).length}`);

    return new Response(JSON.stringify({
      success: true,
      batch: currentBatch + 1,
      totalBatches,
      tested: batch.length,
      totalTasks: tasks.length,
      totalResults: Object.keys(allResults).length,
      aliveCount
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[cron] error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
