// 测试用空 stub：markora 的 math/mermaid 插件在 Node 环境导入 CSS 会失败，
// 这里把 katex 重定向到空实现，避免影响编辑器组件测试。
export const renderToString = () => '';
export const render = () => {};
export default { renderToString: () => '', render: () => {} };
