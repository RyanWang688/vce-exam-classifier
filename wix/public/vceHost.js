// 页面代码和 HTML 组件（题库页面）之间的消息转发。放到 Wix 的 Public → vceHost.js。
// 本地测试（tests/wix-mock/host.html）用同一份代码，只是把 HTML 组件和后端换成模拟的。
//
// 题库页面发来：{ source: 'vce-app', type: 'ready' }，回复登录信息 { source: 'vce-host', type: 'init', user }；
// 题库页面发来：{ source: 'vce-app', type: 'call', id, method, args }，转给后端，回复 { source: 'vce-host', type: 'reply', id, ok, result | error }。

export const HOST_METHODS = [
  'bankGetAll', 'bankGet', 'bankGetMany', 'bankWrite', 'assetUploadUrl', 'assetConfirm', 'assetUploadBase64',
  'assetHref', 'assetBase64', 'aiStart', 'aiRun', 'aiPoll',
];

export function connectVceApp(component, backend) {
  const reply = (message) => component.postMessage({ source: 'vce-host', ...message });
  component.onMessage(async (event) => {
    const message = event.data;
    if (!message || message.source !== 'vce-app') return;
    if (message.type === 'ready') {
      let user;
      try {
        user = await backend.whoAmI();
      } catch (e) {
        user = { allowed: false, error: e.message || String(e) };
      }
      reply({ type: 'init', protocol: 1, user });
      return;
    }
    if (message.type !== 'call') return;
    if (!HOST_METHODS.includes(message.method) || typeof backend[message.method] !== 'function') {
      reply({ type: 'reply', id: message.id, ok: false, error: `不允许的调用：${message.method}` });
      return;
    }
    try {
      const result = await backend[message.method](...(message.args || []));
      reply({ type: 'reply', id: message.id, ok: true, result });
    } catch (e) {
      reply({ type: 'reply', id: message.id, ok: false, error: e.message || String(e) });
    }
  });
}
