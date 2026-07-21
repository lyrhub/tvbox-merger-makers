/**
 * 定时任务入口 - 每15分钟由 edgeone.json schedules 触发
 * 分批测试站点连通性，结果存入 KV
 */
import { fetchSource, mergeConfigs } from '../../../lib/merge.js';
import { testSiteUrl } from '../../../lib/test.js';
import { SOURCES } from '../../../lib/config.js';

const BATCH_SIZE = 20;

function isUrl(str) {
  return str && (str.startsWith('http://') || str.startsWith('https://'));
}

function resolveRelative(path, baseUrl) {
  if (!path || !baseUrl) return '';
  if (isUrl(path)) return path;
  if (!path.startsWith('./') && !path.startsWith('../')) return '';
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  let resolved = path.startsWith('./') ? path.substring(2) : path;
  return baseDir + resolved;
}

function extractTestUrl(site) {
  const baseUrl = site._baseUrl || '';
  if (site.api && isUrl(site.api) && !site.api.includes('drpy')) return { url: site.api, source: 'api' };
  if (site.api && site.api.startsWith('./') && baseUrl && !site.api.includes('drpy')) {
    const resolved = resolveRelative(site.api, baseUrl);
    if (resolved) return { url: resolved, source: 'api' };
  }
  if (site.ext && typeof site.ext === 'string') {
    if (isUrl(site.ext)) return { url: site.ext, source: 'ext' };
    if (site.ext.startsWith('./') && baseUrl) {
      const resolved = resolveRelative(site.ext.split('\n')[0], baseUrl);
      if (resolved) return { url: resolved, source: 'ext' };
    }
    const urlMatch = site.ext.match(/https?:\/\/[^\s$]+/);
    if (urlMatch) return { url: urlMatch[0].replace(/\$+$/, '').replace(/\/$/, ''), source: 'ext' };
  }
  if (site.ext && typeof site.ext === 'object') {
    if (site.ext.siteUrl && isUrl(site.ext.siteUrl)) return { url: site.ext.siteUrl, source: 'ext.siteUrl' };
    if (Array.isArray(site.ext.site) && site.ext.site.length > 0 && isUrl(site.ext.site[0])) return { url: site.ext.site[0], source: 'ext.site[]' };
  }
  return { url: '', source: '' };
}

function extractAllTestUrls(site) {
  if (site.ext && typeof site.ext === 'object' && Array.isArray(site.ext.site)) {
    const urls = site.ext.site.filter(u => isUrl(u));
    if (urls.length > 0) return { urls, source: 'ext.site[]', format: 'array' };
  }
  if (site.ext && typeof site.ext === 'string' && site.ext.includes(',')) {
    const parts = site.ext.split(',').map(s => s.trim()).filter(u => isUrl(u));
    if (parts.length > 1) return { urls: parts, source: 'ext(comma)', format: 'comma' };
  }
  const { url, source } = extractTestUrl(site);
  if (url) return { urls: [url], source, format: 'single' };
  return { urls: [], source: '', format: '' };
}

