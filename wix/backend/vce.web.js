// Velo Web Module：题库读写、媒体库文件、AI 调用。放到 Wix 的 Backend → vce.web.js。
// 逻辑都在 vceCore.js；这里只把真实的 Wix 接口接进去。
//
// 权限：web method 设为 Anyone，是因为老师是普通网站会员，不是站点协作者；
// 每个方法进来都会在 vceCore 里检查会员角色（Admin 或 Teacher），没有角色的人什么也做不了。

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { mediaManager } from 'wix-media-backend';
import { secrets } from 'wix-secrets-backend.v2';
import { currentMember } from 'wix-members-backend';
import { elevate } from 'wix-auth';
import { fetch } from 'wix-fetch';
import { createVceApi } from 'backend/vceCore';

const api = createVceApi({
  data: wixData,
  dataOptions: { suppressAuth: true }, // 集合都设为仅管理员可读写，后端代为读写；权限由角色检查把关。
  media: mediaManager,
  async getSecret(name) {
    const result = await elevate(secrets.getSecretValue)(name);
    return typeof result === 'string' ? result : result.value;
  },
  httpFetch: fetch,
  getRoles: () => currentMember.getRoles(),
  async getMemberId() {
    const member = await currentMember.getMember();
    return member ? member._id : 'unknown';
  },
  encodeBase64: (buffer) => Buffer.from(buffer).toString('base64'),
  decodeBase64: (text) => Buffer.from(text, 'base64'),
});

const expose = (name) => webMethod(Permissions.Anyone, (...args) => api[name](...args));

export const whoAmI = expose('whoAmI');
export const bankGetAll = expose('bankGetAll');
export const bankGet = expose('bankGet');
export const bankGetMany = expose('bankGetMany');
export const bankWrite = expose('bankWrite');
export const assetUploadUrl = expose('assetUploadUrl');
export const assetConfirm = expose('assetConfirm');
export const assetUploadBase64 = expose('assetUploadBase64');
export const assetHref = expose('assetHref');
export const assetBase64 = expose('assetBase64');
export const aiStart = expose('aiStart');
export const aiRun = expose('aiRun');
export const aiPoll = expose('aiPoll');
