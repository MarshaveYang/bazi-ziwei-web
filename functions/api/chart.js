/**
 * Cloudflare Pages Function — POST /api/chart
 */
import { createChart } from "../_vendor/yiqi-core/index.js";
import { enrichBazi } from "../_vendor/bazi-enrich/enrich.js";
import { generateAnalysis } from "../_vendor/analysis-gen.js";
import { buildSystemPrompt, buildUserPrompt, chartToText } from "../_vendor/ai-prompts.js";

const DIZHI = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const DIZHI_WX = {子:"水",丑:"土",寅:"木",卯:"木",辰:"土",巳:"火",午:"火",未:"土",申:"金",酉:"金",戌:"土",亥:"水"};
const GAN_WX = {甲:"木",乙:"木",丙:"火",丁:"火",戊:"土",己:"土",庚:"金",辛:"金",壬:"水",癸:"水"};
const MING_ZHU = {子:"贪狼",丑:"巨门",寅:"禄存",卯:"文曲",辰:"廉贞",巳:"武曲",午:"破军",未:"武曲",申:"廉贞",酉:"文曲",戌:"禄存",亥:"巨门"};
const SHEN_ZHU = {子:"火星",丑:"天相",寅:"天梁",卯:"天同",辰:"文昌",巳:"天机",午:"火星",未:"天相",申:"天梁",酉:"天同",戌:"文昌",亥:"天机"};
const SHI_SHEN_MAP = {甲:{甲:"比肩",乙:"劫财",丙:"食神",丁:"伤官",戊:"偏财",己:"正财",庚:"七杀",辛:"正官",壬:"偏印",癸:"正印"},乙:{甲:"劫财",乙:"比肩",丙:"伤官",丁:"食神",戊:"正财",己:"偏财",庚:"正官",辛:"七杀",壬:"正印",癸:"偏印"},丙:{甲:"偏印",乙:"正印",丙:"比肩",丁:"劫财",戊:"食神",己:"伤官",庚:"偏财",辛:"正财",壬:"七杀",癸:"正官"},丁:{甲:"正印",乙:"偏印",丙:"劫财",丁:"比肩",戊:"伤官",己:"食神",庚:"正财",辛:"偏财",壬:"正官",癸:"七杀"},戊:{甲:"七杀",乙:"正官",丙:"偏印",丁:"正印",戊:"比肩",己:"劫财",庚:"食神",辛:"伤官",壬:"偏财",癸:"正财"},己:{甲:"正官",乙:"七杀",丙:"正印",丁:"偏印",戊:"劫财",己:"比肩",庚:"伤官",辛:"食神",壬:"正财",癸:"偏财"},庚:{甲:"偏财",乙:"正财",丙:"七杀",丁:"正官",戊:"偏印",己:"正印",庚:"比肩",辛:"劫财",壬:"食神",癸:"伤官"},辛:{甲:"正财",乙:"偏财",丙:"正官",丁:"七杀",戊:"正印",己:"偏印",庚:"劫财",辛:"比肩",壬:"伤官",癸:"食神"},壬:{甲:"食神",乙:"伤官",丙:"偏财",丁:"正财",戊:"七杀",己:"正官",庚:"偏印",辛:"正印",壬:"比肩",癸:"劫财"},癸:{甲:"伤官",乙:"食神",丙:"正财",丁:"偏财",戊:"正官",己:"七杀",庚:"正印",辛:"偏印",壬:"劫财",癸:"比肩"}};
const PROVIDERS = { nvidia:{baseUrl:"https://integrate.api.nvidia.com/v1",model:"meta/llama-3.1-405b-instruct"}, deepseek:{baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat"}, openai:{baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"} };

function ss(dm,g){return SHI_SHEN_MAP[dm]?.[g]||""}
function gz(y){const gs=["庚","辛","壬","癸","甲","乙","丙","丁","戊","己"],zs=["申","酉","戌","亥","子","丑","寅","卯","辰","巳","午","未"];return gs[y%10]+zs[y%12]}
function bp(v){return{0:"0",1:"12",2:"25",3:"40",4:"55",5:"72",6:"88",7:"100"}[v]||String(Math.min(100,v*15))}

