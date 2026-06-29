/**
 * Cloudflare Pages Function — POST /api/chart
 *
 * 输入: { year, month, day, hour, minute, gender, aiMode?, aiProvider?, aiApiKey?, aiBaseUrl?, aiModel? }
 * aiMode: "none"(默认) | "site"(用环境变量) | "custom"(用请求体Key)
 * 输出: { html: "完整海报 HTML(含AI分析如有)" }
 */

import { createChart } from "../_vendor/yiqi-core/index.js";
import { enrichBazi } from "../_vendor/bazi-enrich/enrich.js";
import { generateAnalysis } from "../_vendor/analysis-gen.js";
import { buildSystemPrompt, buildUserPrompt, chartToText } from "../_vendor/ai-prompts.js";

// ======== 常量 ========
const DIZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const MING_ZHU = {子:"贪狼",丑:"巨门",寅:"禄存",卯:"文曲",辰:"廉贞",巳:"武曲",午:"破军",未:"武曲",申:"廉贞",酉:"文曲",戌:"禄存",亥:"巨门"};
const SHEN_ZHU = {子:"火星",丑:"天相",寅:"天梁",卯:"天同",辰:"文昌",巳:"天机",午:"火星",未:"天相",申:"天梁",酉:"天同",戌:"文昌",亥:"天机"};
const SHI_SHEN_MAP = {甲:{甲:"比肩",乙:"劫财",丙:"食神",丁:"伤官",戊:"偏财",己:"正财",庚:"七杀",辛:"正官",壬:"偏印",癸:"正印"},乙:{甲:"劫财",乙:"比肩",丙:"伤官",丁:"食神",戊:"正财",己:"偏财",庚:"正官",辛:"七杀",壬:"正印",癸:"偏印"},丙:{甲:"偏印",乙:"正印",丙:"比肩",丁:"劫财",戊:"食神",己:"伤官",庚:"偏财",辛:"正财",壬:"七杀",癸:"正官"},丁:{甲:"正印",乙:"偏印",丙:"劫财",丁:"比肩",戊:"伤官",己:"食神",庚:"正财",辛:"偏财",壬:"正官",癸:"七杀"},戊:{甲:"七杀",乙:"正官",丙:"偏印",丁:"正印",戊:"比肩",己:"劫财",庚:"食神",辛:"伤官",壬:"偏财",癸:"正财"},己:{甲:"正官",乙:"七杀",丙:"正印",丁:"偏印",戊:"劫财",己:"比肩",庚:"伤官",辛:"食神",壬:"正财",癸:"偏财"},庚:{甲:"偏财",乙:"正财",丙:"七杀",丁:"正官",戊:"偏印",己:"正印",庚:"比肩",辛:"劫财",壬:"食神",癸:"伤官"},辛:{甲:"正财",乙:"偏财",丙:"正官",丁:"七杀",戊:"正印",己:"偏印",庚:"劫财",辛:"比肩",壬:"伤官",癸:"食神"},壬:{甲:"食神",乙:"伤官",丙:"偏财",丁:"正财",戊:"七杀",己:"正官",庚:"偏印",辛:"正印",壬:"比肩",癸:"劫财"},癸:{甲:"伤官",乙:"食神",丙:"正财",丁:"偏财",戊:"正官",己:"七杀",庚:"正印",辛:"偏印",壬:"劫财",癸:"比肩"}};
const PROVIDERS = {
  nvidia:   { baseUrl: "https://integrate.api.nvidia.com/v1",       model: "meta/llama-3.1-405b-instruct" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1",               model: "deepseek-chat" },
  openai:   { baseUrl: "https://api.openai.com/v1",                 model: "gpt-4o-mini" },
};

// ======== 工具函数 ========
function getShiShen(dm, g) { return SHI_SHEN_MAP[dm]?.[g] || ""; }
function getYearGanZhi(year) { const gs=["庚","辛","壬","癸","甲","乙","丙","丁","戊","己"], zs=["申","酉","戌","亥","子","丑","寅","卯","辰","巳","午","未"]; return gs[year%10]+zs[year%12]; }
function calcBarPct(v) { return {0:"0",1:"12",2:"25",3:"40",4:"55",5:"72",6:"88",7:"100"}[v] || String(Math.min(100,v*15)); }

// ======== Markdown → HTML(简易) ========
function renderMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/置信度[：:]\s*高/g, '<span class="confidence-high">置信度：高</span>')
    .replace(/置信度[：:]\s*中/g, '<span class="confidence-mid">置信度：中</span>')
    .replace(/置信度[：:]\s*低/g, '<span class="confidence-low">置信度：低</span>')
    .replace(/^(\d+)\.\s(.+)$/gm, '<li>$1. $2</li>')
    .replace(/^-\s(.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}

// ======== 海报渲染 ========
function renderPoster(template, chart, analysis, aiAnalysisMd) {
  const data = {};
  const currentYear = new Date().getFullYear();
  const bi = chart.bazi.birthInfo, bz = chart.bazi, zw = chart.ziwei, en = bz.enrichment;

  // META
  data["meta.solar_date"] = bi.year+"-"+String(bi.month).padStart(2,"0")+"-"+String(bi.day).padStart(2,"0")+" "+String(bi.hour).padStart(2,"0")+":"+String(bi.minute).padStart(2,"0");
  data["meta.lunar_date"] = zw.lunarDate ? zw.lunarDate.year+"年"+(zw.lunarDate.monthCn||"")+"月"+(zw.lunarDate.dayCn||"") : "-";
  data["meta.gender_full"] = (bi.gender==="male"?"男":"女")+"（"+(zw.yinYang||"")+"）";
  data["meta.yinyang"] = zw.yinYang || "-";
  data["meta.age_virtual"] = String(currentYear-bi.year+1);
  data["meta.current_year"] = String(currentYear);
  const n=new Date();
  data["meta.gen_time"] = n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0")+" "+String(n.getHours()).padStart(2,"0")+":"+String(n.getMinutes()).padStart(2,"0");

  // ZIWEI META
  data["ziwei.ming_zhu"] = MING_ZHU[zw.gongs[0]?.dizhi]||"-";
  data["ziwei.shen_zhu"] = SHEN_ZHU[DIZHI[zw.shenGongIndex]]||"-";
  data["ziwei.zi_dou_jun"] = zw.ziDouJun||"-";
  data["ziwei.wuxing_ju"] = zw.wuXingJu?.name||"-";

  // CORE
  data["core.geju"] = en?.格局?.primary||"-"; data["core.geju_confidence"] = en?.格局?.confidence||"-";
  data["core.wangshuai_verdict"] = en?.旺衰?.verdict||"-"; data["core.wangshuai_score"] = String(en?.旺衰?.score??0);
  const ws=en?.旺衰?.score??0; data["core.wangshuai_pos_pct"] = String(Math.max(0,Math.min(100,Math.round((ws+10)*5))));
  const tc=en?.调候用神||[]; data["core.tiaohou.0"]=tc[0]||"-"; data["core.tiaohou.1"]=tc[1]||"-"; data["core.tiaohou_confidence"]="高";

  // SIZHU
  for (const p of ["year","month","day","hour"]) {
    const s = bz.siZhu[p];
    data["sizhu."+p+".gan"]=s.gan||"-"; data["sizhu."+p+".zhi"]=s.zhi||"-";
    data["sizhu."+p+".nayin"]=s.nayin||"-"; data["sizhu."+p+".cangGan"]=(s.cangGan||[]).map(c=>c.gan||c).join(",");
    data["sizhu."+p+".shishen"]=getShiShen(bz.dayMaster, s.gan);
    data["sizhu."+p+".changSheng"]=s.changSheng||"-";
  }

  // SHENG KE
  const sc = analysis.shengKe || {};
  data["shengke.wood"]=String(sc["木"]||0); data["shengke.fire"]=String(sc["火"]||0); data["shengke.earth"]=String(sc["土"]||0);
  data["shengke.metal"]=String(sc["金"]||0); data["shengke.water"]=String(sc["水"]||0);
  data["shengke.wood_pct"]=calcBarPct(sc["木"]||0); data["shengke.fire_pct"]=calcBarPct(sc["火"]||0);
  data["shengke.earth_pct"]=calcBarPct(sc["土"]||0); data["shengke.metal_pct"]=calcBarPct(sc["金"]||0);
  data["shengke.water_pct"]=calcBarPct(sc["水"]||0);

  // ENRICH
  const zz = en?.整柱||[]; for (let i=0;i<4;i++) { const z=zz[i]; const p=["年","月","日","时"][i]; data["enrich.whole."+p]=z?.verdict||"-"; }
  const tr = en?.天干关系||[]; data["enrich.gan_relations"] = tr.map(r=>r.type).join(",") || "-";
  const zr = en?.地支关系||[]; data["enrich.zhi_relations"] = zr.map(r=>r.type).join(",") || "-";

  // ANALYSIS
  const dims = analysis.dims || [];
  for (const d of dims) {
    const key = d.key || "unknown";
    data["analysis."+key+".bazi"]=d.bazi||""; data["analysis."+key+".ziwei"]=d.ziwei||"";
    data["analysis."+key+".verdict"]=d.verdict||""; data["analysis."+key+".verdict_class"]=d.verdict_class||"";
    data["analysis."+key+".fused"]=d.fused||"";
  }
  const conflicts = analysis.conflicts || [];
  data["analysis.conflict_count"]=String(conflicts.length);
  for (let i=0;i<Math.min(conflicts.length,6);i++) {
    const c=conflicts[i];
    data["analysis.conflict."+i+".point"]=c.point||""; data["analysis.conflict."+i+".bazi"]=c.bazi||"";
    data["analysis.conflict."+i+".ziwei"]=c.ziwei||""; data["analysis.conflict."+i+".impact"]=c.impact||"";
    data["analysis.conflict."+i+".impact_class"]=c.impact_class||""; data["analysis.conflict."+i+".advice"]=c.advice||"";
  }

  // ZIWEI GONGS
  for (const g of zw.gongs) {
    const gi = g.gong || String(g.index);
    data["ziwei."+gi+".mainStars"]=(g.mainStars||[]).join(" ");
    data["ziwei."+gi+".auxStars"]=(g.auxStars||[]).join(" ");
    data["ziwei."+gi+".sihua"]=(g.sihua||[]).map(s=>s.hua||"").join(" ");
    data["ziwei."+gi+".dizhi"]=DIZHI[g.dizhiIndex]||"-";
  }

  data["ziwei.mingGong"] = zw.gongs[zw.mingGongIndex]?.gong || "-";
  data["ziwei.shenGong"] = DIZHI[zw.shenGongIndex] || "-";

  // DAYUN
  const dy = zw.dayun || [];
  data["dayun.count"] = String(dy.length);
  const nowY = new Date().getFullYear(); let dyIdx = -1;
  for (let i=0;i<dy.length;i++) { if (dy[i].startYear<=nowY && dy[i].endYear>=nowY) { dyIdx=i; break; } }
  data["dayun.current"] = dyIdx>=0 ? (dy[dyIdx].ganZhi?.gan||"")+(dy[dyIdx].ganZhi?.zhi||"") : "-";

  // DAXIAN
  const dx = zw.daxian || [];
  data["daxian.count"] = String(dx.length);
  let dxIdx = -1;
  for (let i=0;i<dx.length;i++) { if (dx[i].startAge<=data["meta.age_virtual"] && dx[i].endAge>=data["meta.age_virtual"]) { dxIdx=i; break; } }
  if (dxIdx>=0) { data["daxian.current"] = (dx[dxIdx].gong||"")+" "+DIZHI[dx[dxIdx].dizhiIndex||0]; } else { data["daxian.current"] = "-"; }

  // 渲染模板
  let html = template;
  for (const [k,v] of Object.entries(data)) {
    html = html.replace(new RegExp("\\{\\{"+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"\\}\\}","g"), String(v||""));
  }
  html = html.replace(/\{\{[a-zA-Z0-9_.]+\}\}/g, "-");

  // 如果有 AI 分析，插入到海报底部
  if (aiAnalysisMd) {
    const aiHtml = `
<div style="margin: 40px 0 20px; padding: 24px 20px; background: #faf6ec; border: 1px solid #c4bdb0; border-radius: 8px;">
  <h2 style="font-size: 20px; color: #8b2f1e; letter-spacing: 3px; text-align: center; margin-bottom: 20px; border-bottom: 1px solid #e0d9c8; padding-bottom: 10px;">🤖 AI 深度综合分析</h2>
  <div class="analysis-content" style="line-height: 1.9; font-size: 14px;">
    ${renderMarkdown(aiAnalysisMd)}
  </div>
</div>`;
    html = html.replace("</body>", aiAnalysisMd ? aiHtml + "</body>" : "</body>");
    // 也插入分析样式
    const aiCss = `
.ai-section { margin: 40px 0 20px; padding: 24px 20px; background: var(--paper-card,#faf6ec); border: 1px solid var(--line,#c4bdb0); border-radius: 8px; }
.ai-section h2 { font-size: 20px; color: var(--vermillion-deep,#8b2f1e); text-align:center; letter-spacing:3px; margin-bottom:20px; border-bottom: 1px solid var(--line,#e0d9c8); padding-bottom: 10px; }
.analysis-content { line-height:1.9; font-size:14px; }
.analysis-content h1,.analysis-content h2,.analysis-content h3 { color: var(--vermillion,#8b2f1e); margin: 16px 0 8px; }
.analysis-content h2 { font-size: 18px; border-bottom: 1px solid var(--line,#e0d9c8); padding-bottom: 4px; }
.analysis-content h3 { font-size: 15px; }
.analysis-content p { margin: 8px 0; }
.analysis-content hr { border: none; border-top: 1px solid var(--line,#e0d9c8); margin: 16px 0; }
.analysis-content blockquote { border-left: 3px solid var(--line,#c4bdb0); padding-left: 12px; color: var(--ink-soft,#6b6660); margin: 8px 0; }
.confidence-high { color: #4a7c4e; }
.confidence-mid { color: #c97c3a; }
.confidence-low { color: #c1432f; }
`;
    html = html.replace("</head>", "<style>" + aiCss + "</style></head>");
  }

  return html;
}

// ======== AI API 调用 ========
async function callAiApi(provider, apiKey, baseUrl, model, systemPrompt, userPrompt) {
  const url = (baseUrl || PROVIDERS[provider]?.baseUrl || "https://api.deepseek.com/v1") + "/chat/completions";
  const useModel = model || PROVIDERS[provider]?.model || "deepseek-chat";

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: useModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 8192,
      stream: false
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI API 调用失败 (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

// ======== 执行排盘 ========
function doChart(birthInfo) {
  const raw = createChart(birthInfo);
  const sia = { '年': raw.bazi.siZhu.year, '月': raw.bazi.siZhu.month, '日': raw.bazi.siZhu.day, '时': raw.bazi.siZhu.hour };
  raw.bazi.enrichment = enrichBazi(sia);
  raw.bazi.dayMaster = raw.bazi.siZhu.day.gan;
  raw.bazi.cangGan = {};
  for (const [ek,ck] of [['year','年'],['month','月'],['day','日'],['hour','时']]) {
    raw.bazi.cangGan[ek] = (raw.bazi.siZhu[ek].cangGan||[]).map(g => g.gan||g);
  }
  return raw;
}

// ======== 处理入口 ========
async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "仅支持 POST" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await request.json();
    const { year, month, day, hour, minute, gender, aiMode, aiProvider, aiApiKey, aiBaseUrl, aiModel } = body;

    if (!year || !month || !day || hour===undefined || minute===undefined || !gender) {
      return new Response(JSON.stringify({ error: "缺少必填参数" }), { status: 400, headers: { "Content-Type": "application/json;charset=utf-8" } });
    }

    const mode = aiMode || "none";

    // 解析 AI Key
    let resolvedApiKey = "", resolvedProvider = "deepseek", resolvedBaseUrl = "", resolvedModel = "";
    if (mode === "site") {
      resolvedApiKey = env.AI_API_KEY || "";
      resolvedProvider = env.AI_PROVIDER || "deepseek";
      resolvedBaseUrl = env.AI_BASE_URL || "";
      resolvedModel = env.AI_MODEL || "";
    } else if (mode === "custom") {
      resolvedApiKey = aiApiKey || "";
      resolvedProvider = aiProvider || "deepseek";
      resolvedBaseUrl = aiBaseUrl || "";
      resolvedModel = aiModel || "";
    }

    const birthInfo = {
      year: parseInt(year), month: parseInt(month), day: parseInt(day),
      hour: parseInt(hour), minute: parseInt(minute),
      gender: (gender==="男"||gender==="male")?"male":"female",
      isLunar: false, timeZone: 8
    };

    // 排盘 + 规则分析
    const chart = doChart(birthInfo);
    const analysis = generateAnalysis(chart);
    let template;
    try {
      const tplResp = await env.ASSETS.fetch(new URL("/templates/report-zonghe-poster.html", request.url));
      template = await tplResp.text();
    } catch {
      return new Response(JSON.stringify({ error: "模板加载失败" }), { status: 500, headers: { "Content-Type": "application/json;charset=utf-8" } });
    }

    // AI 长文分析
    let aiAnalysisMd = "";
    if (resolvedApiKey) {
      try {
        const currentYear = new Date().getFullYear();
        const chartText = chartToText(chart);
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(chartText, birthInfo, currentYear);
        aiAnalysisMd = await callAiApi(resolvedProvider, resolvedApiKey, resolvedBaseUrl, resolvedModel, systemPrompt, userPrompt);
      } catch (aiErr) {
        aiAnalysisMd = "⚠️ AI 分析失败: " + aiErr.message;
      }
    }

    // 渲染海报（AI 分析会嵌入海报底部）
    const html = renderPoster(template, chart, analysis, aiAnalysisMd);

    return new Response(JSON.stringify({ html }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });

  } catch (err) {
    console.error("chart error:", err);
    return new Response(JSON.stringify({ error: "排盘失败: " + err.message }), {
      status: 500, headers: { "Content-Type": "application/json;charset=utf-8" }
    });
  }
}

export { onRequest };
