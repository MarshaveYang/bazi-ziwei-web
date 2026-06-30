# bazi-ziwei-web

八字+紫微斗数综合命盘生成器，部署在 Cloudflare Pages。

**三种分析模式**：
- 🎴 **不使用 AI 分析** — 纯算法排盘 + 规则分析海报，零成本，秒级响应
- 🤖 **网站提供 AI 分析** — 使用站长配置的 API Key，生成 AI 深度长文（可能不稳定）
- 🔑 **自定义 AI 分析** — 用户自行提供 API Key，本网站不保留你的 Key

---

## 项目文件结构

```
bazi-ziwei-web/                       ← GitHub 仓库根目录
├── index.html                        ← 生辰表单页（三选一 AI 模式）
├── templates/
│   └── report-zonghe-poster.html     ← 海报模板（386 个变量占位）
├── functions/
│   ├── api/
│   │   └── chart.js                  ← 核心 API：排盘 + 规则分析 + AI + 渲染
│   └── _vendor/                      ← 算法模块（_ 前缀让 wrangler 跳过路由发现）
│       ├── yiqi-core/                ← 八字+紫微核心算法（14 个 .js 文件）
│       ├── bazi-enrich/              ← 格局/旺衰/调候补全层（8 个 .js 文件）
│       ├── analysis-gen.js           ← 规则分析生成器（不依赖 LLM）
│       └── ai-prompts.js             ← AI 提示词 + 命盘文本转换
├── package.json                      ← npm 依赖（lunar-typescript）
├── .gitignore
└── README.md
```

> **注意**：项目根目录即为 Cloudflare Pages 的部署根目录，不需要 `public/` 子目录。

---

## Cloudflare Pages 配置（关键！）

在 Cloudflare Pages 仪表板 → 项目设置 → Build & Deploy → Build configuration：

| 字段 | 值 | 说明 |
|------|-----|------|
| 框架预设 | **无** | 不选任何框架 |
| 构建命令 | `npm install` | 安装 `lunar-typescript` 依赖 |
| 构建输出目录 | **留空** | 根目录即部署目录 |
| 根目录 | **留空** | |

### 环境变量（可选，用于"网站提供 AI 分析"模式）

在 设置 → 环境变量 → 添加生产环境变量：

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `AI_API_KEY` | `sk-xxx...` 或 `nvapi-xxx...` | API Key |
| `AI_PROVIDER` | `deepseek` | `nvidia` / `deepseek` / `openai` |
| `AI_BASE_URL` | `https://api.deepseek.com/v1` | 可选，默认自动匹配 |
| `AI_MODEL` | `deepseek-chat` | 可选，默认自动匹配 |

> 修改环境变量后必须点 **重新部署** 才会生效。

---

## 部署历史 & 问题排查记录

### 问题 1：404 错误（找不到网页）
**原因**：Cloudflare Pages v2 根目录策略，仓库中没有 `index.html` 在根目录。  
**解决**：将 `index.html` 从子目录移到仓库根目录。

### 问题 2：`No routes found when building Functions directory`
**原因**：wrangler 3.x 扫描 `functions/` 下所有子目录找路由，`vendor/` 目录中的 `.js` 文件被当作路由处理但无有效路由。  
**解决**：将 `vendor/` 重命名为 `functions/_vendor/`（`_` 前缀让 wrangler 跳过该目录）。

### 问题 3：`Multiple exports with the same name`
**原因**：`ai-prompts.js` 中函数同时使用 `export function` 声明和底部 `export {}` 导出，导致重复导出。  
**解决**：去掉函数前的 `export` 关键字，仅保留底部统一的 `export {}`。

### 问题 4：`Could not resolve "lunar-typescript"`
**原因**：Cloudflare 没有执行 `npm install`，`lunar-typescript` 依赖未安装。  
**解决**：在 Cloudflare Pages 仪表板设置 Build command = `npm install`。

### 问题 5：海报内容大面积空白
**原因**：`renderPoster()` 函数只填充了约 60% 的模板变量，缺失：藏干 HTML、自坐、大运 strip、流年 strip、section_01、section_02 等。  
**解决**：重写 `renderPoster()` 函数，完整填充所有 386 个模板变量。

### 问题 6：AI 模式弹窗被拦截
**原因**：`window.open()` 在异步 fetch 回调中调用，浏览器视为非用户触发。  
**解决**：将 `window.open()` 移到同步代码中（fetch 之前），先开空窗口再异步填充内容。

### 问题 7：新窗口打开后无内容，容易误关
**解决**：空窗口先显示加载动画（spinner + "正在排盘计算中，请稍候…" + 省略号动画），fetch 返回后再替换为海报。

---

## 技术架构

```
用户浏览器                    Cloudflare Pages
┌──────────┐    POST /api/chart   ┌──────────────────────┐
│ index    │ ──────────────────→  │ Pages Function        │
│ .html    │                      │  ├ 排盘 (yiqi-core)   │
│          │                      │  ├ 补全 (bazi-enrich) │
│          │ ←── JSON {html} ──── │  ├ 规则分析 (analysis)│
│          │                      │  ├ AI 分析 (可选)     │
│ 新窗口   │                      │  └ 模板渲染           │
│ 海报展示 │                      └──────────────────────┘
└──────────┘
```

- **排盘**：基于 `lunar-typescript` npm 包 + 自研 yiqi-core 算法层
- **补全**：bazi-enrich 提供格局判定、旺衰评分、调候用神、五行统计
- **规则分析**：analysis-gen.js 纯算法生成主轴印证、优劣势、六维对账、综合定论
- **AI 分析**：调用大模型生成深度长文，附在规则海报底部
- **模板渲染**：服务端变量替换，386 个模板占位符 → 完整 HTML 海报

---

## 免费 AI 提供商

| 提供商 | 注册地址 | 免费额度 |
|--------|---------|---------|
| **Nvidia NIM** | [build.nvidia.com](https://build.nvidia.com) | 注册送 5000 次 |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | 充值使用（¥0.5/百万 tokens） |
| **Groq** | [console.groq.com](https://console.groq.com) | 免费调用，有速率限制 |

---

## 更新代码

GitHub 仓库更新后 Cloudflare 自动部署：

1. 打开 `github.com/MarshaveYang/bazi-ziwei-web`
2. 修改文件 → 提交
3. Cloudflare 自动检测 → 1-2 分钟后生效
4. 在 Pages 仪表板 → **部署** 页面查看构建日志

---

## 本地开发

```bash
# 安装依赖
npm install

# 本地预览（需要 wrangler）
npx wrangler pages dev . --port 8788

# 测试 API
curl -X POST http://localhost:8788/api/chart \
  -H "Content-Type: application/json" \
  -d '{"year":1990,"month":5,"day":15,"hour":12,"minute":0,"gender":"male","aiMode":"none"}'
```

---

## 免责声明

本系统基于传统八字与紫微斗数理论框架，仅供文化研究与娱乐参考，不构成任何医疗、投资、婚姻、法律等决策依据。命运由个人选择与客观环境共同塑造。