function renderMarkdown(md){
  if(!md)return"";let h=md
  .replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>')
  .replace(/^---$/gm,'<hr>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
  .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
  .replace(/置信度[：:]\s*高/g,'<span class="conf-hi">置信度：高</span>')
  .replace(/置信度[：:]\s*中/g,'<span class="conf-md">置信度：中</span>')
  .replace(/置信度[：:]\s*低/g,'<span class="conf-lo">置信度：低</span>')
  .replace(/^(\d+)\.\s(.+)$/gm,'<li>$1. $2</li>').replace(/^-\s(.+)$/gm,'<li>$1</li>')
  .replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
  return'<p>'+h+'</p>'
}

function renderPoster(tpl,chart,analysis,aiMd){
  const d={},cy=new Date().getFullYear(),bi=chart.bazi.birthInfo,bz=chart.bazi,zw=chart.ziwei,en=bz.enrichment||{};
  const dm=bz.dayMaster||"";
  
  d["meta.solar_date"]=bi.year+"-"+String(bi.month).padStart(2,"0")+"-"+String(bi.day).padStart(2,"0")+" "+String(bi.hour).padStart(2,"0")+":00";
  d["meta.lunar_date"]=zw.lunarDate?zw.lunarDate.year+"年"+(zw.lunarDate.monthCn||"")+"月"+(zw.lunarDate.dayCn||""):"-";
  d["meta.gender_full"]=(bi.gender==="male"?"男":"女")+"（"+(zw.yinYang||"")+"）";
  d["meta.yinyang"]=zw.yinYang||"-";
  d["meta.age_virtual"]=String(cy-bi.year+1);
  d["meta.current_year"]=String(cy);
  d["meta.archetype_name"]=(en?.格局?.primary||"")+" · 综合印证";
  d["meta.axis_oneliner"]="八字+紫微 交叉印证分析";
  const now=new Date();
  d["meta.gen_time"]=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0")+" "+String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");

  d["ziwei.ming_zhu"]=MING_ZHU[zw.gongs[0]?.dizhi]||"-";
  d["ziwei.shen_zhu"]=SHEN_ZHU[DIZHI[zw.shenGongIndex]]||"-";
  d["ziwei.zi_dou_jun"]=zw.ziDouJun||"-";
  d["ziwei.wuxing_ju"]=zw.wuXingJu?.name||"-";
  d["ziwei.consistency"]="🟢";

  d["core.geju"]=en?.格局?.primary||"-"; d["core.geju_confidence"]=en?.格局?.confidence||"-";
  d["core.wangshuai_verdict"]=en?.旺衰?.verdict||"-"; d["core.wangshuai_score"]=String(en?.旺衰?.score??0);
  d["core.wangshuai_pos_pct"]=String(Math.max(0,Math.min(100,Math.round(((en?.旺衰?.score??0)+10)*5))));
  const tc=en?.调候用神||[]; d["core.tiaohou.0"]=tc[0]||"-"; d["core.tiaohou.1"]=tc[1]||"-"; d["core.tiaohou_confidence"]="高";
  
  const wxCount={木:0,火:0,土:0,金:0,水:0},wxCang={木:0,火:0,土:0,金:0,水:0};
  for(const p of["year","month","day","hour"]){
    const g=bz.siZhu[p]?.gan; if(g)wxCount[GAN_WX[g]]=(wxCount[GAN_WX[g]]||0)+1;
    const cg=bz.siZhu[p]?.cangGan||[];
    for(const c of cg){const w=GAN_WX[c.gan||c];if(w)wxCang[w]=(wxCang[w]||0)+1}
  }
  for(const wx of["木","火","土","金","水"]){
    const su=wxCount[wx]+0.5*wxCang[wx]; d["core.wuxing."+wx]=String(Math.round(su));
    d["core.wuxing_pct."+wx]=bp(Math.round(su));
    d["core.yueling."+wx]=DIZHI_WX[bz.siZhu.month?.zhi]===wx?"✓":"";
  }

  const pls=["year","month","day","hour"];
  const cgHtml=(z)=>{const cg=bz.cangGan||{};const c=pls.map(p=>cg[p]||[]);const idx=pls.indexOf(z);return(c[idx]||[]).join("、")};
  for(const p of pls){
    d["bazi."+p+".gan"]=bz.siZhu[p]?.gan||"-"; d["bazi."+p+".zhi"]=bz.siZhu[p]?.zhi||"-";
    d["bazi."+p+".naYin"]=bz.siZhu[p]?.nayin||"-"; d["bazi."+p+".shiShen"]=dm?ss(dm,bz.siZhu[p]?.gan):"-";
    d["bazi."+p+".zhangSheng"]=bz.siZhu[p]?.changSheng||"-"; d["bazi."+p+".cangGanHtml"]=cgHtml(p);
    const z=bz.siZhu[p]?.zhi, dmWx=GAN_WX[dm], zWx=DIZHI_WX[z];
    d["bazi."+p+".ziZuo"]=dmWx&&zWx?(dmWx===zWx?"通根":({木:"水",火:"木",土:"火",金:"土",水:"金"}[dmWx]===zWx?"得生":"")):"-";
  }
  d["bazi.dayunStart"]="-";

  const cf=analysis.conflicts||[];
  for(let i=0;i<3;i++){const c=cf[i]||{};d["conflicts."+i+".point"]=c.point||"";d["conflicts."+i+".bazi"]=c.bazi||"";d["conflicts."+i+".ziwei"]=c.ziwei||"";d["conflicts."+i+".impact"]=c.impact||"";d["conflicts."+i+".impact_class"]=c.impact_class||"";d["conflicts."+i+".advice"]=c.advice||""}

  const dimKeys={career:"事业",wealth:"财帛",marriage:"婚姻",children:"子女",family:"家庭",health:"健康"};
  const dims=analysis.dims||[];
  for(const[key]of Object.entries(dimKeys)){
    const dm0=dims.find(x=>x.key===key)||{};
    d["dim."+key+".bazi"]=dm0.bazi||""; d["dim."+key+".ziwei"]=dm0.ziwei||"";
    d["dim."+key+".verdict"]=dm0.verdict||""; d["dim."+key+".verdict_class"]=dm0.verdict_class||"";
    d["dim."+key+".fused"]=dm0.fused||"";
  }

  // Gongs — use dizhi as key
  for(const g of zw.gongs){
    const dz=DIZHI[g.dizhiIndex]||"-";
    d["gongs."+dz+".name"]=(g.gong||"")+" "+dz;
    d["gongs."+dz+".mainStarsHtml"]=(g.mainStars||[]).map(s=>`<span class="star star-${s}">${s}</span>`).join("");
    d["gongs."+dz+".auxStars"]=(g.auxStars||[]).join(" ");
    d["gongs."+dz+".sihua"]=(g.sihua||[]).map(x=>x.hua||"").join(" ");
    d["gongs."+dz+".smallStars"]="";
    d["gongs."+dz+".ganzhi"]=dz;
    d["gongs."+dz+".flag"]=""; d["gongs."+dz+".daxian_range"]=""; d["gongs."+dz+".shenBadge"]="";
  }
  for(const dz of DIZHI){
    if(d["gongs."+dz+".name"])continue;
    d["gongs."+dz+".name"]="";d["gongs."+dz+".mainStarsHtml"]="";d["gongs."+dz+".auxStars"]="";
    d["gongs."+dz+".sihua"]="";d["gongs."+dz+".smallStars"]="";d["gongs."+dz+".ganzhi"]=dz;
    d["gongs."+dz+".flag"]="";d["gongs."+dz+".daxian_range"]="";d["gongs."+dz+".shenBadge"]="";
  }

  const dy=zw.dayun||[];
  for(let i=0;i<10;i++){
    const dd=dy[i]||{};
    d["dayun."+i+".gz"]=dd.ganZhi?(dd.ganZhi.gan||"")+(dd.ganZhi.zhi||""):"-";
    d["dayun."+i+".shishen"]=dd.ganZhi?.gan&&dm?ss(dm,dd.ganZhi.gan):"-";
    d["dayun."+i+".age_range"]=dd.startYear&&dd.endYear?dd.startYear+"-"+dd.endYear:"-";
    d["dayun."+i+".current_class"]=dd.startYear<=cy&&dd.endYear>=cy?"current":"";
  }

  for(let i=0;i<10;i++){
    const y=cy-2+i;
    d["liunian."+i+".year"]=String(y); d["liunian."+i+".age"]=String(y-bi.year+1);
    d["liunian."+i+".gz"]=gz(y); d["liunian."+i+".shishen"]=dm?ss(dm,gz(y)[0]):"-";
    d["liunian."+i+".current_class"]=y===cy?"current":"";
  }
  d["liunian_dayun_label"]="流年 + 当前大运";

  const bs=Math.min(85,55+((en?.旺衰?.score??0)*3));
  d["confidence.bazi_score"]=String(bs); d["confidence.bazi_level"]=bs>=75?"高":bs>=60?"中":"低";
  d["confidence.ziwei_score"]="72"; d["confidence.ziwei_level"]="中";
  d["confidence.consistency_score"]="68"; d["confidence.consistency_level"]="中";
  d["confidence.stability_score"]="75"; d["confidence.stability_level"]="中";
  d["confidence.note"]="本报告基于算法排盘+规则分析，仅供文化研究参考。";

  d["section_01.text"]=(en?.格局?.primary||"")+"格局"+(en?.旺衰?.verdict||"")+"，日主"+dm+"，调候"+(tc.join("、")||"无");
  d["section_01.word_count"]=String(d["section_01.text"].length);
  d["section_02.conclusion"]="大运与紫微大限基本同步，当前"+cy+"年为关键节点。";
  for(let i=0;i<7;i++){d["section_02.bazi."+i+".gz"]="";d["section_02.bazi."+i+".range"]="";d["section_02.bazi."+i+".shishen"]="";d["section_02.ziwei."+i+".range"]="";d["section_02.bazi."+i+".current_class"]="";d["section_02.ziwei."+i+".current_class"]=""}
  for(let i=0;i<Math.min(dy.length,7);i++){const dd=dy[i];d["section_02.bazi."+i+".gz"]=dd.ganZhi?(dd.ganZhi.gan||"")+(dd.ganZhi.zhi||""):"-";d["section_02.bazi."+i+".range"]=dd.startYear&&dd.endYear?dd.startYear+"-"+dd.endYear:"-";d["section_02.bazi."+i+".shishen"]=dd.ganZhi?.gan&&dm?ss(dm,dd.ganZhi.gan):"-";d["section_02.bazi."+i+".current_class"]=dd.startYear<=cy&&dd.endYear>=cy?"current":""}

  d["final.life_axis"]="八字"+(en?.格局?.primary||"")+"格局 × 紫微"+(zw.gongs[zw.mingGongIndex]?.gong||"");
  for(let i=0;i<5;i++){d["final.nodes."+i+".age"]="";d["final.nodes."+i+".event"]="";d["final.nodes."+i+".year"]=""}
  for(let i=0;i<4;i++)d["final.advice."+i]="";
  for(let i=0;i<3;i++){d["final.risks."+i+".desc"]="";d["final.risks."+i+".range"]=""}
  for(let i=0;i<2;i++){d["final.leverage."+i+".title"]="";d["final.leverage."+i+".desc"]=""}
  for(let i=0;i<3;i++){d["strengths."+i+".title"]="";d["strengths."+i+".desc"]=""}
  for(let i=0;i<3;i++){d["weaknesses."+i+".title"]="";d["weaknesses."+i+".desc"]=""}
  d["axes.bazi_main"]="八字主轴线"; d["axes.ziwei_main"]="紫微主轴线";

  let html=tpl;
  for(const[k,v]of Object.entries(d)){html=html.replace(new RegExp("\\{\\{"+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"\\}\\}","g"),String(v||""))}
  html=html.replace(/\{\{[a-zA-Z0-9_.]+\}\}/g,"-");

  if(aiMd){
    const css='<style>.ai-section{line-height:1.9;font-size:14px}.ai-section h2{font-size:18px;color:#8b2f1e;border-bottom:1px solid #e0d9c8;padding-bottom:4px;margin:16px 0 8px}.ai-section h3{font-size:15px;color:#8b2f1e;margin:12px 0 6px}.ai-section p{margin:8px 0}.ai-section hr{border:none;border-top:1px solid #e0d9c8;margin:16px 0}.ai-section blockquote{border-left:3px solid #c4bdb0;padding-left:12px;color:#6b6660;margin:8px 0}.conf-hi{color:#4a7c4e}.conf-md{color:#c97c3a}.conf-lo{color:#c1432f}</style></head>';
    html=html.replace("</head>",css);
    const blk='<div style="margin:40px 0 20px;padding:24px 20px;background:#faf6ec;border:1px solid #c4bdb0;border-radius:8px"><h2 style="font-size:20px;color:#8b2f1e;text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:1px solid #e0d9c8">🤖 AI 深度综合分析</h2><div class="ai-section">'+renderMarkdown(aiMd)+'</div></div>';
    html=html.replace("</body>",blk+"</body>");
  }
  return html;
}

