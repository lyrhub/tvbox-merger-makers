/**
 * /test 路由 - 测试各源的连接情况
 */
import { testSource } from '../lib/test.js';
import { jsonResponse } from '../lib/response.js';
import { SOURCES } from '../lib/config.js';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const cs = url.searchParams.get('sources');
  const sources = cs
    ? cs.split('|').map(s => s.trim()).filter(Boolean)
    : SOURCES;

  if (sources.length === 0) return jsonResponse({ error: '未配置源地址' }, 400);

  const results = await Promise.allSettled(sources.map(u => testSource(u)));
  const report = results.map((r, i) => {
    if (r.status === 'fulfilled') return { url: sources[i], ...r.value };
    return { url: sources[i], status: 'error', error: r.reason.message };
  });

  report.sort((a, b) => {
    if (a.status === 'ok' && b.status !== 'ok') return -1;
    if (a.status !== 'ok' && b.status === 'ok') return 1;
    return (a.latency || 99999) - (b.latency || 99999);
  });

  return jsonResponse({
    summary: {
      total: report.length,
      available: report.filter(r => r.status === 'ok').length,
      failed: report.filter(r => r.status !== 'ok').length,
      tested_at: new Date().toISOString()
    },
    results: report
  });
}
