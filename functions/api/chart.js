/**
 * Cloudflare Pages Function — POST /api/chart
 *
 * 输入: { year, month, day, hour, minute, gender, aiProvider?, aiApiKey?, aiBaseUrl?, aiModel? }
 * 输出: {
 *   html: "海报 HTML",
 *   analysisMd: "长文分析 Markdown (如提供 API Key)",
 *   chart: "排盘关键数据摘要"
 * }
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
export function getShiShen(dm, g) { return SHI_SHEN_MAP[dm]?.[g] || ""; }
export function getYearGanZhi(year) { const gs=["庚","辛","壬","癸","甲","乙","丙","丁","戊","己"], zs=["申","酉","戌","亥","子","丑","寅","卯","辰","巳","午","未"]; return gs[year%10]+zs[year%12]; }
export function calcBarPct(v) { return {0:"0",1:"12",2:"25",3:"40",4:"55",5:"72",6:"88",7:"100"}[v] || String(Math.min(100,v*15)); }

// ======== 海报渲染 ========
export function renderPoster(template, chart, analysis) {
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
  const wxs=en?.五行旺相||{}; for(const e of["木","火","土","金","水"]) data["core.yueling."+e]=wxs[e]||"-";
  const wStat=en?.五行统计?.surface||en?.五行统计||{}; for(const e of["木","火","土","金","水"]) { data["core.wuxing."+e]=String(wStat[e]??0); data["core.wuxing_pct."+e]=calcBarPct(wStat[e]??0); }

  // 四柱
  const sz=bz.siZhu||{}, CG=bz.cangGan||{};
  for(const[k,l]of Object.entries({year:"年",month:"月",day:"日",hour:"时"})){const p=sz[k]||{}; data["bazi."+k+".gan"]=p.gan||"-";data["bazi."+k+".zhi"]=p.zhi||"-";data["bazi."+k+".naYin"]=bz.naYin?.[k]||"-";data["bazi."+k+".shiShen"]=bz.shiShen?.[k]||"";data["bazi."+k+".zhangSheng"]=bz.zhangSheng?.[k]||"-";data["bazi."+k+".ziZuo"]=en?.自坐?.[k]||"-";const cg=CG[k]||[];data["bazi."+k+".cangGanHtml"]=cg.map((g,i)=>i===0?g+"<small>"+getShiShen(bz.dayMaster,g)+"</small>":g+"<small>"+getShiShen(bz.dayMaster,g)+"</small>").join("")||"-";}
  data["bazi.dayunStart"]=String(bz.dayunStart??0);

  // 十二宫
  for(let i=0;i<zw.gongs.length;i++){const g=zw.gongs[i];if(!g)continue;const dz=g.dizhi;data["gongs."+dz+".name"]=g.gong;data["gongs."+dz+".ganzhi"]=(g.tiangan||"")+(g.dizhi||"");data["gongs."+dz+".mainStarsHtml"]=(g.mainStars||[]).map(s=>{const h=(g.sihua||[]).find(x=>x.star===s);return h?s+"<small>"+h.hua+"</small>":s;}).join(" ")||"无主星";data["gongs."+dz+".auxStars"]=(g.auxStars||[]).join(" ");data["gongs."+dz+".smallStars"]="";data["gongs."+dz+".daxian_range"]=g.daXian?g.daXian.startAge+"-"+g.daXian.endAge:"";data["gongs."+dz+".flag"]=g.daXian?.isCurrent?"★":"";data["gongs."+dz+".shenBadge"]=i===zw.shenGongIndex?"身":"";}

  // 大运+流年
  const dayun=bz.dayun||[];
  for(let i=0;i<Math.min(10,dayun.length);i++){const d=dayun[i];const as=(bz.dayunStart||1)+i*10;data["dayun."+i+".gz"]=(d.ganZhi?.gan||"")+(d.ganZhi?.zhi||"");data["dayun."+i+".shishen"]=(d.ganShiShen||"")+"/"+(d.zhiShiShen||"");data["dayun."+i+".age_range"]=as+"-"+(as+9);data["dayun."+i+".current_class"]=(d.startYear<=currentYear&&d.endYear>=currentYear)?"current":"";}
  data["liunian_dayun_label"]="大运：乙丑（七杀/比肩）";
  for(let i=0;i<10;i++){const y=currentYear-4+i;data["liunian."+i+".year"]=String(y);data["liunian."+i+".age"]=String(y-bi.year+1);data["liunian."+i+".current_class"]=y===currentYear?"current":"";const ygz=getYearGanZhi(y);data["liunian."+i+".gz"]=ygz;data["liunian."+i+".shishen"]=getShiShen(bz.dayMaster,ygz[0]);}

  // section_02
  for(let i=0;i<Math.min(7,dayun.length);i++){const d=dayun[i];const as=(bz.dayunStart||1)+i*10;data["section_02.bazi."+i+".range"]=as+"-"+(as+9)+"岁";data["section_02.bazi."+i+".gz"]=(d.ganZhi?.gan||"")+(d.ganZhi?.zhi||"");data["section_02.bazi."+i+".shishen"]=(d.ganShiShen||"")+"/"+(d.zhiShiShen||"");data["section_02.bazi."+i+".current_class"]=(d.startYear<=currentYear&&d.endYear>=currentYear)?"current":"";}
  for(let i=0;i<Math.min(7,zw.gongs.length);i++){const g=zw.gongs[i];data["section_02.ziwei."+i+".range"]=g?.daXian?g.daXian.startAge+"-"+g.daXian.endAge+"岁":"";data["section_02.ziwei."+i+".current_class"]=g?.daXian?.isCurrent?"current":"";}

  // 分析数据
  const a=analysis;
  if(a.meta){data["meta.archetype_name"]=a.meta.archetype_name||"";data["meta.axis_oneliner"]=a.meta.axis_oneliner||"";}
  if(a.axes){data["axes.bazi_main"]=a.axes.bazi_main||"";data["axes.ziwei_main"]=a.axes.ziwei_main||"";}
  data["ziwei.consistency"]=a.consistency||"";
  for(let i=0;i<3;i++){const s=a.strengths?.[i]||{};data["strengths."+i+".title"]=s.title||"";data["strengths."+i+".desc"]=s.desc||"";const w=a.weaknesses?.[i]||{};data["weaknesses."+i+".title"]=w.title||"";data["weaknesses."+i+".desc"]=w.desc||"";}
  data["section_01.text"]=a.section_01?.text||"";data["section_01.word_count"]=String(a.section_01?.word_count??0);data["section_02.conclusion"]=a.section_02?.conclusion||"";
  for(const k of["career","wealth","marriage","children","family","health"]){const d=a.dim?.[k]||{};data["dim."+k+".bazi"]=d.bazi||"";data["dim."+k+".ziwei"]=d.ziwei||"";data["dim."+k+".verdict"]=d.verdict||"";data["dim."+k+".verdict_class"]=d.verdict_class||"verdict-yes";data["dim."+k+".fused"]=d.fused||"";}
  for(let i=0;i<3;i++){const c=a.conflicts?.[i]||{};for(const f of["point","bazi","ziwei","impact","impact_class","advice"])data["conflicts."+i+"."+f]=c[f]!==undefined?String(c[f]):"";}
  if(a.final){data["final.life_axis"]=a.final.life_axis||"";for(let i=0;i<5;i++){const n=a.final.nodes?.[i]||{};data["final.nodes."+i+".age"]=n.age!==undefined?String(n.age):"";data["final.nodes."+i+".year"]=n.year!==undefined?String(n.year):"";data["final.nodes."+i+".event"]=n.event||"";}for(let i=0;i<3;i++){const r=a.final.risks?.[i]||{};data["final.risks."+i+".range"]=r.range||"";data["final.risks."+i+".desc"]=r.desc||"";}for(let i=0;i<2;i++){const l=a.final.leverage?.[i]||{};data["final.leverage."+i+".title"]=l.title||"";data["final.leverage."+i+".desc"]=l.desc||"";}for(let i=0;i<4;i++)data["final.advice."+i]=a.final.advice?.[i]||"";}
  if(a.confidence){for(const k of["bazi","ziwei","consistency","stability"]){data["confidence."+k+"_level"]=a.confidence[k+"_level"]||"";data["confidence."+k+"_score"]=a.confidence[k+"_score"]!==undefined?String(a.confidence[k+"_score"]):"";}data["confidence.note"]=a.confidence.note||"";}

  // 替换
  let html = template;
  for(const[k,v]of Object.entries(data)){const re=new RegExp("\\{\\{"+k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\}\\}","g");html=html.replace(re,String(v??""));}
  html = html.replace(/\{\{[a-zA-Z0-9_.]+\}\}/g, "-");
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
export function doChart(birthInfo) {
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
    const { year, month, day, hour, minute, gender, aiProvider, aiApiKey, aiBaseUrl, aiModel } = body;

    if (!year || !month || !day || hour===undefined || minute===undefined || !gender) {
      return new Response(JSON.stringify({ error: "缺少必填参数" }), { status: 400, headers: { "Content-Type": "application/json;charset=utf-8" } });
    }

    // 解析 API Key 优先级: 请求体 > 环境变量
    const resolvedApiKey = aiApiKey || env.AI_API_KEY || "";
    const resolvedProvider = aiProvider || env.AI_PROVIDER || "deepseek";
    const resolvedBaseUrl = aiBaseUrl || env.AI_BASE_URL || "";
    const resolvedModel = aiModel || env.AI_MODEL || "";

    const birthInfo = {
      year: parseInt(year), month: parseInt(month), day: parseInt(day),
      hour: parseInt(hour), minute: parseInt(minute),
      gender: (gender==="男"||gender==="male")?"male":"female",
      isLunar: false, timeZone: 8
    };

    // 排盘
    const chart = doChart(birthInfo);

    // 规则分析 + 海报渲染
    const analysis = generateAnalysis(chart);
    let template;
    try {
      const tplResp = await env.ASSETS.fetch(new URL("/templates/report-zonghe-poster.html", request.url));
      template = await tplResp.text();
    } catch {
      return new Response(JSON.stringify({ error: "模板加载失败" }), { status: 500, headers: { "Content-Type": "application/json;charset=utf-8" } });
    }
    const html = renderPoster(template, chart, analysis);

    // AI 长文分析 (如有 API Key)
    let analysisMd = "";
    if (resolvedApiKey) {
      try {
        const currentYear = new Date().getFullYear();
        const chartText = chartToText(chart);
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(chartText, birthInfo, currentYear);
        analysisMd = await callAiApi(resolvedProvider, resolvedApiKey, resolvedBaseUrl, resolvedModel, systemPrompt, userPrompt);
      } catch (aiErr) {
        analysisMd = "⚠️ AI 分析失败: " + aiErr.message;
      }
    }

    // 排盘摘要
    const en = chart.bazi.enrichment;
    const summary = {
      dayMaster: chart.bazi.dayMaster,
      siZhu: chart.bazi.siZhu,
      geju: en?.格局?.primary || "",
      wangshuai: en?.旺衰?.verdict || "",
      tiaohou: (en?.调候用神||[]).join(","),
      mingGong: chart.ziwei.gongs[chart.ziwei.mingGongIndex]?.gong + " " + (chart.ziwei.gongs[chart.ziwei.mingGongIndex]?.mainStars||[]).join(" "),
    };

    return new Response(JSON.stringify({ html, analysisMd, chart: summary }), {
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
