import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
cytoscape.use(coseBilkent);

const CATEGORY_COLORS: Record<string, string> = {
  '核心哲学': '#486b55', '投资理念': '#6a8d73', '企业经营': '#9b7a44',
  '财务指标': '#8a8f5a', '品格与心性': '#a86f5c', '公司': '#5c7a99',
  '行业': '#7a6c99', '人物': '#b08968', '保险、浮存金与风险': '#5a8f8a',
  '市场周期与风险控制': '#99635c', '宏观经济与投资环境': '#6f756e',
  // 3 个兜底分类(不在 registry)也要着色,否则 29 个节点全灰
  '分类总论': '#5f6b63', '问题': '#9a7b53', '时间线': '#7e7468',
};

// 图谱随主题变色:节点分类色够饱和,浅/深/绿三主题都清晰,保持不变;
// 只让标签、连线、高亮描边取当前主题的 CSS 变量,切换主题时重绘。
function themeColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    label: v('--text', '#25302b'),
    edge: v('--text-muted', '#cfc6b3'),
    accent: v('--accent', '#9b7a44'),
  };
}

function graphStyle() {
  const c = themeColors();
  return [
    { selector: 'node', style: {
      'background-color': (ele: any) => CATEGORY_COLORS[ele.data('category')] ?? '#6f756e',
      'label': 'data(label)', 'font-size': 8, 'width': 'data(size)', 'height': 'data(size)',
      'color': c.label, 'text-valign': 'bottom' } },
    { selector: 'edge', style: { 'width': 1, 'line-color': c.edge, 'curve-style': 'bezier',
      'target-arrow-shape': 'triangle', 'target-arrow-color': c.edge, 'arrow-scale': 0.6 } },
    { selector: 'node:active, node.hl', style: { 'border-width': 2, 'border-color': c.accent } },
  ] as any;
}

export function initGraph(container: HTMLElement, data: { nodes: any[]; edges: any[] }) {
  const elements = [
    ...data.nodes.map((n) => ({ data: { id: n.id, label: n.label, category: n.category, url: n.url, size: 14 + Math.min(n.indegree, 20) * 2 } })),
    ...data.edges.map((e) => ({ data: { source: e.source, target: e.target } })),
  ];
  const cy = cytoscape({
    container,
    elements,
    style: graphStyle(),
    layout: { name: 'cose-bilkent', animate: false, idealEdgeLength: 80, nodeRepulsion: 4500 } as any,
  });
  cy.on('tap', 'node', (evt) => { const url = evt.target.data('url'); if (url) window.location.href = url; });
  window.addEventListener('themechange', () => cy.style(graphStyle()));
  return cy;
}
