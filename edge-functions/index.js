/**
 * / 根路径 - 返回状态面板页面
 */
export async function onRequest({ request }) {
  console.log('[index] serving homepage');
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TVBox Merger - EdgeOne Makers</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f1117;color:#e1e4e8;min-height:100vh;padding:20px}
    .container{max-width:900px;margin:0 auto}
    h1{text-align:center;font-size:28px;margin-bottom:8px}
    .subtitle{text-align:center;color:#8b949e;margin-bottom:24px;font-size:14px}
    .nav{display:flex;gap:12px;justify-content:center;margin-bottom:24px;flex-wrap:wrap}
    .nav a{color:#58a6ff;text-decoration:none;background:#161b22;border:1px solid #30363d;padding:10px 20px;border-radius:8px;font-size:14px;transition:all .2s}
    .nav a:hover{background:#21262d;border-color:#58a6ff}
    .summary{display:flex;gap:16px;justify-content:center;margin-bottom:24px;flex-wrap:wrap}
    .stat{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px 24px;text-align:center;min-width:100px}
    .stat-value{font-size:28px;font-weight:bold}
    .stat-label{font-size:12px;color:#8b949e;margin-top:4px}
    .stat-ok .stat-value{color:#3fb950}
    .stat-fail .stat-value{color:#f85149}
    .stat-total .stat-value{color:#58a6ff}
    .info-bar{text-align:center;color:#8b949e;font-size:13px;margin-bottom:20px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:12px;margin-bottom:12px;overflow:hidden;transition:border-color .2s}
    .card:hover{border-color:#58a6ff}
    .card-header{display:flex;align-items:center;padding:14px 18px;gap:12px}
    .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .dot-ok{background:#3fb950;box-shadow:0 0 6px rgba(63,185,80,.4)}
    .dot-fail{background:#f85149;box-shadow:0 0 6px rgba(248,81,73,.4)}
    .card-url{flex:1;font-size:13px;word-break:break-all;font-family:"SF Mono",Monaco,monospace;color:#8b949e}
    .card-latency{font-size:13px;color:#8b949e;white-space:nowrap}
    .card-details{padding:0 18px 14px 40px;display:flex;flex-wrap:wrap;gap:8px}
    .tag{background:#21262d;border:1px solid #30363d;border-radius:6px;padding:4px 10px;font-size:12px;color:#8b949e}
    .tag-value{color:#e1e4e8;font-weight:500}
    .error-msg{color:#f85149;font-size:13px;padding:0 18px 14px 40px}
    .loading{text-align:center;padding:40px;color:#8b949e}
    .section-title{font-size:18px;margin:30px 0 14px;padding-left:4px}
    .badge{text-align:center;color:#484f58;font-size:12px;margin-top:30px}
  </style>
</head>
<body>
  <div class="container">
    <h1>📡 TVBox Merger</h1>
    <p class="subtitle">多源合并 + 自动存活检测 | EdgeOne Makers</p>
    <div class="nav">
      <a href="/tvbox">📋 合并 JSON</a>
      <a href="/alive">✅ 存活配置</a>
      <a href="/test">🔍 源 API</a>
      <a href="/health">❤️ 健康</a>
    </div>
    <div id="status-section">
      <div class="loading">⏳ 正在加载源状态...</div>
    </div>
    <p class="badge">Powered by EdgeOne Makers | Cron 每15分钟自动检测</p>
  </div>
  <script>
    async function loadStatus(){
      const section=document.getElementById('status-section');
      try{
        const res=await fetch('/test');
        const data=await res.json();
        const{summary,results}=data;
        let html='<div class="summary"><div class="stat stat-total"><div class="stat-value">'+summary.total+'</div><div class="stat-label">总源数</div></div><div class="stat stat-ok"><div class="stat-value">'+summary.available+'</div><div class="stat-label">可用</div></div><div class="stat stat-fail"><div class="stat-value">'+summary.failed+'</div><div class="stat-label">异常</div></div></div>';
        html+='<div class="info-bar">⏱ '+new Date(summary.tested_at).toLocaleString('zh-CN')+' | 每15分钟自动测试</div>';
        html+='<h3 class="section-title">📊 源连接状态</h3>';
        for(const r of results){
          const ok=r.status==='ok';
          const dot=ok?'dot-ok':'dot-fail';
          const lat=r.latency!=null?r.latency+'ms':'--';
          let det='';
          if(ok){det='<div class="card-details">'+(r.sites_count?'<span class="tag">站点 <span class="tag-value">'+r.sites_count+'</span></span>':'')+(r.lives_count?'<span class="tag">直播 <span class="tag-value">'+r.lives_count+'</span></span>':'')+(r.has_spider?'<span class="tag">Spider <span class="tag-value">✓</span></span>':'')+'</div>';}
          else{det='<div class="error-msg">❌ '+(r.error||r.status)+'</div>';}
          html+='<div class="card"><div class="card-header"><span class="dot '+dot+'"></span><span class="card-url">'+r.url+'</span><span class="card-latency">'+lat+'</span></div>'+det+'</div>';
        }
        section.innerHTML=html;
      }catch(e){section.innerHTML='<div class="info-bar" style="color:#f85149">加载失败: '+e.message+'</div>';}
    }
    loadStatus();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
  });
}
