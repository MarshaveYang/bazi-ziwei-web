// 调候用神 — 穷通宝鉴查表 wrapper
import * as tables_1 from "./tables.js";
export function getTiaoHou(dayMaster, monthZhi) {
    return tables_1.TIAO_HOU[dayMaster][monthZhi];
}
