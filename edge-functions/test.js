/**
 * /test 路由 - 测试各源的连接情况
 */

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/2hacc/TVBox@main/oktv.json',
  'https://raw.githubusercontent.com/qist/tvbox/refs/heads/master/jsm.json',
  'https://raw.githubusercontent.com/gaotianliuyun/gao/master/js.json',
  'https://raw.liucn.cc/box/m.json'
];

async function testSource(url) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { headers: { 'User-Agent': 'TVBox-Merger/1.0' }, signal: controller.signal });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (!res.ok) return { status: 'http_error', http_code: res.status, latency, error: 'HTTP ' + res.status };

    const text = await res.text();
    const cleaned = text.replace(/^\uFEFF/, '').replace(/^\s*\/\/.*$/gm, '').trim();
    let data;
    try { data = JSON.parse(cleaned); } catch (e) {
      return { status: 'invalid_json', latency, error: 'JSON parse error' };
    }

    return {
      status: 'ok', latency,
      has_spider: !!data.spider,
      sites_count: Array.isArray(data.sites) ? data.sites.length : 0,
      lives_count: Array.isArray(data.lives) ? data.lives.length : 0,
      parses_count: Array.isArray(data.parses) ? data.parses.length : 0
    };
  } catch (e) {
    return { status: e.name === 'AbortError' ? 'timeout' : 'network_error', latency: Date.now() - start, error: e.message };
  }
}

export async function onRequest({ request }) {
  console.log('[test] request received:', request.url);
  try {
    const results = await Promise.allSettled(SOURCES.map(u => testSource(u)));
    const report = results.map((r, i) => {
      if (r.status === 'fulfilled') return { url: SOURCES[i], ...r.value };
      return { url: SOURCES[i], status: 'error', error: r.reason?.message || 'unknown' };
    });

    report.sort((a, b) => {
      if (a.status === 'ok' && b.status !== 'ok') return -1;
      if (a.status !== 'ok' && b.status === 'ok') return 1;
      return (a.latency || 99999) - (b.latency || 99999);
    });

    console.log(`[test] tested ${report.length} sources, ${report.filter(r => r.status === 'ok').length} ok`);

    return new Response(JSON.stringify({
      summary: {
        total: report.length,
        available: report.filter(r => r.status === 'ok').length,
        failed: report.filter(r => r.status !== 'ok').length,
        tested_at: new Date().toISOString()
      },
      results: report
    }, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    console.error('[test] error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}
