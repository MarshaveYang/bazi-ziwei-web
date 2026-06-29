// 八字增强分析主入口 — 给定四柱, 输出格局/旺衰/刑冲合害/调候/自坐 等所有 Yiqi 未算的字段
import * as tables_1 from "./tables.js";
import * as zhi_relations_1 from "./zhi-relations.js";
import * as gan_relations_1 from "./gan-relations.js";
import * as wu_xing_1 from "./wu-xing.js";
import * as wang_shuai_1 from "./wang-shuai.js";
import * as ge_ju_1 from "./ge-ju.js";
import * as tiao_hou_1 from "./tiao-hou.js";
export function enrichBazi(siZhu) {
    const dm = siZhu.日.gan;
    const monthZhi = siZhu.月.zhi;
    // 自坐 — 每柱干在自身支的长生位
    const ziZuo = {};
    for (const p of ['年', '月', '日', '时']) {
        ziZuo[p] = (0, tables_1.getChangSheng)(siZhu[p].gan, siZhu[p].zhi);
    }
    return {
        自坐: ziZuo,
        五行旺相: (0, wu_xing_1.wuXingMonthStatus)(monthZhi),
        五行统计: (0, wu_xing_1.countWuXing)(siZhu, dm),
        调候用神: (0, tiao_hou_1.getTiaoHou)(dm, monthZhi),
        格局: (0, ge_ju_1.judgeGeJu)(siZhu),
        旺衰: (0, wang_shuai_1.judgeWangShuai)(siZhu),
        天干关系: (0, gan_relations_1.detectGanRelations)({
            年: siZhu.年.gan, 月: siZhu.月.gan, 日: siZhu.日.gan, 时: siZhu.时.gan
        }),
        地支关系: (0, zhi_relations_1.detectZhiRelations)({
            年: siZhu.年.zhi, 月: siZhu.月.zhi, 日: siZhu.日.zhi, 时: siZhu.时.zhi
        }),
        整柱: (0, gan_relations_1.judgePillars)(siZhu)
    };
}
