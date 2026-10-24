/* The words main.js shows or copies, in each page's language (its <html lang>): Chinese at the
   root, English at en/, Japanese at jp/. Everything else on a page is in its HTML. */
export const STRINGS = {
  "zh-CN": {
    shown: (n) => `显示 ${n} 个场地`,
    copied: "已复制咨询模板，打开微信粘贴、补全后发送即可。",
    copyRefused: "浏览器不允许自动复制，请长按选择下面的文字：",
    template: [
      "【丛动体育 · 咨询】",
      "咨询内容：集训 / 篮球升学规划",
      "称呼和电话：",
      "—— 集训 ——",
      "单位或队伍、人数（含教练）：",
      "计划日期：",
      "意向基地：怀柔基地 / 密云营地",
      "—— 升学规划 ——",
      "学生年级：",
      "篮球水平（是否在校队训练）：",
      "方向：小升初 / 初升高（争取高中入学 / 冲刺篮球传统学校 / 运动员等级认证）"
    ]
  },
  en: {
    shown: (n) => (n === 1 ? "Showing 1 facility" : `Showing ${n} facilities`),
    copied: "Inquiry template copied. Open WeChat, paste it, fill it in and send.",
    copyRefused: "Your browser won't copy automatically. Press and hold to select the text below:",
    template: [
      "[CongDong Sports · Inquiry]",
      "About: training camp / basketball pathway planning",
      "Name and phone:",
      "—— Training camp ——",
      "School or team, group size (incl. coaches):",
      "Planned dates:",
      "Preferred base: Huairou Base / Miyun Camp",
      "—— Pathway planning ——",
      "Student's grade:",
      "Basketball level (on a school team?):",
      "Goal: primary to junior high / junior high to senior high (a senior high place / a traditional basketball school / athlete certification)"
    ]
  },
  ja: {
    shown: (n) => `${n}件の施設を表示中`,
    copied: "お問い合わせテンプレートをコピーしました。WeChat に貼り付け、ご記入のうえ送信してください。",
    copyRefused: "ブラウザが自動コピーを許可していません。下の文字を長押しして選択してください：",
    template: [
      "【CONGDONG SPORTS・お問い合わせ】",
      "ご相談内容：合宿／バスケットボール進学プランニング",
      "お名前・電話番号：",
      "―― 合宿 ――",
      "学校・チーム名、人数（コーチを含む）：",
      "希望日程：",
      "希望拠点：懐柔基地／密雲キャンプ",
      "―― 進学プランニング ――",
      "学年：",
      "バスケットボールのレベル（学校のチームで練習しているか）：",
      "方向：小学校→中学校／中学校→高校（高校進学の機会／バスケットボール伝統校／運動員等級認定）"
    ]
  }
};
