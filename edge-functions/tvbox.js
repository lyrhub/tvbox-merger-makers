/**
 * /tvbox 路由 - 返回合并后的 TVBox 配置 JSON
 */

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/oktv.json',
  'https://raw.githubusercontent.com/qist/tvbox/refs/heads/master/jsm.json',
  'https://raw.githubusercontent.com/gaotianliuyun/gao/master/js.json',
  'https://raw.liucn.cc/box/m.json'
];
const SPIDER = 'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/jar/tvbox.txt;md5;265301f463ec681dcbba91897f20f08b';

async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Merger/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  let cleaned = text.replace(/^\uFEFF/, '').trim();
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, '').trim();
  return JSON.parse(cleaned);
}

function resolveUrl(relativePath, baseUrl) {
  if (!relativePath || !baseUrl) return relativePath;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) return relativePath;
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  let resolved = relativePath.startsWith('./') ? relativePath.substring(2) : relativePath;
  return baseDir + resolved;
}

function extractSourceName(url) {
  try {
    const ghMatch = url.match(/\/gh\/([^/]+)\//);
    if (ghMatch) return ghMatch[1];
    const rawMatch = url.match(/githubusercontent\.com\/([^/]+)\//);
    if (rawMatch) return rawMatch[1];
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : hostname;
  } catch (e) { return url.substring(0, 20); }
}

function resolveSpider(spider, baseUrl) {
  if (!spider || !baseUrl) return spider;
  const parts = spider.split(';');
  parts[0] = resolveUrl(parts[0], baseUrl);
  return parts.join(';');
}

function mergeConfigs(configs, sourceUrls) {
  const merged = { spider: '', sites: [], lives: [], parses: [] };
  const seenLives = new Set(), seenParses = new Set();
  const siteKeys = new Set();

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const baseUrl = sourceUrls[i] || '';
    const sourceSpider = resolveSpider(config.spider || '', baseUrl);
    if (!merged.spider && sourceSpider) merged.spider = sourceSpider;

    if (Array.isArray(config.sites)) {
      for (const site of config.sites) {
        const key = site.key || site.name;
        if (!key || siteKeys.has(key)) continue;
        siteKeys.add(key);
        merged.sites.push({ ...site, _baseUrl: baseUrl });
      }
    }
    if (Array.isArray(config.lives)) {
      for (const live of config.lives) {
        const k = `${live.name}|${live.url}`;
        if (!seenLives.has(k)) { seenLives.add(k); merged.lives.push(live); }
      }
    }
    if (Array.isArray(config.parses)) {
      for (const parse of config.parses) {
        const k = parse.name || parse.url;
        if (k && !seenParses.has(k)) { seenParses.add(k); merged.parses.push(parse); }
      }
    }
  }
  return merged;
}

export async function onRequest({ request }) {
  console.log('[tvbox] request received:', request.url);
  try {
    const results = await Promise.allSettled(SOURCES.map(u => fetchSource(u)));
    const configs = [], errors = [], configSources = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) { configs.push(r.value); configSources.push(SOURCES[i]); }
      else errors.push(`源${i + 1}: ${r.reason?.message || 'failed'}`);
    });

    console.log(`[tvbox] fetched ${configs.length}/${SOURCES.length} sources`);

    if (configs.length === 0) {
      return new Response(JSON.stringify({ error: '所有源均拉取失败', details: errors }), {
        status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const merged = mergeConfigs(configs, configSources);
    merged.spider = SPIDER;

    // 清理内部字段
    merged.sites = merged.sites.map(s => {
      const { _baseUrl, ...rest } = s;
      if (_baseUrl) {
        if (rest.api && rest.api.startsWith('./')) rest.api = resolveUrl(rest.api, _baseUrl);
        if (rest.ext && typeof rest.ext === 'string' && rest.ext.startsWith('./')) rest.ext = resolveUrl(rest.ext, _baseUrl);
      }
      return rest;
    });

    merged._merger = { total_sources: SOURCES.length, success: configs.length, failed: errors.length, updated: new Date().toISOString() };

    console.log(`[tvbox] merged: ${merged.sites.length} sites, ${merged.lives.length} lives`);

    return new Response(JSON.stringify(merged, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }
    });
  } catch (err) {
    console.error('[tvbox] error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
