# TVBox Merger - EdgeOne Makers 版

TVBox 多源合并 Worker 的 EdgeOne Makers 移植版本，展示 Makers 平台的用法。

## 功能

- **多源合并**: 从多个 TVBox 源拉取配置并合并去重
- **定时检测**: 每 15 分钟自动分批测试站点连通性（通过 `edgeone.json` schedules）
- **存活过滤**: `/alive` 端点只返回测试通过的站点
- **KV 存储**: 测试结果持久化到 EdgeOne KV

## 项目结构

```
tvbox-merger-makers/
├── edgeone.json              # Makers 项目配置（含 cron 定时任务）
├── package.json
├── index.html                # 首页静态页面
├── edge-functions/           # Edge Functions（路由处理）
│   ├── index.js              # GET / → 合并配置 JSON
│   ├── tvbox.js              # GET /tvbox → 同上
│   ├── alive.js              # GET /alive → 存活配置
│   ├── test.js               # GET /test → 源连通性测试
│   ├── health.js             # GET /health → 健康检查
│   └── api/cron/
│       └── batch-test.js     # POST /api/cron/batch-test → 定时任务入口
└── lib/                      # 共享库
    ├── config.js             # 源地址配置
    ├── merge.js              # 拉取与合并逻辑
    ├── response.js           # 响应工具
    └── test.js               # 连接测试工具
```

## EdgeOne Makers 特性展示

### 1. Edge Functions（边缘函数）
- 基于文件路由，`edge-functions/` 目录下的文件自动映射为 URL 路径
- 导出 `onRequest(context)` 函数处理请求

### 2. KV 存储
- 通过绑定的 KV namespace 变量名（如 `my_kv`）直接访问
- API: `await my_kv.get(key, { type: 'json' })` / `await my_kv.put(key, value)`

### 3. 定时任务（Schedules）
- 在 `edgeone.json` 中配置 `schedules` 字段
- 使用标准 cron 表达式，自动触发指定 path 的 Edge Function

## 部署

### 方式一：连接 Git 仓库（推荐）
1. 推送代码到 GitHub
2. 在 EdgeOne Makers 控制台导入 Git 仓库
3. 自动构建部署

### 方式二：CLI 部署
```bash
npx edgeone makers deploy . -n tvbox-merger-makers -t YOUR_TOKEN
```

## KV 配置

部署后需要在控制台：
1. 进入 Storage > KV，创建 namespace
2. 在项目设置中绑定 namespace，变量名设为 `my_kv`

## 对比 Cloudflare Workers 版本

| 特性 | CF Workers | EdgeOne Makers |
|------|-----------|----------------|
| 路由 | `export default { fetch() }` | 文件路由 `edge-functions/xxx.js` |
| KV | `env.SITES_KV.get()` | `my_kv.get()` (绑定变量名) |
| 定时任务 | `scheduled()` + wrangler crons | `edgeone.json` schedules |
| 部署 | `wrangler deploy` | `edgeone makers deploy` 或 Git 推送 |
