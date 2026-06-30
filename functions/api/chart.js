/**
 * Cloudflare Pages Function — POST /api/chart
 */
import { createChart } from "../_vendor/yiqi-core/index.js";
import { enrichBazi } from "../_vendor/bazi-enrich/enrich.js";
import { generateAnalysis } from "../_vendor/analysis-gen.js";
import { buildSystemPrompt, buildUserPrompt, chartToText } from "../_vendor/ai-prompts.js";
import { GAN_WX, getShiShen as ss } from "../_vendor/constants.js";

const DIZHI=["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const DIZHI_WX={子:"水",丑:"土",寅:"木",卯:"木",辰:"土",巳:"火",午:"火",未:"土",申:"金",酉:"金",戌:"土",亥:"水"};
const MING_ZHU={子:"贪狼",丑:"巨门",寅:"禄存",卯:"文曲",辰:"廉贞",巳:"武曲",午:"破军",未:"武曲",申:"廉贞",酉:"文曲",戌:"禄存",亥:"巨门"};
const SHEN_ZHU={子:"火星",丑:"天相",寅:"天梁",卯:"天同",辰:"文昌",巳:"天机",午:"火星",未:"天相",申:"天梁",酉:"天同",戌:"文昌",亥:"天机"};
const PROVIDERS={nvidia:{baseUrl:"https://integrate.api.nvidia.com/v1",model:"meta/llama-3.1-405b-instruct"},deepseek:{baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat"},openai:{baseUrl:"https://api.openai.com/v1",model:"gpt-4o-mini"}};

// 安全修复①：SSRF 防护。允许的官方厂商域名固定写死；
// "custom" 模式下用户可填自定义 baseUrl，但必须是合法 https URL，
// 且禁止指向内网/本机/云元数据接口等地址，防止把本服务当作匿名代理打内网或扫描第三方。
const ALLOWED_AI_HOSTS=new Set(["integrate.api.nvidia.com","api.deepseek.com","api.openai.com"]);
const BLOCKED_HOST_PATTERNS=[/^localhost$/i,/^127\./,/^10\./,/^172\.(1[6-9]|2\d|3[01])\./,/^192\.168\./,/^169\.254\./,/^0\.0\.0\.0$/,/^\[?::1\]?$/,/^\[?fe80:/i,/^\[?fc00:/i,/^\[?fd00:/i,/\.local$/i];
function isUrlSafe(urlStr){
  let u;try{u=new URL(urlStr)}catch{return false}
  if(u.protocol!=="https:")return false;
  const host=u.hostname;
  if(ALLOWED_AI_HOSTS.has(host))return true;
  // 自定义厂商：拒绝明显的内网/本机/无点号裸主机名，其余放行（无法做到完全杜绝 SSRF，
  // 但能挡掉绝大多数内网探测场景）
  if(BLOCKED_HOST_PATTERNS.some(p=>p.test(host)))return false;
  if(!host.includes("."))return false;
  return true;
}
const SS_CLASS={比肩:"ss-bj",劫财:"ss-jc",食神:"ss-ss",伤官:"ss-sg",偏财:"ss-pc",正财:"ss-zc",七杀:"ss-qs",正官:"ss-zg",偏印:"ss-py",正印:"ss-zy"};
const DIZHI_CANGGAN_FULL={子:["癸"],丑:["己","癸","辛"],寅:["甲","丙","戊"],卯:["乙"],辰:["戊","乙","癸"],巳:["丙","庚","戊"],午:["丁","己"],未:["己","丁","乙"],申:["庚","壬","戊"],酉:["辛"],戌:["戊","辛","丁"],亥:["壬","甲"]};

function rm(md){if(!md)return"";let h=md.replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/^---$/gm,'<hr>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>').replace(/置信度[：:]\s*高/g,'<span class="conf-hi">置信度：高</span>').replace(/置信度[：:]\s*中/g,'<span class="conf-md">置信度：中</span>').replace(/置信度[：:]\s*低/g,'<span class="conf-lo">置信度：低</span>').replace(/^(\d+)\.\s(.+)$/gm,'<li>$1. $2</li>').replace(/^-\s(.+)$/gm,'<li>$1</li>').replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');return'<p>'+h+'</p>'}

function s(d,k,v){d[k]=String(v!=null?v:"")}

// 计算某一步八字大运的展示字段（起止年龄/干支/十神/是否当前）。
// 之前"大运条"和"section_02 对照表"各写了一份几乎相同的逻辑，这里合并成一个函数。
function dayunFields(dy,curAge){
  if(!dy)return{gz:"",range:"",shishen:"",current_class:""};
  const endAge=(dy.startAge||0)+9;
  const isCurrent=curAge>=(dy.startAge||0)&&curAge<=endAge;
  return{
    gz:(dy.ganZhi?.gan||"")+(dy.ganZhi?.zhi||""),
    range:(dy.startAge||"")+"-"+endAge+"岁",
    shishen:(dy.ganShiShen||"")+"/"+(dy.zhiShiShen||""),
    current_class:isCurrent?"current":""
  };
}

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
    const f=dayunFields(dayun[i],curAge);
    s(d,"dayun."+i+".gz",f.gz);s(d,"dayun."+i+".age_range",f.range);s(d,"dayun."+i+".shishen",f.shishen);s(d,"dayun."+i+".current_class",f.current_class);
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
  // 紫微大限按起始年龄排序一次即可，不需要在循环里每次重新 filter+sort
  const ziweiSorted=(zw.gongs||[]).filter(g=>g.daXian).sort((a,b)=>(a.daXian.startAge||0)-(b.daXian.startAge||0));
  for(let i=0;i<7;i++){
    const f=dayunFields(dayun[i],curAge);
    s(d,"section_02.bazi."+i+".range",f.range);s(d,"section_02.bazi."+i+".gz",f.gz);s(d,"section_02.bazi."+i+".shishen",f.shishen);s(d,"section_02.bazi."+i+".current_class",f.current_class);
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

  // 渲染：原来是对每个 key 都生成一个正则、对整段 HTML 扫描一次（O(key数 × HTML长度)，
  // 字段有上百个时比较浪费）。改成一次性扫描所有 {{xxx}} 占位符，回调里直接查字典，
  // 整个模板只扫描一遍。
  let html=tpl.replace(/\{\{([^{}]+)\}\}/g,(_,k)=>Object.prototype.hasOwnProperty.call(d,k)?d[k]:"-");


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
  if(!isUrlSafe(url))throw new Error("AI API地址不合法或不允许访问");
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

/**
 * 简易 KV 固定窗口限流器。
 * 若未绑定 KV（env.RATE_LIMIT_KV 不存在），默认放行（不阻断现有功能），
 * 但会在控制台打印警告，提醒管理员去 Cloudflare Pages 后台绑定 KV。
 * 返回 { ok, remaining, retryAfter }
 */
async function checkRateLimit(kv,bucket,ip,limit,windowSec){
  if(!kv){console.warn("RATE_LIMIT_KV 未绑定，限流未生效，存在被刷量风险");return{ok:true}}
  const key="rl:"+bucket+":"+ip;
  let count=0;
  try{const raw=await kv.get(key);count=raw?parseInt(raw,10)||0:0}catch(e){console.error("限流读取失败:",e.message);return{ok:true}}
  if(count>=limit)return{ok:false,retryAfter:windowSec};
  try{await kv.put(key,String(count+1),{expirationTtl:windowSec})}catch(e){console.error("限流写入失败:",e.message)}
  return{ok:true,remaining:limit-count-1};
}

// 安全修复②：CORS 不再用 "*"。同源的浏览器请求（你自己的网页调用自己的 /api/chart）
// 本来就不需要任何 CORS 头。这里改成基于白名单按需反射 Origin，
// 默认只允许同源访问，避免任意第三方网站拿你的接口去刷你的 AI 配额。
function corsHeaders(request,env){
  const origin=request.headers.get("Origin");
  if(!origin)return {}; // 同源请求浏览器不会带 Origin，无需 CORS 头
  const allowed=(env.ALLOWED_ORIGIN||"").split(",").map(s=>s.trim()).filter(Boolean);
  const selfOrigin=new URL(request.url).origin;
  if(origin===selfOrigin||allowed.includes(origin)){
    return {"Access-Control-Allow-Origin":origin,"Vary":"Origin"};
  }
  return {}; // 不在白名单内的跨域请求，不返回 CORS 头（浏览器会拦截响应）
}

// 安全修复④：生产环境不把内部错误细节（栈信息/第三方接口原始响应）回传给客户端，
// 详细信息只打到服务端日志，客户端只拿到通用提示。
function safeError(status,publicMsg,headers){
  return new Response(JSON.stringify({error:publicMsg}),{status,headers:{"Content-Type":"application/json;charset=utf-8",...headers}});
}

async function onRequest(context){
  const{request,env}=context;
  const cors=corsHeaders(request,env);
  if(request.method==="OPTIONS")return new Response(null,{headers:{...cors,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"}});
  if(request.method!=="POST")return safeError(405,"仅支持POST",cors);

  const ip=request.headers.get("CF-Connecting-IP")||request.headers.get("X-Forwarded-For")||"unknown";
  const kv=env.RATE_LIMIT_KV;

  // 限流：每个 IP 24 小时内最多 3 次请求（覆盖所有 aiMode，包括纯算法排盘）
  const limit=await checkRateLimit(kv,"chart",ip,3,86400);
  if(!limit.ok)return safeError(429,"每个 IP 24 小时内最多可生成 3 次命盘，请明天再试",{...cors,"Retry-After":String(limit.retryAfter||86400)});

  try{
    const body=await request.json();
    const{year,month,day,hour,minute,gender,aiMode,aiProvider,aiApiKey,aiBaseUrl,aiModel}=body;
    if(!year||!month||!day||hour===undefined||!gender)return safeError(400,"缺少必填参数",cors);

    // 安全修复⑤：输入范围校验，避免非法日期/时间传入排盘算法导致未定义行为
    const y=parseInt(year),mo=parseInt(month),da=parseInt(day),ho=parseInt(hour),mi=parseInt(minute||0);
    if(!Number.isInteger(y)||y<1900||y>2100)return safeError(400,"出生年份不合法（需在1900-2100之间）",cors);
    if(!Number.isInteger(mo)||mo<1||mo>12)return safeError(400,"出生月份不合法（需在1-12之间）",cors);
    if(!Number.isInteger(da)||da<1||da>31)return safeError(400,"出生日期不合法（需在1-31之间）",cors);
    if(!Number.isInteger(ho)||ho<0||ho>23)return safeError(400,"出生时辰不合法（需在0-23之间）",cors);
    if(!Number.isInteger(mi)||mi<0||mi>59)return safeError(400,"出生分钟不合法（需在0-59之间）",cors);
    if(gender!=="男"&&gender!=="女"&&gender!=="male"&&gender!=="female")return safeError(400,"性别参数不合法",cors);

    const mode=aiMode||"none";
    if(!["none","site","custom"].includes(mode))return safeError(400,"aiMode参数不合法",cors);

    let apiKey="",provider="deepseek",baseUrl="",m="";
    if(mode==="site"){apiKey=env.AI_API_KEY||"";provider=env.AI_PROVIDER||"deepseek";baseUrl=env.AI_BASE_URL||"";m=env.AI_MODEL||""}
    else if(mode==="custom"){apiKey=aiApiKey||"";provider=aiProvider||"deepseek";baseUrl=aiBaseUrl||"";m=aiModel||""}
    const birthInfo={year:y,month:mo,day:da,hour:ho,minute:mi,gender:(gender==="男"||gender==="male")?"male":"female",isLunar:false,timeZone:8};
    const chart=doChart(birthInfo);
    const analysis=generateAnalysis(chart);
    let tpl;try{const tr=await env.ASSETS.fetch(new URL("/templates/report-zonghe-poster.html",request.url));tpl=await tr.text()}catch(e){console.error("模板加载失败:",e.message);return safeError(500,"模板加载失败",cors)}
    let aiMd="";
    if(apiKey){
      try{
        const cy=new Date().getFullYear();const ct=chartToText(chart);const sys=buildSystemPrompt();const u=buildUserPrompt(ct,birthInfo,cy);
        aiMd=await callAiApi(provider,apiKey,baseUrl,m,sys,u);
      }catch(e){
        console.error("AI分析失败:",e.message); // 详细错误只记日志，不回传第三方接口原始响应给客户端
        aiMd="⚠️ AI分析暂时不可用，已生成算法规则版海报。";
      }
    }
    const html=renderPoster(tpl,chart,analysis,aiMd);
    return new Response(JSON.stringify({html}),{status:200,headers:{"Content-Type":"application/json; charset=utf-8",...cors}});
  }catch(err){
    console.error("chart error:",err); // 详细堆栈只记日志，不回传给客户端
    return safeError(500,"排盘失败，请检查输入信息或稍后重试",cors);
  }
}

export { onRequest };
