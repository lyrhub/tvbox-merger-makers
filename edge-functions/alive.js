/**
 * /alive 路由 - 返回只包含可连接站点的 TVBox 配置
 * 暂时等同于 /tvbox（Blob 存储需要测试数据后才有过滤效果）
 */

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/oktv.json',
  'https://raw.githubusercontent.com/qist/tvbox/refs/heads/master/jsm.json',
  'https://raw.githubusercontent.com/gaotianliuyun/gao/master/js.json',
  'https://raw.liucn.cc/box/m.json'
];
const SPIDER = 'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/jar/tvbox.txt;md5;265301f463ec681dcbba91897f20f08b';

const PAN_KEYWORDS = /网盘|云盘|Ali|Quark|Thunder|PikPak|UCShare|Samba|115|Push|AList|WebDAV|MIPanSo|KkSs|PanS|YiSo|YpanSo|UuSs|xzso|盘搜|盘他|米盘|抠抠|夸搜|易搜|盘Se|夸克|阿里|PanWeb|Share|分享|云搜|紙條|纸条|Gitcafe|Dovx|Zhaozy|UpYun|弹幕|磁力|p2p/i;

async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Merger/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  let cleaned = text.replace(/^\uFEFF/, '').trim().replace(/^\s*\/\/.*$/gm, '').trim();
  return JSON.parse(cleaned);
}

function resolveUrl(path, baseUrl) {
  if (!path || !baseUrl) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!path.startsWith('./')) return path;
  const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
  return baseDir + path.substring(2);
}

export async function onRequest({ request }) {
  console.log('[alive] request received:', request.url);
  try {
    // 尝试从 Blob 读取测试结果
    let siteResults = null;
    try {
      const { getStore } = await import("@edgeone/pages-blob");
      const store = getStore("tvbox-data");
      const raw = await store.get("site_results.json");
      if (raw) siteResults = JSON.parse(raw);
      console.log('[alive] loaded site_results from blob, keys:', siteResults ? Object.keys(siteResults).length : 0);
    } catch (e) {
      console.log('[alive] blob read failed (first run?):', e.message);
    }

    // 拉取源
    const results = await Promise.allSettled(SOURCES.map(u => fetchSource(u)));
    const configs = [], configSources = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) { configs.push(r.value); configSources.push(SOURCES[i]); }
    });

    if (configs.length === 0) {
      return new Response(JSON.stringify({ error: '所有源均拉取失败' }), {
        status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // 简单合并
    const merged = { spider: SPIDER, sites: [], lives: [], parses: [] };
    const seenSites = new Set(), seenLives = new Set(), seenParses = new Set();

    for (let i = 0; i < configs.length; i++) {
      const config = configs[i];
      const baseUrl = configSources[i];
      if (Array.isArray(config.sites)) {
        for (const site of config.sites) {
          const key = site.key || site.name;
          if (!key || seenSites.has(key)) continue;
          seenSites.add(key);

          // 排除网盘类
          if (PAN_KEYWORDS.test(key) || PAN_KEYWORDS.test(site.name || '') || PAN_KEYWORDS.test(site.api || '')) continue;

          // 如果有测试数据，只保留 ok 的
          if (siteResults && Object.keys(siteResults).length > 0) {
            const r = siteResults[key];
            if (r && r.status !== 'ok') continue;
          }

          const clean = { ...site };
          if (baseUrl) {
            if (clean.api && clean.api.startsWith('./')) clean.api = resolveUrl(clean.api, baseUrl);
            if (clean.ext && typeof clean.ext === 'string' && clean.ext.startsWith('./')) clean.ext = resolveUrl(clean.ext, baseUrl);
          }
          merged.sites.push(clean);
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

    console.log(`[alive] output: ${merged.sites.length} sites, ${merged.lives.length} lives`);

    return new Response(JSON.stringify(merged, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }
    });
  } catch (err) {
    console.error('[alive] error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
