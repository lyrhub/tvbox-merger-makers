/**
 * /tvbox 路由 - 返回合并后的 TVBox 配置 JSON
 */
import { fetchSource, mergeConfigs, resolveUrl } from '../lib/merge.js';
import { jsonResponse } from '../lib/response.js';
import { SOURCES, SPIDER } from '../lib/config.js';

export async function onRequest({ request }) {
  try {
    const sources = SOURCES;
    if (sources.length === 0) return jsonResponse({ error: '未配置源地址' }, 500);

    const results = await Promise.allSettled(sources.map(u => fetchSource(u)));
    const configs = [], errors = [], configSources = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) { configs.push(r.value); configSources.push(sources[i]); }
      else errors.push(`源${i + 1}失败`);
    });

    if (configs.length === 0) return jsonResponse({ error: '所有源均拉取失败', details: errors }, 502);

    const merged = mergeConfigs(configs, configSources);
    if (SPIDER) merged.spider = SPIDER;

    // 清理内部字段
    delete merged._spiders;
    merged.sites = merged.sites.map(s => {
      const { _spider, _source, _baseUrl, ...rest } = s;
      if (_baseUrl) {
        if (rest.api && rest.api.startsWith('./')) rest.api = resolveUrl(rest.api, _baseUrl);
        if (rest.ext && typeof rest.ext === 'string' && rest.ext.startsWith('./')) rest.ext = resolveUrl(rest.ext, _baseUrl);
      }
      return rest;
    });

    merged._merger = {
      total_sources: sources.length,
      success: configs.length,
      failed: errors.length,
      updated: new Date().toISOString()
    };

    return jsonResponse(merged);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}
