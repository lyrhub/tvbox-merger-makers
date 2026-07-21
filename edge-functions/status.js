/**
 * /status 路由 - 查看 cron job 运行历史和站点测试统计
 */
export async function onRequest({ request }) {
  console.log('[status] request received');
  try {
    const { getStore } = await import("@edgeone/pages-blob");
    const store = getStore("tvbox-data");

    let history = [];
    let meta = {};
    let siteResults = {};

    try { const raw = await store.get('run_history.json'); if (raw) history = JSON.parse(raw); } catch (e) {}
    try { const raw = await store.get('meta.json'); if (raw) meta = JSON.parse(raw); } catch (e) {}
    try { const raw = await store.get('site_results.json'); if (raw) siteResults = JSON.parse(raw); } catch (e) {}

    // 统计
    const entries = Object.values(siteResults);
    const stats = {
      total: entries.length,
      alive: entries.filter(r => r.status === 'ok').length,
      dead: entries.filter(r => r.status !== 'ok' && r.status !== 'skip').length,
      skip: entries.filter(r => r.status === 'skip').length
    };

    // 生成 HTML
    const historyRows = history.map(h => {
      const t = new Date(h.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      return `<tr><td>${t}</td><td>${h.batch}/${h.totalBatches}</td><td>${h.tested}</td><td style="color:#3fb950">${h.aliveCount}</td><td>${h.totalResults}</td><td>${h.sources}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TVBox Merger - 运行状态</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1117;color:#e1e4e8;min-height:100vh;padding:20px}
.container{max-width:900px;margin:0 auto}
h1{text-align:center;font-size:24px;margin-bottom:8px}
.subtitle{text-align:center;color:#8b949e;margin-bottom:24px;font-size:14px}
.nav{text-align:center;margin-bottom:20px}
.nav a{color:#58a6ff;text-decoration:none;margin:0 12px;font-size:14px}
.nav a:hover{text-decoration:underline}
.summary{display:flex;gap:16px;justify-content:center;margin-bottom:24px;flex-wrap:wrap}
.stat{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px 24px;text-align:center;min-width:100px}
.stat-value{font-size:28px;font-weight:bold}
.stat-label{font-size:12px;color:#8b949e;margin-top:4px}
.stat-ok .stat-value{color:#3fb950}
.stat-fail .stat-value{color:#f85149}
.stat-total .stat-value{color:#58a6ff}
.stat-skip .stat-value{color:#8b949e}
.section-title{font-size:18px;margin:24px 0 12px}
table{width:100%;border-collapse:collapse;background:#161b22;border-radius:12px;overflow:hidden;border:1px solid #30363d;margin-bottom:20px}
th{background:#21262d;padding:10px 14px;text-align:left;font-size:12px;color:#8b949e;font-weight:500}
td{padding:8px 14px;border-top:1px solid #21262d;font-size:13px}
tr:hover td{background:#1c2128}
.info-bar{text-align:center;color:#8b949e;font-size:13px;margin-bottom:20px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px}
.empty{text-align:center;color:#484f58;padding:40px}
</style></head>
<body><div class="container">
<h1>📊 Cron Job 运行状态</h1>
<p class="subtitle">定时任务每15分钟分批测试站点连通性</p>
<div class="nav"><a href="/">← 首页</a><a href="/tvbox">合并JSON</a><a href="/alive">存活配置</a></div>

<div class="summary">
  <div class="stat stat-total"><div class="stat-value">${stats.total}</div><div class="stat-label">总站点</div></div>
  <div class="stat stat-ok"><div class="stat-value">${stats.alive}</div><div class="stat-label">存活</div></div>
  <div class="stat stat-fail"><div class="stat-value">${stats.dead}</div><div class="stat-label">异常</div></div>
  <div class="stat stat-skip"><div class="stat-value">${stats.skip}</div><div class="stat-label">跳过</div></div>
</div>

${meta.lastRun ? `<div class="info-bar">⏱ 上次运行: 第${meta.lastRun.batch}/${meta.lastRun.totalBatches}批 | 测试${meta.lastRun.tested}个 | ${new Date(meta.lastRun.time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div>` : '<div class="info-bar">⏱ 定时任务尚未运行</div>'}

<h3 class="section-title">📋 运行历史（最近20次）</h3>
${history.length > 0 ? `<table><thead><tr><th>时间</th><th>批次</th><th>测试数</th><th>存活</th><th>总记录</th><th>源数</th></tr></thead><tbody>${historyRows}</tbody></table>` : '<div class="empty">暂无运行记录，等待第一次 cron 触发</div>'}

</div></body></html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
    });
  } catch (err) {
    console.error('[status] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
