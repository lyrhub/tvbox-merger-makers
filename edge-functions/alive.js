/**
 * /alive 路由 - 返回只包含可连接站点的 TVBox 配置 JSON
 */
import { getStore } from "@edgeone/pages-blob";
import { fetchSource, mergeConfigs, resolveUrl } from '../lib/merge.js';
import { jsonResponse } from '../lib/response.js';
import { SOURCES, SPIDER, PAN_KEYWORDS } from '../lib/config.js';

export async function onRequest({ request, params, env }) {
  const store = getStore("tvbox-data");

  // 读取测试结果（从 Blob）
  let siteResults = {};
  let multiResults = {};
  let liveResults = {};
  let parseResults = {};
  let spiderResults = {};

  try {
    const raw = await store.get("site_results.json");
    if (raw) siteResults = JSON.parse(raw);
  } catch (e) {}
  try {
    const raw = await store.get("multi_url_results.json");
    if (raw) multiResults = JSON.parse(raw);
  } catch (e) {}
  try {
    const raw = await store.get("extra_results.json");
    if (raw) {
      const extra = JSON.parse(raw);
      if (extra.spiderResults) spiderResults = extra.spiderResults;
      if (extra.liveResults) liveResults = extra.liveResults;
      if (extra.parseResults) parseResults = extra.parseResults;
    }
  } catch (e) {}

  // 只保留测试结果为 ok 的站点
  const aliveKeys = new Set();
  for (const [key, result] of Object.entries(siteResults)) {
    if (key.startsWith('__spider')) continue;
    if (result.status === 'ok') aliveKeys.add(key);
  }

  // 拉取并合并所有源
  const results = await Promise.allSettled(SOURCES.map(u => fetchSource(u)));
  const configs = [], configSources = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) { configs.push(r.value); configSources.push(SOURCES[i]); }
  });

  if (configs.length === 0) return jsonResponse({ error: '所有源均拉取失败' }, 502);

  const merged = mergeConfigs(configs, configSources);

  // 如果还没有测试数据，返回完整配置
  if (aliveKeys.size === 0) {
    merged._alive = { note: '测试数据尚未生成，返回完整配置', updated: new Date().toISOString() };
    if (SPIDER) merged.spider = SPIDER;
    delete merged._spiders;
    merged.sites = merged.sites.map(s => {
      const { _spider, _source, _baseUrl, ...rest } = s;
      return rest;
    });
    return jsonResponse(merged);
  }

  // 确定不可用的 spider
  const deadSpiders = new Set();
  for (const [spider, result] of Object.entries(spiderResults)) {
    if (result.status !== 'ok') deadSpiders.add(spider);
  }

  // 过滤站点
  const filteredSites = [];

  for (const site of merged.sites) {
    const key = site.key || site.name;
    const name = site.name || '';
    const api = site.api || '';

    // 排除网盘类站点
    if (PAN_KEYWORDS.test(key) || PAN_KEYWORDS.test(name) || PAN_KEYWORDS.test(api)) continue;
    // 排除 dead spider 的站点
    if (site.type === 3 && site._spider && deadSpiders.has(site._spider)) continue;

    const multi = multiResults[key];

    if (multi && multi.urls) {
      const urlResults = multi.urls;
      const aliveUrls = Object.keys(urlResults).filter(url => urlResults[url].status === 'ok');
      if (aliveUrls.length === 0) continue;

      const { _spider, _source, _baseUrl, ...cleanSite } = site;
      if (_baseUrl && cleanSite.api && cleanSite.api.startsWith('./')) cleanSite.api = resolveUrl(cleanSite.api, _baseUrl);

      if (multi.format === 'array' && site.ext && typeof site.ext === 'object' && Array.isArray(site.ext.site)) {
        filteredSites.push({ ...cleanSite, ext: { ...site.ext, site: aliveUrls } });
      } else if (multi.format === 'comma' && site.ext && typeof site.ext === 'string') {
        filteredSites.push({ ...cleanSite, ext: aliveUrls.join(',') });
      } else {
        if (_baseUrl && cleanSite.ext && typeof cleanSite.ext === 'string' && cleanSite.ext.startsWith('./')) {
          cleanSite.ext = resolveUrl(cleanSite.ext, _baseUrl);
        }
        filteredSites.push(cleanSite);
      }
    } else if (aliveKeys.has(key)) {
      const { _spider, _source, _baseUrl, ...cleanSite } = site;
      if (_baseUrl) {
        if (cleanSite.api && cleanSite.api.startsWith('./')) cleanSite.api = resolveUrl(cleanSite.api, _baseUrl);
        if (cleanSite.ext && typeof cleanSite.ext === 'string' && cleanSite.ext.startsWith('./')) cleanSite.ext = resolveUrl(cleanSite.ext, _baseUrl);
      }
      filteredSites.push(cleanSite);
    }
  }

  merged.sites = filteredSites;
  delete merged._spiders;
  if (SPIDER) merged.spider = SPIDER;

  // 过滤 lives
  if (Object.keys(liveResults).length > 0) {
    merged.lives = merged.lives.filter(live => {
      const key = live.name + '|' + live.url;
      const result = liveResults[key];
      if (!result) return true;
      return result.status === 'ok';
    });
  }

  // 过滤 parses
  if (Object.keys(parseResults).length > 0) {
    merged.parses = merged.parses.filter(parse => {
      const key = parse.name || parse.url;
      const result = parseResults[key];
      if (!result) return true;
      return result.status === 'ok';
    });
  }

  // 清理空数组
  if (!merged.doh || merged.doh.length === 0) delete merged.doh;
  if (!merged.rules || merged.rules.length === 0) delete merged.rules;
  if (!merged.flags || merged.flags.length === 0) delete merged.flags;
  if (!merged.parses || merged.parses.length === 0) delete merged.parses;
  if (!merged.lives || merged.lives.length === 0) delete merged.lives;

  return jsonResponse(merged);
}
