# bazi-ziwei-web

八字+紫微斗数综合命盘生成器，部署在 Cloudflare Pages。

**两种分析模式**：
- 🎴 **规则版** — 算法排盘 + 模板分析，零成本，无需任何 API Key
- 📜 **AI 长文版** — 在上述基础上调用大模型，生成深度综合印证长文（需配置 API Key）

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `AI_API_KEY` | `nvapi-xxx...` | 你的 API Key |
| `AI_PROVIDER` | `nvidia` | 可选：`nvidia` / `deepseek` / `openai` / `custom` |
| `AI_BASE_URL` | `https://integrate.api.nvidia.com/v1` | 自定义 API 地址 |
| `AI_MODEL` | `meta/llama-3.1-405b-instruct` | 模型名 |

| 提供商 | 注册地址 | 免费额度 |
|--------|---------|---------|
| **Nvidia NIM** | [build.nvidia.com](https://build.nvidia.com) | 注册送 5000 次免费调用 |
| **Groq** | [console.groq.com](https://console.groq.com) | 免费调用，有速率限制 |
| **GitHub Models** | [github.com/marketplace/models](https://github.com/marketplace/models) | 有免费额度 |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) | 充值使用（¥0.5/百万 tokens） |

**核心配置**：Cloudflare Pages 检测到 `public/` 目录 → 自动部署静态站点；`functions/` 目录 → 自动注册 Serverless Functions；`package.json` → 自动安装依赖。

---

## 免责声明

本系统基于传统八字与紫微斗数理论框架，仅供文化研究与娱乐参考，不构成任何医疗、投资、婚姻、法律等决策依据。命运由个人选择与客观环境共同塑造。
