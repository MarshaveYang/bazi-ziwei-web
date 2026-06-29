# bazi-ziwei-web

八字+紫微斗数综合命盘生成器，部署在 Cloudflare Pages。

**两种分析模式**：
- 🎴 **规则版** — 算法排盘 + 模板分析，零成本，无需任何 API Key
- 📜 **AI 长文版** — 在上述基础上调用大模型，生成深度综合印证长文（需配置 API Key）

---

## 整体架构

```
GitHub 仓库                          Cloudflare Pages
┌──────────────────┐   连接 GitHub   ┌──────────────────────┐
│ bazi-ziwei-web   │ ─────────────→  │ 代码自动同步          │
│ ├ public/        │   自动部署      │ ├ static assets     │
│ ├ functions/     │                 │ ├ Pages Functions   │
│ ├ vendor/        │                 │ └ npm install       │
│ └ package.json   │                 └──────────────────────┘
```

**用户请求流程**：
1. 用户打开 `ziwei.dumm.top` → 加载 `index.html` 表单
2. 填写生辰 → 点击生成 → POST 到 `/api/chart`
3. Pages Function 完成：排盘 → 规则分析 → 渲染海报
4. 如果提供了 API Key → 同时调用 AI 生成长文分析
5. 前端展示海报 Tab + 长文分析 Tab

---

## 准备工作

在浏览器中打开以下页面：

| 步骤 | 链接 | 说明 |
|------|------|------|
| 1. GitHub 账号 | [github.com/signup](https://github.com/signup) | 已有账号则直接登录 |
| 2. Cloudflare 账号 | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) | 免费注册 |

---

## 一、GitHub 创建仓库（全程浏览器操作）

### 1.1 新建仓库

