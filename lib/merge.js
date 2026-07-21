/**
 * 源数据拉取与合并逻辑
 */

export async function fetchSource(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Merger/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  let cleaned = text.replace(/^\uFEFF/, '').trim();
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, '').trim();
  return JSON.parse(cleaned);
}

export function resolveUrl(relativePath, baseUrl) {
  if (!relativePath || !baseUrl) return relativePath;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) return relativePath;
  try {
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    let resolved = relativePath;
    if (resolved.startsWith('./')) resolved = resolved.substring(2);
    return baseDir + resolved;
  } catch (e) {
    return relativePath;
  }
}

function resolveSpider(spider, baseUrl) {
  if (!spider || !baseUrl) return spider;
  const parts = spider.split(';');
  parts[0] = resolveUrl(parts[0], baseUrl);
  return parts.join(';');
}

function extractSourceName(url) {
  try {
    const ghMatch = url.match(/\/gh\/([^/]+)\//);
    if (ghMatch) return ghMatch[1];
    const rawMatch = url.match(/githubusercontent\.com\/([^/]+)\//);
    if (rawMatch) return rawMatch[1];
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) return parts[parts.length - 2];
    return hostname;
  } catch (e) {
    return url.substring(0, 20);
  }
}

export function mergeConfigs(configs, sourceUrls = []) {
  const merged = { spider: '', sites: [], lives: [], parses: [], doh: [], rules: [], flags: [] };
  const seenLives = new Set();
  const seenParses = new Set();
  const seenFlags = new Set();
  merged._spiders = [];
  const siteKeyBySpider = new Map();

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const baseUrl = sourceUrls[i] || '';
    const sourceName = baseUrl ? extractSourceName(baseUrl) : `源${i + 1}`;
    const sourceSpider = resolveSpider(config.spider || '', baseUrl);

    if (!merged.spider && sourceSpider) merged.spider = sourceSpider;
    if (sourceSpider && !merged._spiders.includes(sourceSpider)) merged._spiders.push(sourceSpider);

    if (Array.isArray(config.sites)) {
      for (const site of config.sites) {
        const key = site.key || site.name;
        if (!key) continue;
        const existingSpider = siteKeyBySpider.get(key);
        if (existingSpider === undefined) {
          siteKeyBySpider.set(key, sourceSpider);
          merged.sites.push({ ...site, _spider: sourceSpider, _source: sourceName, _baseUrl: baseUrl });
        } else if (existingSpider !== sourceSpider) {
          const newKey = key + '_' + sourceName;
          if (!siteKeyBySpider.has(newKey)) {
            siteKeyBySpider.set(newKey, sourceSpider);
            merged.sites.push({ ...site, key: newKey, name: (site.name || key) + `[${sourceName}]`, _spider: sourceSpider, _source: sourceName, _baseUrl: baseUrl });
          }
        }
      }
    }

    if (Array.isArray(config.lives)) {
      for (const live of config.lives) {
        const key = `${live.name}|${live.url}`;
        if (!seenLives.has(key)) { seenLives.add(key); merged.lives.push(live); }
      }
    }
    if (Array.isArray(config.parses)) {
      for (const parse of config.parses) {
        const key = parse.name || parse.url;
        if (key && !seenParses.has(key)) { seenParses.add(key); merged.parses.push(parse); }
      }
    }
    if (Array.isArray(config.doh)) merged.doh.push(...config.doh);
    if (Array.isArray(config.rules)) merged.rules.push(...config.rules);
    if (Array.isArray(config.flags)) {
      for (const flag of config.flags) {
        if (!seenFlags.has(flag)) { seenFlags.add(flag); merged.flags.push(flag); }
      }
    }
  }

  merged.doh = [...new Set(merged.doh)];
  return merged;
}
