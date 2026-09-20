export type FinancialResult = 'financial' | 'paused' | 'excluded' | 'research';

interface DecisionAnswer {
  label: string;
  next: number | FinancialResult;
  reason?: string;
}

interface DecisionStep {
  label: string;
  question: string;
  guide: string;
  anchor: string;
  answers: DecisionAnswer[];
}

export const financialResults: Record<FinancialResult, { title: string; explanation: string }> = {
  financial: {
    title: '转入金融业专门分析',
    explanation: '银行、保险等金融企业需要专门分析资产质量、资本充足、期限错配，以及承保与准备金等问题。',
  },
  paused: {
    title: '暂缓判断',
    explanation: '先补齐信息或等待经营证据。无法判断时，保留“不买”的选择。',
  },
  excluded: {
    title: '排除这家公司',
    explanation: '已有明确问题，当前不进入买入研究。若事实发生实质变化，再重新评估。',
  },
  research: {
    title: '继续研究',
    explanation: '通过财报排除关，不等于可以买。还需研究护城河、估值与安全边际。',
  },
};

export const financialSteps: DecisionStep[] = [
  {
    label: '行业分流',
    question: '公司是否属于银行、保险等金融业？',
    guide: '先确认主营业务。金融企业的资产、负债与现金流，需要使用专门的分析口径。',
    anchor: 'hang-ye-fen-liu',
    answers: [
      { label: '是，属于金融业', next: 'financial', reason: '这套普通企业财报判断流程不适合直接套用在金融企业上。' },
      { label: '否，属于普通非金融企业', next: 1 },
      { label: '还不清楚', next: 'paused', reason: '尚未确认企业的业务性质，暂时无法选择合适的财报分析口径。' },
    ],
  },
  {
    label: '读懂生意',
    question: '能否解释主营赚钱方式、关键资产负债与核心附注？',
    guide: '试着用自己的话说清楚：钱从哪里来，主要资产是什么，最重要的义务和风险在哪里。',
    anchor: 'du-dong',
    answers: [
      { label: '能，关键问题可以解释清楚', next: 2 },
      { label: '不能，仍有关键问题看不懂', next: 'paused', reason: '主营业务、关键资产负债或核心附注仍无法理解，缺少形成可靠判断的基础。' },
    ],
  },
  {
    label: '核查诚信',
    question: '重大会计异常是否已解释清楚，且无管理层误导的可靠证据？',
    guide: '核对收入确认、资本化、折旧、减值及调整后利润。异常是调查线索，不能单凭一个比率认定造假。',
    anchor: 'cheng-xin',
    answers: [
      { label: '是，已核查清楚', next: 3 },
      { label: '有可靠的误导或虚增证据', next: 'excluded', reason: '可靠证据表明管理层误导或利润虚增，财报已失去作为投资判断基础的可信度。' },
      { label: '还没查清', next: 'paused', reason: '会计异常尚未查明。先核对原始披露、附注及管理层解释，再决定是否继续。' },
    ],
  },
  {
    label: '检查偿债',
    question: '假设经营恶化且不能续借，现有可用现金与保守现金流能否覆盖债务及必要支出？',
    guide: '按债务到期时间逐期看缺口，并扣除受限现金、利息与维持经营必需的支出。',
    anchor: 'chang-zhai',
    answers: [
      { label: '能，有可核实的覆盖能力', next: 4 },
      { label: '不能，存在无法覆盖的资金缺口', next: 'excluded', reason: '在保守情景下，企业无法覆盖债务和必要支出，生存依赖持续再融资。' },
      { label: '不确定', next: 'paused', reason: '债务到期、可用现金或未来必要支出尚不清楚，无法确认企业能否撑过困难。' },
    ],
  },
  {
    label: '验证现金',
    question: '跨周期利润能否合理转成现金，扣除维持投入后所有者收益是否可持续？',
    guide: '看多年累计与行业周期，区分扩张投入和维持投入；单年现金流偏弱不能直接判定为坏生意。',
    anchor: 'xian-jin',
    answers: [
      { label: '能，所有者收益可持续', next: 5 },
      { label: '长期恶化，且无合理修复依据', next: 'excluded', reason: '利润长期无法转成可供所有者支配的真实收益，且没有合理的修复依据。' },
      { label: '只是暂时异常，或信息还不足', next: 'paused', reason: '需要进一步辨别周期波动、营运资金占用和维持性资本开支，暂不足以下结论。' },
    ],
  },
  {
    label: '衡量回报',
    question: '不靠过度杠杆或会计调整，存量资本与新增投入能否获得合理回报？',
    guide: '对照同行和完整周期，检查历史投入及新增资本的回报，而不是只看利润规模或单年 ROE。',
    anchor: 'hui-bao',
    answers: [
      { label: '能，资本回报合理', next: 'research', reason: '在你提供的判断下，暂未发现上述财报排除项；这还不能证明企业值得以当前价格买入。' },
      { label: '长期低回报，且被迫持续投入', next: 'excluded', reason: '企业必须不断投入资金才能维持经营，却长期无法获得合理回报，增长未必能增加股东价值。' },
      { label: '不确定', next: 'paused', reason: '尚不能分辨利润增长来自良好的资本效率，还是更多投入、杠杆或会计调整。' },
    ],
  },
];