async function callAiApi(provider,apiKey,baseUrl,model,sys,u){
  const url=(baseUrl||PROVIDERS[provider]?.baseUrl||"https://api.deepseek.com/v1")+"/chat/completions";
  const m=model||PROVIDERS[provider]?.model||"deepseek-chat";
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+apiKey},body:JSON.stringify({model:m,messages:[{role:"system",content:sys},{role:"user",content:u}],temperature:0.7,max_tokens:8192,stream:false})});
  if(!r.ok){const t=await r.text();throw new Error("AI API失败("+r.status+"): "+t.slice(0,200))}
  const j=await r.json();return j.choices?.[0]?.message?.content||"";
}

function doChart(bi){
  const raw=createChart(bi);
  const sia={'年':raw.bazi.siZhu.year,'月':raw.bazi.siZhu.month,'日':raw.bazi.siZhu.day,'时':raw.bazi.siZhu.hour};
  raw.bazi.enrichment=enrichBazi(sia);
  raw.bazi.dayMaster=raw.bazi.siZhu.day.gan;
  raw.bazi.cangGan={};
  for(const[ek,ck]of[['year','年'],['month','月'],['day','日'],['hour','时']]){
    raw.bazi.cangGan[ek]=(raw.bazi.siZhu[ek].cangGan||[]).map(g=>g.gan||g);
  }
  return raw;
}

