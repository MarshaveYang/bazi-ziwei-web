/**
 * AI 长文综合分析提示词模块
 * 用于生成八字+紫微综合印证长文分析
 */

/**
 * 构建系统提示词
 */
function buildSystemPrompt() {
  return `你是一位资深的国学易经术数综合分析师，精通子平派八字和紫微斗数。你的职责不是重新排盘，而是基于算法层给出的精确命盘数据，做两套体系的交叉印证分析。

## 分析要求
1. 输出格式为 Markdown，中文为主
2. 每段分析后给出：**置信度：高/中/低**
3. 冲突信号必须明说，不和稀泥
4. 不使用命盘数据之外的变量（风水、姓名等）
5. 末尾带免责声明

## 输出结构

### 0. 命主基本信息
一段话概括生辰、四柱、命宫主星。

### 1. 两盘主轴速览
- 八字主轴（一句话）
- 紫微主轴（一句话）
- 印证结论（同向/互补/矛盾）

### 2. 命盘技法深度解读
- 八字格局/旺衰/调候/喜用忌的分析
- 紫微命宫主星+身宫+生年四化的组合解读

### 3. 六维度交叉印证（每个维度至少100字）

| 维度 | 解读要点 |
|------|---------|
| 财运 | 财星状态+财帛宫+化禄落点 |
| 事业 | 官杀+印星+官禄宫+化权 |
| 婚恋 | 配偶星+夫妻宫+化科 |
| 子女 | 时柱+子女宫 |
| 六亲 | 年月柱+父母宫+兄弟宫 |
| 健康 | 五行平衡+疾厄宫+化忌冲疾 |

### 4. 大运大限阶段分析
以10年为单位，标注每个阶段的双盘信号：
- 🟢 双盘同吉
- 🔴 双盘同凶
- 🟡 一吉一凶

### 5. 当前流年深度解析（当前年份）
从八字和紫微两个角度，分析当前流年的事业/财运/健康情况。

### 6. 综合定论
1. 一句话人生主轴
2. 5个终身关键时间节点
3. 3个高风险窗口
4. 2条优势放大策略
5. 3-5条针对性建议

### 7. 免责声明

## 关键约束
- 所有结论必须基于提供的命盘数据
- 术语后跟白话解释
- 不替用户做决策（投资、择偶、医疗等）
- 每段标注置信度`;
}

/**
 * 构建用户提示词（含完整命盘数据）
 */
function buildUserPrompt(chartText, birthInfo, currentYear) {
  return `请根据以下精确排盘数据，进行八字+紫微综合印证长文分析。

## 命主基本信息
- 性别：${birthInfo.gender === 'male' ? '男' : '女'}
- 阳历：${birthInfo.year}-${String(birthInfo.month).padStart(2, '0')}-${String(birthInfo.day).padStart(2, '0')} ${String(birthInfo.hour).padStart(2, '0')}:${String(birthInfo.minute).padStart(2, '0')}
- 分析当前年份：${currentYear}

## 完整命盘数据

\`\`\`
${chartText}
\`\`\`

请按系统提示词的结构输出长文综合分析。注意：所有干支、星曜、宫位等数据必须严格从上面的排盘数据中引用，不要自行推算。`;
}

/**
 * 获取 chart.txt 格式的文本盘
 * 从 chart JSON 生成类似 dump-text.ts 的文本
 */
