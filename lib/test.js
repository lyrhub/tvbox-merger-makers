/**
 * 连接测试工具
 */

export async function testSource(url) {
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
      return { status: 'invalid_json', latency, content_length: text.length, error: 'JSON parse error' };
    }

    const info = {
      status: 'ok', latency, content_length: text.length,
      has_spider: !!data.spider,
      sites_count: Array.isArray(data.sites) ? data.sites.length : 0,
      lives_count: Array.isArray(data.lives) ? data.lives.length : 0,
      parses_count: Array.isArray(data.parses) ? data.parses.length : 0
    };

    if (Array.isArray(data.storeHouse)) { info.type = 'multi_repo'; info.repos_count = data.storeHouse.length; }
    else if (info.sites_count > 0) info.type = 'single_source';
    else info.type = 'unknown_format';

    return info;
  } catch (e) {
    return { status: e.name === 'AbortError' ? 'timeout' : 'network_error', latency: Date.now() - start, error: e.message };
  }
}

export async function testSiteUrl(url) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'TVBox-Merger/1.0' },
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (res.ok) return { status: 'ok', latency, http_code: res.status };
    return { status: 'http_error', latency, http_code: res.status, error: 'HTTP ' + res.status };
  } catch (e) {
    const latency = Date.now() - start;
    if (e.name === 'AbortError') return { status: 'timeout', latency, error: '超时(>8s)' };
    return { status: 'network_error', latency, error: e.message.substring(0, 60) };
  }
}
