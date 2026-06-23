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

export function initGraph(container: HTMLElement, data: { nodes: any[]; edges: any[] }) {
  const elements = [
    ...data.nodes.map((n) => ({ data: { id: n.id, label: n.label, category: n.category, url: n.url, size: 14 + Math.min(n.indegree, 20) * 2 } })),
    ...data.edges.map((e) => ({ data: { source: e.source, target: e.target } })),
  ];
  const cy = cytoscape({
    container,
    elements,
    style: [
      { selector: 'node', style: {
        'background-color': (ele: any) => CATEGORY_COLORS[ele.data('category')] ?? '#6f756e',
        'label': 'data(label)', 'font-size': 8, 'width': 'data(size)', 'height': 'data(size)',
        'color': '#25302b', 'text-valign': 'bottom' } },
      { selector: 'edge', style: { 'width': 1, 'line-color': '#cfc6b3', 'curve-style': 'bezier',
        'target-arrow-shape': 'triangle', 'target-arrow-color': '#cfc6b3', 'arrow-scale': 0.6 } },
      { selector: 'node:active, node.hl', style: { 'border-width': 2, 'border-color': '#9b7a44' } },
    ],
    layout: { name: 'cose-bilkent', animate: false, idealEdgeLength: 80, nodeRepulsion: 4500 } as any,
  });
  cy.on('tap', 'node', (evt) => { const url = evt.target.data('url'); if (url) window.location.href = url; });
  return cy;
}