function chartToText(chart) {
  const bz = chart.bazi;
  const zw = chart.ziwei;
  const en = bz.enrichment;
  const lines = [];

  // 基本信息
  lines.push('=== 八字命盘 ===');
  lines.push('');
  lines.push(`年柱：${bz.siZhu.year.gan}${bz.siZhu.year.zhi} [${bz.shiShen?.year || ''}]  纳音：${bz.naYin?.year || ''}  星运：${bz.zhangSheng?.year || ''}`);
  lines.push(`月柱：${bz.siZhu.month.gan}${bz.siZhu.month.zhi} [${bz.shiShen?.month || ''}]  纳音：${bz.naYin?.month || ''}  星运：${bz.zhangSheng?.month || ''}`);
  lines.push(`日柱：${bz.siZhu.day.gan}${bz.siZhu.day.zhi} [日主]  纳音：${bz.naYin?.day || ''}  星运：${bz.zhangSheng?.day || ''}`);
  lines.push(`时柱：${bz.siZhu.hour.gan}${bz.siZhu.hour.zhi} [${bz.shiShen?.hour || ''}]  纳音：${bz.naYin?.hour || ''}  星运：${bz.zhangSheng?.hour || ''}`);
  lines.push(`日主：${bz.dayMaster}`);
  lines.push('');

  // 格局
  if (en?.格局) {
    lines.push(`格局：${en.格局.primary} (置信度: ${en.格局.confidence || '-'})`);
    if (en.格局.basis) lines.push(`依据：${en.格局.basis}`);
  }
  if (en?.旺衰) {
    lines.push(`旺衰：${en.旺衰.verdict} (score: ${en.旺衰.score}, 置信度: ${en.旺衰.confidence || '-'})`);
  }
  if (en?.调候用神) {
    lines.push(`调候用神：${en.调候用神.join('、')}`);
  }
  if (en?.五行旺相) {
    const w = en.五行旺相;
    lines.push(`五行旺相：木${w.木} 火${w.火} 土${w.土} 金${w.金} 水${w.水}`);
  }
  if (en?.五行统计?.surface) {
    const s = en.五行统计.surface;
    lines.push(`五行统计：木${s.木} 火${s.火} 土${s.土} 金${s.金} 水${s.水}`);
  }
  lines.push('');

  // 大运
  lines.push('大运：');
  for (const d of bz.dayun || []) {
    lines.push(`  ${d.startYear}-${d.endYear}  ${d.ganZhi.gan}${d.ganZhi.zhi}  ${d.ganShiShen || ''}/${d.zhiShiShen || ''}`);
  }
  lines.push('');

  // 紫微
  lines.push('=== 紫微斗数命盘 ===');
  lines.push('');
  lines.push(`命宫：${zw.gongs[zw.mingGongIndex]?.dizhi || ''}  身宫：${['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][zw.shenGongIndex] || ''}`);
  lines.push(`五行局：${zw.wuXingJu?.name || ''}  阴阳：${zw.yinYang || ''}`);

  // 生年四化
  const allSihua = [];
  for (const g of zw.gongs) {
    for (const s of g.sihua || []) {
      allSihua.push(`${s.star}${s.hua}`);
    }
  }
  if (allSihua.length) {
    lines.push(`生年四化：${allSihua.join('、')}`);
  }
  lines.push('');

  // 十二宫
  lines.push('十二宫：');
  for (const g of zw.gongs) {
    const parts = [`  ${g.gong}(${g.tiangan}${g.dizhi})`];
    const stars = g.mainStars?.length ? g.mainStars.join(' ') : '无主星';
    parts.push(`主星：${stars}`);
    if (g.auxStars?.length) parts.push(`辅星：${g.auxStars.join(' ')}`);
    if (g.sihua?.length) parts.push(`四化：${g.sihua.map(s => s.star + s.hua).join(' ')}`);
    if (g.daXian) parts.push(`大限：${g.daXian.startAge}-${g.daXian.endAge}岁${g.daXian.isCurrent ? ' (当前)' : ''}`);
    lines.push(parts.join(' | '));
  }
  lines.push('');

  // 冲突关系
  if (en?.天干关系?.length) {
    lines.push('天干关系：');
    for (const r of en.天干关系) {
      lines.push(`  ${r.type}：${(r.gans || []).join('')} (${(r.pillars || []).join('-')}柱)`);
    }
  }
  if (en?.地支关系?.length) {
    lines.push('地支关系：');
    for (const r of en.地支关系) {
      lines.push(`  ${r.type}：${(r.zhi || []).join('')} (${(r.pillars || []).join('-')}柱)${r.detail ? ' - ' + r.detail : ''}`);
    }
  }

  return lines.join('\n');
}

export { buildSystemPrompt, buildUserPrompt, chartToText };