1. 打开 [github.com/new](https://github.com/new)
2. **仓库名称**：`bazi-ziwei-web`
3. 设为 **Public**（公开，Cloudflare 免费计划只能连公开仓库）
4. 点击 **Create repository**

### 1.2 上传项目文件

在新仓库页面，点击 **add file → Upload files**，然后打开你的本地文件管理器。

将以下文件拖拽上传（共 **31 个文件**）：

```
.gitignore
package.json
README.md
public/
  index.html
  templates/
    report-zonghe-poster.html
functions/
  api/
    chart.js
vendor/
  yiqi-core/          ← 14 个 .js 文件
  bazi-enrich/        ← 8 个 .js 文件
  analysis-gen.js
  ai-prompts.js
  render.js
  run-chart.js
```

> **提示**：上传时保持目录结构不变。Cloudflare 通过 `public/`、`functions/`、`vendor/` 三个目录来识别项目结构。

上传后，页面底部填写提交信息：
```
feat: initial deploy
```
点击 **Commit changes**。

---

## 二、Cloudflare Pages 连接 GitHub（全程浏览器操作）

### 2.1 创建 Pages 项目

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → 登录
2. 左侧菜单 → **Workers 和 Pages** → **Pages**
3. 点击 **创建** → **Pages**
4. 在 **"连接到 Git"** 部分，点击 **"Continue with GitHub"**
5. 浏览器会跳转到 GitHub 授权页面 → 点击 **Authorize Cloudflare**
6. 授权后，选择你的仓库：**MarshaveYang/bazi-ziwei-web**

### 2.2 配置构建设置

在选择仓库后的配置页面，填写：

| 字段 | 值 |
|------|-----|
| 项目名称 | `bazi-ziwei` |
| 生产分支 | `main` |
| 框架预设 | **无** |
| 构建命令 | **留空** |
| 构建输出目录 | `public` |
| 根目录 | **留空** |

> **为什么构建命令留空？** 本项目不需要编译步骤。Cloudflare 会自动安装 `package.json` 中的依赖（`lunar-typescript`）并提供给 Pages Functions。

### 2.3 完成创建

点击 **保存并部署**。等待 1-2 分钟，Cloudflare 会：

1. 克隆你的 GitHub 仓库
2. 自动安装 npm 依赖（`lunar-typescript`）
3. 将 `public/` 发布为静态站点
4. 将 `functions/` 注册为 Pages Functions
5. 分配一个 `bazi-ziwei.pages.dev` 域名

部署完成后，点击 **继续处理项目** 进入项目页面。

---

## 三、首次使用验证

1. 在 Pages 项目页面，点击顶部域名（`xxx.pages.dev`）
2. 浏览器中应该看到八字生辰表单
3. 随便填一个生辰 → 点击 **生成命盘**
4. 等待几秒，应该看到海报渲染成功

> 如果页面加载但 API 报错，请检查 **二、2.2** 的构建设置是否正确。

---

## 四、绑定自定义域名

你已有域名 `dumm.top`，可以绑定子域名：

1. 进入 Pages 项目 → **自定义域名** → **设置自定义域名**
2. 输入：`ziwei.dumm.top`
3. 点击 **继续**
4. **如果 dumm.top 的 DNS 在 Cloudflare**：自动完成配置
5. **如果 DNS 在其他服务商**：根据提示添加 CNAME 记录指向 `bazi-ziwei.pages.dev`

等待 TLS 证书签发（通常 1-5 分钟），之后就可以通过 `https://ziwei.dumm.top` 访问了。

> Cloudflare 的 TLS 证书是自动管理的，无需手动续期。

---

## 五、AI API Key 设置（可选）

如需 AI 长文分析，需要配置 API Key。Cloudflare Pages 提供了**环境变量**来做这件事。

### 5.1 设置全局 API Key

1. 进入 Pages 项目 → **设置** → **环境变量**
2. **添加生产环境变量**，添加以下变量：

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `AI_API_KEY` | `nvapi-xxx...` | 你的 API Key |
| `AI_PROVIDER` | `nvidia` | 可选：`nvidia` / `deepseek` / `openai` / `custom` |
| `AI_BASE_URL` | `https://integrate.api.nvidia.com/v1` | 自定义 API 地址 |
| `AI_MODEL` | `meta/llama-3.1-405b-instruct` | 模型名 |

3. **保存**后，点击 **部署 → 重新部署** 使环境变量生效

### 5.2 免费 AI 提供商

| 提供商 | 注册地址 | 免费额度 |
|--------|---------|---------|
| **Nvidia NIM** | [build.nvidia.com](https://build.nvidia.com) | 注册送 5000 次免费调用 |
| **Groq** | [console.groq.com](https://console.groq.com) | 免费调用，有速率限制 |
| **GitHub Models** | [github.com/marketplace/models](https://github.com/marketplace/models) | 有免费额度 |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | 充值使用（¥0.5/百万 tokens） |

### 5.3 用户自行传入 Key

如果不想全局设置，用户也可以在页面上：
1. 点击 ⚙️ **AI 长文分析设置** 展开
2. 选择提供商
3. 粘贴自己的 API Key
4. 生成的请求中会带上这个 Key，不留存在服务器

---

## 六、更新代码

这是 GitHub 自动部署最大的好处：**只需更新 GitHub 仓库，Cloudflare 自动重新部署**。

### 网页端更新（最快）

1. 打开 `github.com/MarshaveYang/bazi-ziwei-web`
2. 找到要修改的文件 → 点击 ✏️ 编辑
3. 修改后填写提交信息 → **Commit changes**
4. Cloudflare Pages 自动检测到变更 → 自动构建部署
5. 1-2 分钟后访问页面，已是最新版本

### 批量更新

1. 在仓库页面点击 **Add file → Upload files**
2. 上传需要替换的文件
3. 提交

### 查看部署状态

进入 Cloudflare Pages 项目 → **部署** 页面，可以看到每次部署的记录：
- 🟢 绿色：部署成功
- 🟡 黄色：部署中
- 🔴 红色：部署失败（点进去看日志）

---

## 七、环境变量管理

### 查看/修改环境变量

1. Cloudflare Pages → 项目 → **设置** → **环境变量**
2. 可以随时增删改
3. 修改后必须 **重新部署** 才生效

### 环境变量建议

| 变量 | 建议值 |
|------|--------|
| `AI_PROVIDER` | `nvidia`（免费，分析质量好） |
| `AI_MODEL` | `meta/llama-3.1-405b-instruct` |
| `AI_BASE_URL` | 不填则用默认 |

---

## 八、注意事项

### 免费额度

| 资源 | Cloudflare 免费额度 |
|------|-------------------|
| Pages 请求 | 10 万/天 — 个人使用绰绰有余 |
| Functions | 10 万/天 — 每次生成消耗 1 次 |
| npm 依赖 | 自动安装，无额外费用 |

### 已知限制

- AI 分析会增加响应时间（15-30 秒），海报生成不受影响
- 规则分析版本不需要调用任何外部 API，响应 < 1 秒
- 仅支持公历（阳历）日期输入，如需农历可自己转换
- 数据分析基于算法层，无 AI 时分析文字是模板化的

---

## 项目文件说明

```
bazi-ziwei-web/                    ← GitHub 仓库根目录
├── public/                        ← 静态资源 → Cloudflare Pages
│   ├── index.html                 ★ 生辰输入表单
│   └── templates/
│       └── report-zonghe-poster.html  ★ 海报模板
├── functions/
│   └── api/
│       └── chart.js               ★★ 核心：排盘 + 分析 + AI + 渲染
├── vendor/                        ★ 排盘算法模块
│   ├── yiqi-core/                  八字+紫微核心算法
│   ├── bazi-enrich/                格局/旺衰/调候补层
│   ├── analysis-gen.js             规则分析生成器
│   ├── ai-prompts.js               AI 提示词 + 文本转换
│   ├── render.js                   渲染工具（参考）
│   └── run-chart.js                排盘入口
├── package.json                   ★ npm 依赖声明（lunar-typescript）
├── .gitignore
└── README.md                      本文件
```

**核心配置**：Cloudflare Pages 检测到 `public/` 目录 → 自动部署静态站点；`functions/` 目录 → 自动注册 Serverless Functions；`package.json` → 自动安装依赖。

---

## 免责声明

本系统基于传统八字与紫微斗数理论框架，仅供文化研究与娱乐参考，不构成任何医疗、投资、婚姻、法律等决策依据。命运由个人选择与客观环境共同塑造。