async function onRequest(context){
  const{request,env}=context;
  if(request.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}});
  if(request.method!=="POST")return new Response(JSON.stringify({error:"仅支持POST"}),{status:405,headers:{"Content-Type":"application/json"}});
  try{
    const body=await request.json();
    const{year,month,day,hour,minute,gender,aiMode,aiProvider,aiApiKey,aiBaseUrl,aiModel}=body;
    if(!year||!month||!day||hour===undefined||!gender)
      return new Response(JSON.stringify({error:"缺少必填参数"}),{status:400,headers:{"Content-Type":"application/json;charset=utf-8"}});
    const mode=aiMode||"none";
    let apiKey="",provider="deepseek",baseUrl="",m="";
    if(mode==="site"){apiKey=env.AI_API_KEY||"";provider=env.AI_PROVIDER||"deepseek";baseUrl=env.AI_BASE_URL||"";m=env.AI_MODEL||""}
    else if(mode==="custom"){apiKey=aiApiKey||"";provider=aiProvider||"deepseek";baseUrl=aiBaseUrl||"";m=aiModel||""}
    const birthInfo={year:parseInt(year),month:parseInt(month),day:parseInt(day),hour:parseInt(hour),minute:parseInt(minute||0),gender:(gender==="男"||gender==="male")?"male":"female",isLunar:false,timeZone:8};
    const chart=doChart(birthInfo);
    const analysis=generateAnalysis(chart);
    let tpl;
    try{const tr=await env.ASSETS.fetch(new URL("/templates/report-zonghe-poster.html",request.url));tpl=await tr.text()}catch{return new Response(JSON.stringify({error:"模板加载失败"}),{status:500,headers:{"Content-Type":"application/json;charset=utf-8"}})}
    let aiMd="";
    if(apiKey){try{const cy=new Date().getFullYear();const ct=chartToText(chart);const sys=buildSystemPrompt();const u=buildUserPrompt(ct,birthInfo,cy);aiMd=await callAiApi(provider,apiKey,baseUrl,m,sys,u)}catch(e){aiMd="⚠️ AI分析失败: "+e.message}}
    const html=renderPoster(tpl,chart,analysis,aiMd);
    return new Response(JSON.stringify({html}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8"}});
  }catch(err){console.error("chart error:",err);return new Response(JSON.stringify({error:"排盘失败: "+err.message}),{status:500,headers:{"Content-Type":"application/json;charset=utf-8"}})}
}

export { onRequest };
