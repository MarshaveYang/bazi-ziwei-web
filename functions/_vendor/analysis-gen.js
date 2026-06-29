/**
 * 分析 JSON 生成器（完全规则驱动，不依赖 LLM）
 * CommonJS 版本，供 Pages Function require
 *
 * 输入: chart JSON (排盘算法层输出)
 * 输出: 符合 poster 模板 analysis.schema 的 JSON
 */

const GAN_WUXING = {甲:"木",乙:"木",丙:"火",丁:"火",戊:"土",己:"土",庚:"金",辛:"金",壬:"水",癸:"水"};

function getShiShen(dayMaster, gan) {
  const MAP = {甲:{甲:"比肩",乙:"劫财",丙:"食神",丁:"伤官",戊:"偏财",己:"正财",庚:"七杀",辛:"正官",壬:"偏印",癸:"正印"},乙:{甲:"劫财",乙:"比肩",丙:"伤官",丁:"食神",戊:"正财",己:"偏财",庚:"正官",辛:"七杀",壬:"正印",癸:"偏印"},丙:{甲:"偏印",乙:"正印",丙:"比肩",丁:"劫财",戊:"食神",己:"伤官",庚:"偏财",辛:"正财",壬:"七杀",癸:"正官"},丁:{甲:"正印",乙:"偏印",丙:"劫财",丁:"比肩",戊:"伤官",己:"食神",庚:"正财",辛:"偏财",壬:"正官",癸:"七杀"},戊:{甲:"七杀",乙:"正官",丙:"偏印",丁:"正印",戊:"比肩",己:"劫财",庚:"食神",辛:"伤官",壬:"偏财",癸:"正财"},己:{甲:"正官",乙:"七杀",丙:"正印",丁:"偏印",戊:"劫财",己:"比肩",庚:"伤官",辛:"食神",壬:"正财",癸:"偏财"},庚:{甲:"偏财",乙:"正财",丙:"七杀",丁:"正官",戊:"偏印",己:"正印",庚:"比肩",辛:"劫财",壬:"食神",癸:"伤官"},辛:{甲:"正财",乙:"偏财",丙:"正官",丁:"七杀",戊:"正印",己:"偏印",庚:"劫财",辛:"比肩",壬:"伤官",癸:"食神"},壬:{甲:"食神",乙:"伤官",丙:"偏财",丁:"正财",戊:"七杀",己:"正官",庚:"偏印",辛:"正印",壬:"比肩",癸:"劫财"},癸:{甲:"伤官",乙:"食神",丙:"正财",丁:"偏财",戊:"正官",己:"七杀",庚:"正印",辛:"偏印",壬:"劫财",癸:"比肩"}};
  return MAP[dayMaster]?.[gan] || "";
}

function findGong(gongs, name) {
  return gongs.find(g => g.gong === name);
}

function scoreToLevel(s) {
  if (s >= 0.85) return "高";
  if (s >= 0.75) return "中高";
  if (s >= 0.60) return "中";
  if (s >= 0.45) return "中低";
  return "低";
}