export async function onRequest({ request }) {
  const sources = SOURCES;
  const fetchResults = await Promise.allSettled(sources.map(u => fetchSource(u)));
  const configs = [], configSources = [];
  fetchResults.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) { configs.push(r.value); configSources.push(sources[i]); }
  });
  if (configs.length === 0) {
    return new Response(JSON.stringify({ error: 'all sources failed' }), { status: 502 });
  }

  const merged = mergeConfigs(configs, configSources);
  const sites = merged.sites || [];

  // 读取 KV
  let allResults = {};
  let multiResults = {};
  let spiderResults = {};
  let meta = { batchIndex: 0 };
  let prevLiveResults = null;
  let prevParseResults = null;

  try { const v = await my_kv.get('site_results', { type: 'json' }); if (v) allResults = v; } catch (e) {}
  try { const v = await my_kv.get('multi_url_results', { type: 'json' }); if (v) multiResults = v; } catch (e) {}
  try {
    const extra = await my_kv.get('extra_results', { type: 'json' });
    if (extra) {
      if (extra.spiderResults) spiderResults = extra.spiderResults;
      if (extra.liveResults) prevLiveResults = extra.liveResults;
      if (extra.parseResults) prevParseResults = extra.parseResults;
    }
  } catch (e) {}
  try { const v = await my_kv.get('meta', { type: 'json' }); if (v) meta = v; } catch (e) {}

  // Spider 测试
  const spiders = merged._spiders || [];
  if (spiders.length > 0) {
    const spiderTests = await Promise.allSettled(spiders.map(s => testSiteUrl(s.split(';')[0])));
    const now = new Date().toISOString();
    spiders.forEach((spider, i) => {
      const result = spiderTests[i].status === 'fulfilled' ? spiderTests[i].value : { status: 'error' };
      spiderResults[spider] = { ...result, tested_at: now, url: spider.split(';')[0] };
      allResults['__spider_' + i + '__'] = { ...result, tested_at: now, name: '🕷 Spider ' + i, type: 'jar', testUrl: spider.split(';')[0] };
    });
  }

  // 站点批量测试
  const batchIndex = meta.batchIndex || 0;
  const tasks = [];
  const noUrlSites = [];

  for (const site of sites) {
    const { urls, source, format } = extractAllTestUrls(site);
    if (urls.length === 0) {
      noUrlSites.push(site);
    } else if (urls.length === 1) {
      tasks.push({ key: site.key, name: site.name, type: site.type, api: site.api, testUrl: urls[0], urlSource: source, isMulti: false, sourceName: site._source || '' });
    } else {
      for (const url of urls) {
        tasks.push({ key: site.key, name: site.name, type: site.type, api: site.api, testUrl: url, urlSource: source, isMulti: true, format, sourceName: site._source || '' });
      }
    }
  }

  const totalBatches = Math.ceil(tasks.length / BATCH_SIZE) || 1;
  const currentBatch = batchIndex % totalBatches;
  const start = currentBatch * BATCH_SIZE;
  const batch = tasks.slice(start, start + BATCH_SIZE);

  const testResults = await Promise.allSettled(batch.map(t => testSiteUrl(t.testUrl)));
  const now = new Date().toISOString();

  batch.forEach((task, i) => {
    const result = testResults[i].status === 'fulfilled' ? testResults[i].value : { status: 'error' };
    if (task.isMulti) {
      if (!multiResults[task.key]) multiResults[task.key] = { name: task.name, format: task.format, urls: {} };
      multiResults[task.key].urls[task.testUrl] = { ...result, tested_at: now };
      const urlStatuses = Object.values(multiResults[task.key].urls);
      const hasOk = urlStatuses.some(u => u.status === 'ok');
      allResults[task.key] = { status: hasOk ? 'ok' : result.status, latency: result.latency, tested_at: now, name: task.name, sourceName: task.sourceName, isMulti: true, totalUrls: Object.keys(multiResults[task.key].urls).length, aliveUrls: urlStatuses.filter(u => u.status === 'ok').length };
    } else {
      allResults[task.key] = { ...result, tested_at: now, name: task.name, testUrl: task.testUrl, urlSource: task.urlSource, sourceName: task.sourceName };
    }
  });

  noUrlSites.forEach(site => {
    const key = site.key || site.name;
    if (!allResults[key]) {
      allResults[key] = { status: 'skip', reason: '无可测试URL', tested_at: now, name: site.name, sourceName: site._source || '' };
    }
  });

  // 测试 lives 和 parses（交替执行）
  let liveReport = prevLiveResults;
  let parseReport = prevParseResults;

  if (currentBatch % 2 === 0) {
    const lives = (merged.lives || []).filter(l => l.url && isUrl(l.url)).slice(0, 10);
    if (lives.length > 0) {
      const liveTests = await Promise.allSettled(lives.map(l => testSiteUrl(l.url)));
      liveReport = {};
      lives.forEach((live, i) => {
        const result = liveTests[i].status === 'fulfilled' ? liveTests[i].value : { status: 'error' };
        liveReport[live.name + '|' + live.url] = { ...result, tested_at: now };
      });
    }

    const parses = (merged.parses || []).filter(p => p.url && isUrl(p.url)).slice(0, 10);
    if (parses.length > 0) {
      const parseTests = await Promise.allSettled(parses.map(p => testSiteUrl(p.url)));
      parseReport = {};
      parses.forEach((parse, i) => {
        const result = parseTests[i].status === 'fulfilled' ? parseTests[i].value : { status: 'error' };
        parseReport[parse.name || parse.url] = { ...result, tested_at: now };
      });
    }
  }

  // 更新 meta
  meta.batchIndex = batchIndex + 1;
  meta.lastRun = { batch: currentBatch + 1, totalBatches, tested: batch.length, total: tasks.length, time: now };

  // 写入 KV
  await my_kv.put('site_results', JSON.stringify(allResults));
  await my_kv.put('multi_url_results', JSON.stringify(multiResults));
  await my_kv.put('meta', JSON.stringify(meta));
  await my_kv.put('extra_results', JSON.stringify({ spiderResults, liveResults: liveReport, parseResults: parseReport }));

  return new Response(JSON.stringify({
    success: true,
    batch: currentBatch + 1,
    totalBatches,
    tested: batch.length,
    total: tasks.length,
    aliveCount: Object.values(allResults).filter(r => r.status === 'ok' && !r.name?.startsWith('__spider')).length
  }), { headers: { 'Content-Type': 'application/json' } });
}
