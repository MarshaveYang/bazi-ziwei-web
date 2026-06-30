/**
 * Cloudflare Pages Function — POST /api/chart
 */
import { createChart } from "../_vendor/yiqi-core/index.js";
import { enrichBazi } from "../_vendor/bazi-enrich/enrich.js";
import { generateAnalysis } from "../_vendor/analysis-gen.js";
import { buildSystemPrompt, buildUserPrompt, chartToText } from "../_vendor/ai-prompts.js";

const DIZHI=["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const DIZHI_WX={子:"水",丑:"土",寅:"木",卯:"木",辰:"土",巳:"火",午:"火",未:"土",申:"金",酉:"金",戌:"土",亥:"水"};
const GAN_WX={甲:"木",乙:"木",丙:"火",丁:"火",戊:"土",己:"土",庚:"金",辛:"金",壬:"水",癸:"水"};
const MING_ZHU={子:"贪狼",丑:"巨门",寅:"禄存",卯:"文曲",辰:"廉贞",巳:"武曲",午:"破军",未:"武曲",申:"廉贞",酉:"文曲",戌:"禄存",亥:"巨门"};
const SHEN_ZHU={子:"火星",丑:"天相",寅:"天梁",卯:"天同",辰:"文昌",巳:"天机",午:"火星",未:"天相",申:"天梁",酉:"天同",戌:"文昌",亥:"天机"};
const PROVIDERS={nvidia:{baseUrl:"https://integrate.api.nvidia.com/v1",model:"meta/llama-3.1-405b-instruct"},deepseek:{baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat"},openai:{baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"}};
const SHISHEN_MAP={甲:{甲:"比肩",乙:"劫财",丙:"食神",丁:"伤官",戊:"偏财",己:"正财",庚:"七杀",辛:"正官",壬:"偏印",癸:"正印"},乙:{甲:"劫财",乙:"比肩",丙:"伤官",丁:"食神",戊:"正财",己:"偏财",庚:"正官",辛:"七杀",壬:"正印",癸:"偏印"},丙:{甲:"偏印",乙:"正印",丙:"比肩",丁:"劫财",戊:"食神",己:"伤官",庚:"偏财",辛:"正财",壬:"七杀",癸:"正官"},丁:{甲:"正印",乙:"偏印",丙:"劫财",丁:"比肩",戊:"伤官",己:"食神",庚:"正财",辛:"偏财",壬:"正官",癸:"七杀"},戊:{甲:"七杀",乙:"正官",丙:"偏印",丁:"正印",戊:"比肩",己:"劫财",庚:"食神",辛:"伤官",壬:"偏财",癸:"正财"},己:{甲:"正官",乙:"七杀",丙:"正印",丁:"偏印",戊:"劫财",己:"比肩",庚:"伤官",辛:"食神",壬:"正财",癸:"偏财"},庚:{甲:"偏财",乙:"正财",丙:"七杀",丁:"正官",戊:"偏印",己:"正印",庚:"比肩",辛:"劫财",壬:"食神",癸:"伤官"},辛:{甲:"正财",乙:"偏财",丙:"正官",丁:"七杀",戊:"正印",己:"偏印",庚:"劫财",辛:"比肩",壬:"伤官",癸:"食神"},壬:{甲:"食神",乙:"伤官",丙:"偏财",丁:"正财",戊:"七杀",己:"正官",庚:"偏印",辛:"正印",壬:"比肩",癸:"劫财"},癸:{甲:"伤官",乙:"食神",丙:"正财",丁:"偏财",戊:"正官",己:"七杀",庚:"正印",辛:"偏印",壬:"劫财",癸:"比肩"}};
const SS_CLASS={比肩:"ss-bj",劫财:"ss-jc",食神:"ss-ss",伤官:"ss-sg",偏财:"ss-pc",正财:"ss-zc",七杀:"ss-qs",正官:"ss-zg",偏印:"ss-py",正印:"ss-zy"};
const DIZHI_CANGGAN_FULL={子:["癸"],丑:["己","癸","辛"],寅:["甲","丙","戊"],卯:["乙"],辰:["戊","乙","癸"],巳:["丙","庚","戊"],午:["丁","己"],未:["己","丁","乙"],申:["庚","壬","戊"],酉:["辛"],戌:["戊","辛","丁"],亥:["壬","甲"]};
function ss(dm,g){return SHISHEN_MAP[dm]?.[g]||""}

function rm(md){if(!md)return"";let h=md.replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/^---$/gm,'<hr>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>').replace(/置信度[：:]\s*高/g,'<span class="conf-hi">置信度：高</span>').replace(/置信度[：:]\s*中/g,'<span class="conf-md">置信度：中</span>').replace(/置信度[：:]\s*低/g,'<span class="conf-lo">置信度：低</span>').replace(/^(\d+)\.\s(.+)$/gm,'<li>$1. $2</li>').replace(/^-\s(.+)$/gm,'<li>$1</li>').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');return'<p>'+h+'</p>'}

function s(d,k,v){d[k]=String(v!=null?v:"")}

function renderPoster(tpl,chart,ana,aiMd){
  const d={},cy=new Date().getFullYear(),bi=chart.bazi.birthInfo,bz=chart.bazi,zw=chart.ziwei,en=bz.enrichment||{},dm=bz.dayMaster||"";
  
  // === META ===
  s(d,"meta.solar_date",bi.year+"-"+String(bi.month).padStart(2,"0")+"-"+String(bi.day).padStart(2,"0")+" "+String(bi.hour).padStart(2,"0")+":00");
  s(d,"meta.lunar_date",zw.lunarDate?zw.lunarDate.year+"年"+(zw.lunarDate.monthCn||"")+"月"+(zw.lunarDate.dayCn||""):"-");
  s(d,"meta.gender_full",(bi.gender==="male"?"男":"女")+"（"+(zw.yinYang||"")+"）");
  s(d,"meta.yinyang",zw.yinYang);
  s(d,"meta.age_virtual",cy-bi.year+1);
  s(d,"meta.current_year",cy);
  s(d,"meta.archetype_name",ana.meta?.archetype_name||"");
  s(d,"meta.axis_oneliner",ana.meta?.axis_oneliner||"");
  const now=new Date();
  s(d,"meta.gen_time",now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0")+" "+String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0"));

  // === ZIWEI META ===
  s(d,"ziwei.ming_zhu",MING_ZHU[zw.gongs[0]?.dizhi]);
  s(d,"ziwei.shen_zhu",SHEN_ZHU[DIZHI[zw.shenGongIndex]]);
  s(d,"ziwei.zi_dou_jun",zw.ziDouJun);
  s(d,"ziwei.wuxing_ju",zw.wuXingJu?.name);
  s(d,"ziwei.consistency",ana.consistency||"🟢");

  // === CORE ===
  s(d,"core.geju",en?.格局?.primary);
  s(d,"core.geju_confidence",en?.格局?.confidence);
  s(d,"core.wangshuai_verdict",en?.旺衰?.verdict);
  s(d,"core.wangshuai_score",en?.旺衰?.score);
  s(d,"core.wangshuai_pos_pct",Math.max(0,Math.min(100,Math.round(((en?.旺衰?.score??0)+10)*5))));
  const tc=en?.调候用神||[]; s(d,"core.tiaohou.0",tc[0]); s(d,"core.tiaohou.1",tc[1]); s(d,"core.tiaohou_confidence","高");
  const wxCount={木:0,火:0,土:0,金:0,水:0},wxCang={木:0,火:0,土:0,金:0,水:0};
  for(const p of["year","month","day","hour"]){
    const g=bz.siZhu[p]?.gan;if(g)wxCount[GAN_WX[g]]=(wxCount[GAN_WX[g]]||0)+1;
    const cg=bz.siZhu[p]?.cangGan||[];for(const c of cg){const w=GAN_WX[c.gan||c];if(w)wxCang[w]=(wxCang[w]||0)+1}
  }
  for(const wx of["木","火","土","金","水"]){
    const su=wxCount[wx]+0.5*wxCang[wx]; s(d,"core.wuxing."+wx,Math.round(su));
    const pct={0:"0",1:"12",2:"25",3:"40",4:"55",5:"72",6:"88",7:"100"}[Math.round(su)]||String(Math.min(100,Math.round(su)*15));
    s(d,"core.wuxing_pct."+wx,pct);
    s(d,"core.yueling."+wx,DIZHI_WX[bz.siZhu.month?.zhi]===wx?"✓":"");
  }

  // === BAZI PILLARS (with cangGanHtml, ziZuo) ===
  const pls=["year","month","day","hour"];
  for(const p of pls){
    const pillarGan=bz.siZhu[p]?.gan, pillarZhi=bz.siZhu[p]?.zhi;
    s(d,"bazi."+p+".gan",pillarGan);
    s(d,"bazi."+p+".zhi",pillarZhi);
    s(d,"bazi."+p+".naYin",bz.naYin?.[p]);
    s(d,"bazi."+p+".shiShen",(bz.shiShen?.[p]||""));
    s(d,"bazi."+p+".zhangSheng",bz.zhangSheng?.[p]||"");
    // cangGanHtml: each hidden stem with shishen relative to day master
    const cgFull=DIZHI_CANGGAN_FULL[pillarZhi]||[];
    const cgParts=cgFull.map(g=>{const shen=ss(dm,g);return '<span class="'+(SS_CLASS[shen]||"")+'">'+g+'<b>('+shen+')</b></span>'});
    s(d,"bazi."+p+".cangGanHtml",cgParts.join(""));
    // ziZuo: main hidden stem's shishen relative to this pillar's own gan
    const mainCang=cgFull[0]||"";
    s(d,"bazi."+p+".ziZuo",pillarGan&&mainCang?ss(pillarGan,mainCang):"");
  }
  // dayunStart
  s(d,"bazi.dayunStart",bz.dayunStart);


  // === GONGS (十二宫盘, organized by dizhi) ===
  for(const dz of DIZHI){
    const g=zw.gongs.find(gg=>gg.dizhi===dz);
    if(g){
      s(d,"gongs."+dz+".name",(g.gong||""));
      s(d,"gongs."+dz+".mainStarsHtml",(g.mainStars||[]).map(s=>'<span class="star star-'+s+'">'+s+'</span>').join(""));
      s(d,"gongs."+dz+".auxStars",(g.auxStars||[]).join(" "));
      s(d,"gongs."+dz+".sihua",(g.sihua||[]).map(x=>x.hua||"").join(" "));
      s(d,"gongs."+dz+".ganzhi",(g.tiangan||"")+(g.dizhi||""));
      const dx=g.daXian;
      s(d,"gongs."+dz+".daxian_range",dx?dx.startAge+"-"+dx.endAge+"岁":"");
      s(d,"gongs."+dz+".flag",dx?.isCurrent?"current":"");
      s(d,"gongs."+dz+".shenBadge",zw.shenGongIndex!==undefined&&zw.gongs[zw.shenGongIndex]?.dizhi===dz?'<span class="shen-badge">身</span>':"");
      s(d,"gongs."+dz+".smallStars","");
    }else{
      s(d,"gongs."+dz+".name","");s(d,"gongs."+dz+".mainStarsHtml","");s(d,"gongs."+dz+".auxStars","");
      s(d,"gongs."+dz+".sihua","");s(d,"gongs."+dz+".ganzhi",dz);s(d,"gongs."+dz+".daxian_range","");
      s(d,"gongs."+dz+".flag","");s(d,"gongs."+dz+".shenBadge","");s(d,"gongs."+dz+".smallStars","");
    }
  }

  // === DAYUN STRIP (10 steps) ===
  const dayun=bz.dayun||[];
  const curAge=cy-bi.year+1;
  for(let i=0;i<10;i++){
    const dy=dayun[i];
    if(dy){
      const dyEndAge=(dy.startAge||0)+9;
      const dyIsCurrent=curAge>=(dy.startAge||0)&&curAge<=dyEndAge;
      s(d,"dayun."+i+".gz",(dy.ganZhi?.gan||"")+(dy.ganZhi?.zhi||""));
      s(d,"dayun."+i+".age_range",(dy.startAge||"")+"-"+dyEndAge+"岁");
      s(d,"dayun."+i+".shishen",(dy.ganShiShen||"")+"/"+(dy.zhiShiShen||""));
      s(d,"dayun."+i+".current_class",dyIsCurrent?"current":"");
    }else{
      s(d,"dayun."+i+".gz","");s(d,"dayun."+i+".age_range","");s(d,"dayun."+i+".shishen","");s(d,"dayun."+i+".current_class","");
    }
  }

  // === LIUNIAN STRIP (10 years from current-1) ===
  const ganArr=["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
  const zhiArr=["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
  let curDyIdx=-1;
  for(let i=0;i<dayun.length;i++){
    const ddy=dayun[i];
    if(ddy&&curAge>=(ddy.startAge||0)&&curAge<=(ddy.startAge||0)+9){curDyIdx=i;break;}
  }
  s(d,"liunian_dayun_label",curDyIdx>=0&&dayun[curDyIdx]?((dayun[curDyIdx].ganZhi?.gan||"")+(dayun[curDyIdx].ganZhi?.zhi||"")+"大运"):"");
  for(let i=0;i<10;i++){
    const yr=cy-1+i;
    let gIdx=(yr-4)%10;if(gIdx<0)gIdx+=10;
    let zIdx=(yr-4)%12;if(zIdx<0)zIdx+=12;
    const lnGan=ganArr[gIdx],lnZhi=zhiArr[zIdx];
    const lnAge=curAge-1+i;
    s(d,"liunian."+i+".year",String(yr));
    s(d,"liunian."+i+".age",lnAge+"岁");
    s(d,"liunian."+i+".gz",lnGan+lnZhi);
    s(d,"liunian."+i+".shishen",ss(dm,lnGan));
    s(d,"liunian."+i+".current_class",i===1?"current":"");
  }

  // === SECTION_01 (analysis text block) ===
  s(d,"section_01.text",ana.section_01?.text||"");
  s(d,"section_01.word_count",ana.section_01?.word_count||0);

  // === SECTION_02 (大运+紫微大限 side-by-side, 7 stages) ===
  s(d,"section_02.conclusion",ana.section_02?.conclusion||"");
  for(let i=0;i<7;i++){
    const dy=dayun[i];
    if(dy){
      const dyEndAge=(dy.startAge||0)+9;
      const dyIsCurrent=curAge>=(dy.startAge||0)&&curAge<=dyEndAge;
      s(d,"section_02.bazi."+i+".range",(dy.startAge||"")+"-"+dyEndAge+"岁");
      s(d,"section_02.bazi."+i+".gz",(dy.ganZhi?.gan||"")+(dy.ganZhi?.zhi||""));
      s(d,"section_02.bazi."+i+".shishen",(dy.ganShiShen||"")+"/"+(dy.zhiShiShen||""));
      s(d,"section_02.bazi."+i+".current_class",dyIsCurrent?"current":"");
    }else{
      s(d,"section_02.bazi."+i+".range","");s(d,"section_02.bazi."+i+".gz","");s(d,"section_02.bazi."+i+".shishen","");s(d,"section_02.bazi."+i+".current_class","");
    }
    // Ziwei 大限 (sorted by startAge chronologically)
    const ziweiSorted=(zw.gongs||[]).filter(g=>g.daXian).sort((a,b)=>(a.daXian.startAge||0)-(b.daXian.startAge||0));
    const zg=ziweiSorted[i];
    if(zg?.daXian){
      s(d,"section_02.ziwei."+i+".range",zg.daXian.startAge+"-"+zg.daXian.endAge+"岁");
      s(d,"section_02.ziwei."+i+".current_class",zg.daXian.isCurrent?"current":"");
    }else{
      s(d,"section_02.ziwei."+i+".range","");s(d,"section_02.ziwei."+i+".current_class","");
    }
  }

  // === AXES ===
  s(d,"axes.bazi_main",ana.axes?.bazi_main||"");
  s(d,"axes.ziwei_main",ana.axes?.ziwei_main||"");

  // === STRENGTHS ===
  const sax=ana.strengths||[];
  for(let i=0;i<3;i++){s(d,"strengths."+i+".title",sax[i]?.title);s(d,"strengths."+i+".desc",sax[i]?.desc)}

  // === WEAKNESSES ===
  const wax=ana.weaknesses||[];
  for(let i=0;i<3;i++){s(d,"weaknesses."+i+".title",wax[i]?.title);s(d,"weaknesses."+i+".desc",wax[i]?.desc)}

  // === SIX DIMENSIONS ===
  const dmx=ana.dim||{};
  for(const dim of["career","wealth","marriage","children","family","health"]){
    s(d,"dim."+dim+".bazi",dmx[dim]?.bazi);
    s(d,"dim."+dim+".ziwei",dmx[dim]?.ziwei);
    s(d,"dim."+dim+".verdict",dmx[dim]?.verdict);
    s(d,"dim."+dim+".verdict_class",dmx[dim]?.verdict_class||"");
    s(d,"dim."+dim+".fused",dmx[dim]?.fused);
  }

  // === CONFLICTS ===
  const cfx=ana.conflicts||[];
  for(let i=0;i<3;i++){
    s(d,"conflicts."+i+".point",cfx[i]?.point);s(d,"conflicts."+i+".bazi",cfx[i]?.bazi);s(d,"conflicts."+i+".ziwei",cfx[i]?.ziwei);
    s(d,"conflicts."+i+".impact",cfx[i]?.impact);s(d,"conflicts."+i+".impact_class",cfx[i]?.impact_class||"");s(d,"conflicts."+i+".advice",cfx[i]?.advice)
  }

  // === FINAL ===
  const af=ana.final||{};
  s(d,"final.life_axis",af.life_axis);
  const nodes=af.nodes||[];
  for(let i=0;i<5;i++){s(d,"final.nodes."+i+".age",nodes[i]?.age);s(d,"final.nodes."+i+".year",nodes[i]?.year);s(d,"final.nodes."+i+".event",nodes[i]?.event)}
  const advice=af.advice||[];
  for(let i=0;i<4;i++)s(d,"final.advice."+i,advice[i]);
  const risks=af.risks||[];
  for(let i=0;i<3;i++){s(d,"final.risks."+i+".desc",risks[i]?.desc);s(d,"final.risks."+i+".range",risks[i]?.range)}
  const leverage=af.leverage||[];
  for(let i=0;i<2;i++){s(d,"final.leverage."+i+".title",leverage[i]?.title);s(d,"final.leverage."+i+".desc",leverage[i]?.desc)}

  // === CONFIDENCE ===
  const cfd=ana.confidence||{};
  s(d,"confidence.bazi_level",cfd.bazi_level);s(d,"confidence.bazi_score",cfd.bazi_score);
  s(d,"confidence.ziwei_level",cfd.ziwei_level);s(d,"confidence.ziwei_score",cfd.ziwei_score);
  s(d,"confidence.consistency_level",cfd.consistency_level);s(d,"confidence.consistency_score",cfd.consistency_score);
  s(d,"confidence.stability_level",cfd.stability_level);s(d,"confidence.stability_score",cfd.stability_score);
  s(d,"confidence.note",cfd.note);

  // Render
  let html=tpl;
  for(const[k,v]of Object.entries(d)){html=html.replace(new RegExp("\\{\\{"+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"\\}\\}","g"),String(v||""))}
  html=html.replace(/\{\{[a-zA-Z0-9_.]+\}\}/g,"-");

  if(aiMd){
    const css='<style>.ai-section{line-height:1.9;font-size:14px}.ai-section h2{font-size:18px;color:#8b2f1e;border-bottom:1px solid #e0d9c8;padding-bottom:4px;margin:16px 0 8px}.ai-section h3{font-size:15px;color:#8b2f1e;margin:12px 0 6px}.ai-section p{margin:8px 0}.ai-section hr{border:none;border-top:1px solid #e0d9c8;margin:16px 0}.ai-section blockquote{border-left:3px solid #c4bdb0;padding-left:12px;color:#6b6660;margin:8px 0}.conf-hi{color:#4a7c4e}.conf-md{color:#c97c3a}.conf-lo{color:#c1432f}</style></head>';
    html=html.replace("</head>",css);
    const blk='<div style="margin:40px 0 20px;padding:24px 20px;background:#faf6ec;border:1px solid #c4bdb0;border-radius:8px"><h2 style="font-size:20px;color:#8b2f1e;text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:1px solid #e0d9c8">🤖 AI 深度综合分析</h2><div class="ai-section">'+rm(aiMd)+'</div></div>';
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
  for(const[ek,ck]of[['year','年'],['month','月'],['day','日'],['hour','时']]){raw.bazi.cangGan[ek]=(raw.bazi.siZhu[ek].cangGan||[]).map(g=>g.gan||g)}
  return raw;
}

async function onRequest(context){
  const{request,env}=context;
  if(request.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}});
  if(request.method!=="POST")return new Response(JSON.stringify({error:"仅支持POST"}),{status:405,headers:{"Content-Type":"application/json"}});
  try{
    const body=await request.json();
    const{year,month,day,hour,minute,gender,aiMode,aiProvider,aiApiKey,aiBaseUrl,aiModel}=body;
    if(!year||!month||!day||hour===undefined||!gender)return new Response(JSON.stringify({error:"缺少必填参数"}),{status:400,headers:{"Content-Type":"application/json;charset=utf-8"}});
    const mode=aiMode||"none";
    let apiKey="",provider="deepseek",baseUrl="",m="";
    if(mode==="site"){apiKey=env.AI_API_KEY||"";provider=env.AI_PROVIDER||"deepseek";baseUrl=env.AI_BASE_URL||"";m=env.AI_MODEL||""}
    else if(mode==="custom"){apiKey=aiApiKey||"";provider=aiProvider||"deepseek";baseUrl=aiBaseUrl||"";m=aiModel||""}
    const birthInfo={year:parseInt(year),month:parseInt(month),day:parseInt(day),hour:parseInt(hour),minute:parseInt(minute||0),gender:(gender==="男"||gender==="male")?"male":"female",isLunar:false,timeZone:8};
    const chart=doChart(birthInfo);
    const analysis=generateAnalysis(chart);
    let tpl;try{const tr=await env.ASSETS.fetch(new URL("/templates/report-zonghe-poster.html",request.url));tpl=await tr.text()}catch{return new Response(JSON.stringify({error:"模板加载失败"}),{status:500,headers:{"Content-Type":"application/json;charset=utf-8"}})}
    let aiMd="";if(apiKey){try{const cy=new Date().getFullYear();const ct=chartToText(chart);const sys=buildSystemPrompt();const u=buildUserPrompt(ct,birthInfo,cy);aiMd=await callAiApi(provider,apiKey,baseUrl,m,sys,u)}catch(e){aiMd="⚠️ AI分析失败: "+e.message}}
    const html=renderPoster(tpl,chart,analysis,aiMd);
    return new Response(JSON.stringify({html}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8"}});
  }catch(err){console.error("chart error:",err);return new Response(JSON.stringify({error:"排盘失败: "+err.message}),{status:500,headers:{"Content-Type":"application/json;charset=utf-8"}})}
}

export { onRequest };