function generateAnalysis(chart) {
  const bazi = chart.bazi;
  const ziwei = chart.ziwei;
  const gongs = ziwei.gongs;
  const en = bazi.enrichment;
  const dayMaster = bazi.dayMaster;
  const currentYear = new Date().getFullYear();
  const birthYear = bazi.birthInfo.year;

  const currentDaxianGong = gongs.find(g => g.daXian?.isCurrent);
  const mingGong = gongs[ziwei.mingGongIndex];
  const shenGong = gongs[ziwei.shenGongIndex];
  const geju = en?.格局?.primary || "";
  const wangshuai = en?.旺衰?.verdict || "";
  const tiaohou = (en?.调候用神 || []).join("、");
  const wxs = en?.五行统计?.withCangGan || en?.五行统计?.surface || {};
  const strongest = Object.entries(wxs).sort((a,b) => b[1]-a[1])[0]?.[0] || "土";
  const weakest = Object.entries(wxs).sort((a,b) => a[1]-b[1])[0]?.[0] || "水";

  // Meta
  const mingStar = mingGong?.mainStars?.[0] || "";
  const mingSihua = mingGong?.sihua?.map(s => s.hua).join("") || "";
  const archetypeName = (mingStar + (mingSihua ? (mingSihua[0] === "化" ? mingSihua : "化" + mingSihua) : "") + "的" + geju.replace("格","")).slice(0, 7) || (dayMaster + "日主偏印格").slice(0, 7);

  // Axes
  const baziMain = (dayMaster + "日" + geju + "，" + wangshuai + "，调候用" + tiaohou + "。").slice(0, 45);
  const mingStars = mingGong?.mainStars?.join(" ") || "";
  const shenStars = shenGong?.mainStars?.length ? shenGong.mainStars.join(" ") : "空宫";
  const ziweiMain = ("命宫" + mingStars + (mingSihua ? " " + mingGong.sihua.map(s => s.star + s.hua).join(" ") : "") + "，身宫" + shenStars + "立身。").slice(0, 45);

  // Strengths
  const strengths = [];
  if (geju) strengths.push({ title: geju.slice(0,6), desc: (geju + "赋予思维深度的谋略基因").slice(0, 25) });
  const huaLus = []; const huaQuans = [];
  for (const g of gongs) {
    for (const s of g.sihua || []) {
      if (s.hua === "化禄") huaLus.push(s.star);
      if (s.hua === "化权") huaQuans.push(s.star);
    }
  }
  if (huaLus.length) strengths.push({ title: (huaLus.join("") + "化禄").slice(0,6), desc: (huaLus.join("") + "化禄带来实质助力").slice(0, 25) });
  if (findGong(gongs, "父母宫")?.mainStars?.includes("紫微")) strengths.push({ title: "紫微护荫", desc: "父母宫紫微右弼禄存，家世清正".slice(0, 25) });
  while (strengths.length < 3) strengths.push({ title: "根基扎实", desc: ("日主" + dayMaster + "得令根基稳").slice(0, 25) });

  // Weaknesses
  const weaknesses = [];
  const huaJis = [];
  for (const g of gongs) {
    for (const s of g.sihua || []) {
      if (s.hua === "化忌") huaJis.push(s.star);
    }
  }
  if (huaJis.length) weaknesses.push({ title: (huaJis.join("") + "化忌").slice(0,6), desc: (huaJis.join("") + "化忌入命，言语易生是非").slice(0, 25) });
  if (findGong(gongs, "官禄宫")?.mainStars?.length === 0) weaknesses.push({ title: "官禄空宫", desc: "官禄宫无主星事业易摇摆".slice(0, 25) });
  if (findGong(gongs, "财帛宫")?.auxStars?.includes("天刑")) weaknesses.push({ title: "财帛天刑", desc: "财帛宫天刑，防口舌纠纷".slice(0, 25) });
  while (weaknesses.length < 3) weaknesses.push({ title: (strongest + "过旺").slice(0,6), desc: (strongest + "过旺需" + weakest + "来平衡").slice(0, 25) });

  // Section 01
  const section01Text = (geju + "赋予命主深沉的分析力与策略思维。八字以" + strongest + "为体，" + weakest + "为用，" + wangshuai + "。紫微命宫" + mingStars + "星指向智谋型人才，" + (huaJis.length ? huaJis.join("") + "化忌提示思虑过重、表达易生误会" : "整体平稳") + "。两盘互补印证：八字强调" + strongest + "根基深厚，" + (currentDaxianGong ? "当前" + currentDaxianGong.daXian?.startAge + "-" + currentDaxianGong.daXian?.endAge + "岁大限落在" + currentDaxianGong.gong + "，是检验前半生成色的关键十年。" : "整体格局稳健。")).slice(0, 250);

  // Section 02
  const dayun = bazi.dayun || [];
  const dyIdx = dayun.findIndex(d => d.startYear <= currentYear && d.endYear >= currentYear);
  const currentDy = dayun[dyIdx];
  const section02Conclusion = ("大运大限基本同步。当前" + (currentDy ? (currentDy.ganZhi?.gan || "") + (currentDy.ganZhi?.zhi || "") + "大运" : "") + "与紫微" + (currentDaxianGong?.gong || "") + "大限对齐，为人生财富定盘期。").slice(0, 100);

  // Dims
  const guanluGong = findGong(gongs, "官禄宫");
  const huaKeInF = findGong(gongs, "夫妻宫")?.sihua?.some(s => s.hua === "化科");
  const caiBoGong = findGong(gongs, "财帛宫");

  function dimC() { return { bazi: (geju.includes("偏印") ? "偏印格宜策划研发" : "官印相生宜管理").slice(0,30), ziwei: (guanluGong?.mainStars?.length === 0 ? "官禄空宫借对宫，借平台发展" : "文昌入官禄文职适合").slice(0,30), verdict: "⚠ 部分冲突", verdict_class: "verdict-partial", fused: "适合幕后策划，不宜争一线锋芒".slice(0,30) }; }
  function dimW() { return { bazi: "财星不透宜守成".slice(0,30), ziwei: ((caiBoGong?.mainStars?.join("") || "") + "同度财来财去").slice(0,30), verdict: "🟢 同向", verdict_class: "verdict-yes", fused: "财运稳健有漏，守比攻重要".slice(0,30) }; }
  function dimM() { return { bazi: "食神妻宫安稳".slice(0,30), ziwei: (huaKeInF ? "夫妻宫天梁化科配偶贤贵" : "夫妻宫平稳").slice(0,30), verdict: "🟢 同向", verdict_class: "verdict-yes", fused: "婚姻质量高，配偶是贵人".slice(0,30) }; }
  function dimCh() { return { bazi: (bazi.siZhu?.hour?.gan === "乙" ? "时柱七杀子息要强" : "时柱食神子女缘佳").slice(0,30), ziwei: (findGong(gongs,"子女宫")?.auxStars?.includes("天喜") ? "子女宫天喜，子女出息" : "子女宫平稳").slice(0,30), verdict: "🟢 同向", verdict_class: "verdict-yes", fused: "子女有出息，晚年得力".slice(0,30) }; }
  function dimF() { return { bazi: (en?.整柱?.some(p => p.pillar === "年" && p.verdict === "天地同气") ? "年柱天地同气得祖荫" : "年柱平").slice(0,30), ziwei: "父母宫紫微庇荫深".slice(0,30), verdict: "🟢 同向", verdict_class: "verdict-yes", fused: "家世清白，父母庇荫深厚".slice(0,30) }; }
  function dimH() { return { bazi: (strongest + "旺" + weakest + "弱" + (weakest === "水" ? "肾水不足" : "")).slice(0,30), ziwei: ((findGong(gongs,"疾厄宫")?.mainStars?.join("") || "") + (findGong(gongs,"疾厄宫")?.auxStars?.includes("地劫") ? "地劫防积劳" : "")).slice(0,30), verdict: "⚠ 部分冲突", verdict_class: "verdict-partial", fused: (strongest + weakest + "需双线养护").slice(0,30) }; }

  // Conflicts
  const conflicts = [
    { point: "事业方向", bazi: (geju + "宜独立创业").slice(0,25), ziwei: "官禄空宫不宜自营".slice(0,25), impact: "中", impact_class: "mid", advice: "建议合伙或依附平台发展".slice(0,30) },
    { point: "财帛起伏", bazi: "大运土旺财稳".slice(0,25), ziwei: (caiBoGong?.auxStars?.includes("天刑") ? "巨门天刑恐有讼争" : "财帛平稳").slice(0,25), impact: "中", impact_class: "mid", advice: "合同签署务必谨慎审查".slice(0,30) },
    { point: "健康主调", bazi: (wangshuai + "体质偏强").slice(0,25), ziwei: ((findGong(gongs,"疾厄宫")?.mainStars?.join("") || "") + "防过劳").slice(0,25), impact: "低", impact_class: "low", advice: "适度运动勿忽视小病".slice(0,30) },
  ];

  // Nodes
  const nodes = [];
  for (let i = Math.max(0, dyIdx - 1); i < Math.min(dyIdx + 4, dayun.length) && nodes.length < 5; i++) {
    const d = dayun[i];
    const midY = Math.floor((d.startYear + d.endYear) / 2);
    nodes.push({ age: midY - birthYear + 1, year: midY, event: ((d.ganZhi?.gan || "") + (d.ganZhi?.zhi || "") + "大运" + ["事业启动","上升期","转折年","财务年","换运期"][nodes.length] + (i === dyIdx ? "(当前)" : "")).slice(0, 40) });
  }
  while (nodes.length < 5) { const a = 30 + nodes.length * 5; nodes.push({ age: a, year: birthYear + a - 1, event: "人生重要节点".slice(0,40) }); }

  // Risks
  const va = currentYear - birthYear + 1;
  const risks = [
    { range: (currentYear + "-" + (currentYear + 1) + " (" + va + "-" + (va + 1) + "岁)"), desc: "当前流年谨防财务纠纷与合同陷阱".slice(0,40) },
    { range: ((currentYear + 4) + "-" + (currentYear + 5) + " (" + (va + 4) + "-" + (va + 5) + "岁)"), desc: "换运转换期职业与健康的双重考验".slice(0,40) },
    { range: ((birthYear + 60) + "-" + (birthYear + 62) + " (60-62岁)"), desc: "晚年注意代谢类疾病与血压养护".slice(0,40) },
  ];

  // Leverage
  const leverage = [
    { title: "深耕专业", desc: (geju + "格局适合深耕技术或咨询领域".slice(0,40)) },
    { title: "善用人脉", desc: "夫妻宫天梁化科，贵人和人脉是重要助力".slice(0,40) },
  ];

  // Advice
  const advice = [
    "言语多思三秒再出口忌口舌".slice(0,25),
    "财务以稳为主忌高杠杆投资".slice(0,25),
    "深耕一个垂直领域建立护城河".slice(0,25),
    ((currentDaxianGong ? currentDaxianGong.daXian?.startAge + "-" + currentDaxianGong.daXian?.endAge : "当前") + "岁是关键窗口把握当下").slice(0,25),
  ];

  // Life axis
  const lifeAxis = (geju.includes("偏印") ? "以智谋立身" : "守正出奇") + "，" + (currentDaxianGong?.daXian?.isCurrent ? "中年" : "") + "渐入佳境";

  // Confidence
  const baziScore = 0.72, ziweiScore = 0.68, consistencyScore = 0.70, stabilityScore = 0.65;

  return {
    meta: { archetype_name: archetypeName, axis_oneliner: (dayMaster + "日主" + geju + "调候" + tiaohou + "定格局").slice(0,30) },
    axes: { bazi_main: baziMain, ziwei_main: ziweiMain },
    consistency: "互补印证",
    strengths: strengths.slice(0,3),
    weaknesses: weaknesses.slice(0,3),
    section_01: { text: section01Text, word_count: section01Text.replace(/\s/g,"").length },
    section_02: { conclusion: section02Conclusion },
    dim: { career: dimC(), wealth: dimW(), marriage: dimM(), children: dimCh(), family: dimF(), health: dimH() },
    conflicts: conflicts.slice(0,3),
    final: {
      life_axis: lifeAxis,
      nodes: nodes.slice(0,5),
      risks: risks.slice(0,3),
      leverage: leverage.slice(0,2),
      advice: advice.slice(0,4)
    },
    confidence: {
      bazi_level: scoreToLevel(baziScore), bazi_score: parseFloat(baziScore.toFixed(2)),
      ziwei_level: scoreToLevel(ziweiScore), ziwei_score: parseFloat(ziweiScore.toFixed(2)),
      consistency_level: scoreToLevel(consistencyScore), consistency_score: parseFloat(consistencyScore.toFixed(2)),
      stability_level: scoreToLevel(stabilityScore), stability_score: parseFloat(stabilityScore.toFixed(2)),
      note: "规则生成版，主向判断置信度中，具体年份与细节需流年校正".slice(0,80)
    }
  };
}

export { generateAnalysis };
