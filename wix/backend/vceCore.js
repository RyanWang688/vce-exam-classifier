// 题库后端的核心逻辑。不直接引用 Wix 模块：数据库、媒体库、密钥、权限都由 vce.web.js 传进来，
// 这样本地测试（tests/wix-mock/）可以用模拟的 Wix 接口跑同一份代码。
//
// 表和字段对应 docs/DATA_SCHEMA.md。每条记录整条存成 JSON 文本（json 字段），另外抽出几个字段方便在 CMS 里查看和筛选。

export const COLLECTIONS = {
  questions: 'VceQuestions',
  papers: 'VcePapers',
  assets: 'VceAssets',
  specs: 'VceSpecs',
  feedback: 'VceFeedback',
};
export const AI_JOBS = 'VceAiJobs';
export const KEYS = { questions: 'source_id', papers: 'paper_id', assets: 'id', specs: 'version', feedback: 'id' };
export const ALLOWED_ROLES = ['Admin', 'Teacher']; // 能用题库的会员角色（Wix 里的角色名称）。
export const SECRET_NAME = 'GEMINI_API_KEY';
export const MEDIA_FOLDER = '/vce-bank';

const MAX_JSON = 450 * 1024;          // 单条记录上限 500KB，留出其他字段的余量。
const BULK_BYTES = 3 * 1024 * 1024;   // 批量写入总量上限 4MB，留余量。
const BULK_ITEMS = 1000;              // 批量写入每次最多 1000 条。
const QUERY_LIMIT = 1000;             // 查询每次最多 1000 条。
const MAX_FILE = 25 * 1024 * 1024;    // 经后端转存、交给 AI 的单个文件上限。
const MAX_AI_RESULT = 450 * 1024;     // AI 返回存进任务记录的上限。
const MODEL_PATTERN = /^gemini-[a-z0-9.-]+$/;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

// Wix 的 _id 只用安全字符：其他字符换成 _xx_（十六进制）。同一个 ID 总是得到同一个 _id。
export function wixId(key) {
  return String(key).replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`);
}

// CMS 里方便查看和筛选的字段。
const INDEX_FIELDS = {
  questions: (r) => ({
    paperId: r.paper_id || null, subject: r.subject || null, topic: r.topic || null, questionType: r.question_type || null,
    difficulty: r.difficulty || null, generated: Boolean(r.generated), status: r.status || null, label: (r.source && r.source.label) || null,
  }),
  papers: (r) => ({
    subject: r.subject || null, year: r.year == null ? null : String(r.year),
    label: [r.year, r.publisher, r.paper_title, r.paper_type].filter((p) => p !== null && p !== undefined && p !== '').join(' '),
  }),
  assets: (r) => ({ kind: r.kind || null, owner: r.owner || null, mime: r.mime || null, size: r.size || 0, fileUrl: r.file_url || null }),
  specs: (r) => ({ label: `第 ${r.version} 版` }),
  feedback: (r) => ({ label: r.question || null }),
};

export function createVceApi(deps) {
  const { data, dataOptions, media, getSecret, httpFetch, getRoles, getMemberId, encodeBase64, decodeBase64, now = () => new Date().toISOString() } = deps;

  const tableName = (table) => {
    if (!COLLECTIONS[table]) throw new Error(`没有这张表：${table}`);
    return COLLECTIONS[table];
  };

  // 只有老师（或站点管理员）能用。没登录时 getRoles 会报错。
  async function requireTeacher() {
    let roles;
    try {
      roles = await getRoles();
    } catch (e) {
      throw new Error('请先登录网站。');
    }
    const titles = (roles || []).map((role) => role.title || role.name).filter(Boolean);
    if (!titles.some((title) => ALLOWED_ROLES.includes(title))) throw new Error('这个账号没有老师权限，请联系网站管理员。');
    return { titles, memberId: await getMemberId() };
  }

  function toItem(table, record, memberId) {
    const key = record[KEYS[table]];
    if (key === undefined || key === null || key === '') throw new Error(`${table} 的记录缺少 ${KEYS[table]}`);
    const copy = { ...record };
    delete copy.blob;
    // 操作人以后端为准，前端写的不算。
    if (table === 'questions' || table === 'papers') {
      copy.updated_by = memberId;
      if (!copy.created_by || copy.created_by === 'local' || copy.created_by === 'wix') copy.created_by = memberId;
    }
    const json = JSON.stringify(copy);
    if (json.length > MAX_JSON) throw new Error(`${table} 的记录 ${key} 太大（${Math.round(json.length / 1024)} KB），超过网站数据库单条上限。`);
    return { _id: wixId(key), recordKey: String(key), updatedAt: copy.updated_at || null, json, ...INDEX_FIELDS[table](copy) };
  }

  const fromItem = (item) => (item && item.json ? JSON.parse(item.json) : null);

  async function getItems(table, keys) {
    const name = tableName(table);
    const out = [];
    for (let i = 0; i < keys.length; i += QUERY_LIMIT) {
      const chunk = keys.slice(i, i + QUERY_LIMIT).map(wixId);
      const result = await data.query(name).hasSome('_id', chunk).limit(QUERY_LIMIT).find(dataOptions);
      out.push(...result.items);
    }
    const byId = new Map(out.map((item) => [item._id, item]));
    return keys.map((key) => byId.get(wixId(key)) || null);
  }

  // 按大小和条数分批写入。
  async function bulkSave(name, items) {
    let batch = [];
    let bytes = 0;
    const flush = async () => {
      if (batch.length) await data.bulkSave(name, batch, dataOptions);
      batch = [];
      bytes = 0;
    };
    for (const item of items) {
      const size = item.json ? item.json.length + 512 : 1024;
      if (batch.length >= BULK_ITEMS || bytes + size > BULK_BYTES) await flush();
      batch.push(item);
      bytes += size;
    }
    await flush();
  }

  async function bulkRemove(name, ids) {
    for (let i = 0; i < ids.length; i += BULK_ITEMS) await data.bulkRemove(name, ids.slice(i, i + BULK_ITEMS), dataOptions);
  }

  async function allIds(name) {
    const ids = [];
    let result = await data.query(name).limit(QUERY_LIMIT).find(dataOptions);
    ids.push(...result.items.map((item) => item._id));
    while (result.hasNext()) {
      result = await result.next();
      ids.push(...result.items.map((item) => item._id));
    }
    return ids;
  }

  async function trash(fileUrls) {
    const list = fileUrls.filter(Boolean);
    if (!list.length) return;
    try {
      await media.moveFilesToTrash(list);
    } catch (e) {
      console.warn('媒体库文件没能移到回收站', e); // 不影响题库记录。
    }
  }

  async function fileBytes(fileUrl) {
    const href = await media.getDownloadUrl(fileUrl, null, null, null);
    const response = await httpFetch(href, { method: 'get' });
    if (!response.ok) throw new Error(`下载文件失败（${response.status}）`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_FILE) throw new Error('文件太大，无法经后台读取。');
    return buffer;
  }

  const mediaOptions = (meta) => {
    const mime = meta.mime || 'application/octet-stream';
    return {
      mediaOptions: { mimeType: mime, mediaType: mime.startsWith('image/') ? 'image' : 'document' },
      // 原卷和临时文件不公开；裁图和配图要能直接显示。
      metadataOptions: { isPrivate: meta.kind === 'source' || meta.kind === 'temp', isVisitorUpload: false, context: { assetId: String(meta.id || '') } },
    };
  };
  const extension = (mime) => ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' }[mime] || '');
  const fileNameFor = (meta) => `${wixId(meta.id || 'file').slice(-80)}${extension(meta.mime)}`;
  const folderFor = (meta) => `${MEDIA_FOLDER}/${meta.kind || 'other'}`;

  return {
    async whoAmI() {
      try {
        const { titles, memberId } = await requireTeacher();
        return { allowed: true, roles: titles, memberId };
      } catch (e) {
        return { allowed: false, error: e.message };
      }
    },

    async bankGetAll(table, skip = 0, limit = 300) {
      await requireTeacher();
      const result = await data.query(tableName(table)).ascending('_id').skip(skip).limit(Math.min(limit, QUERY_LIMIT)).find(dataOptions);
      return { items: result.items.map(fromItem), hasNext: result.hasNext() };
    },

    async bankGet(table, key) {
      await requireTeacher();
      const [item] = await getItems(table, [key]);
      return fromItem(item);
    },

    async bankGetMany(table, keys) {
      await requireTeacher();
      return (await getItems(table, keys)).map(fromItem);
    },

    // ops：[{ table, put: [记录], remove: [主键], clear: true }]，按顺序执行（Wix 没有事务）。
    async bankWrite(ops) {
      const { memberId } = await requireTeacher();
      for (const { table, put = [], remove = [], clear = false } of ops) {
        const name = tableName(table);
        if (clear) {
          const ids = await allIds(name);
          if (table === 'assets') {
            for (let i = 0; i < ids.length; i += QUERY_LIMIT) {
              const result = await data.query(name).hasSome('_id', ids.slice(i, i + QUERY_LIMIT)).limit(QUERY_LIMIT).find(dataOptions);
              await trash(result.items.map((item) => item.fileUrl));
            }
          }
          await bulkRemove(name, ids);
        }
        if (remove.length) {
          if (table === 'assets') await trash((await getItems(table, remove)).filter(Boolean).map((item) => item.fileUrl));
          await bulkRemove(name, remove.map(wixId));
        }
        if (put.length) {
          const items = put.map((record) => toItem(table, record, memberId));
          if (table === 'assets') {
            // 同一个文件 ID 重新上传了：旧文件移到回收站。
            const old = await getItems(table, put.map((record) => record.id));
            await trash(old.filter(Boolean).filter((item, i) => item.fileUrl && item.fileUrl !== items[i].fileUrl).map((item) => item.fileUrl));
          }
          await bulkSave(name, items);
        }
      }
      return { ok: true };
    },

    // 浏览器直接上传：给一个一次性的上传地址。
    async assetUploadUrl(meta) {
      await requireTeacher();
      const result = await media.getUploadUrl(folderFor(meta), mediaOptions(meta));
      return { uploadUrl: result.uploadUrl, fileName: fileNameFor(meta) };
    },

    // 直接上传后，按媒体库的文件名查出文件地址。
    async assetConfirm(mediaFileName) {
      await requireTeacher();
      const info = await media.getFileInfo(mediaFileName);
      return { fileUrl: info.fileUrl, fileName: info.fileName || mediaFileName };
    },

    // 浏览器传不上去时的备用办法：内容经后端转存。
    async assetUploadBase64(meta, base64) {
      await requireTeacher();
      const bytes = decodeBase64(base64);
      if (bytes.length > MAX_FILE) throw new Error('文件太大，无法经后台转存。');
      const info = await media.upload(folderFor(meta), bytes, fileNameFor(meta), mediaOptions(meta));
      return { fileUrl: info.fileUrl, fileName: info.fileName || null };
    },

    // 文件的下载地址（一次性）。
    async assetHref(key) {
      await requireTeacher();
      const [item] = await getItems('assets', [key]);
      if (!item || !item.fileUrl) throw new Error(`没有这个文件：${key}`);
      return media.getDownloadUrl(item.fileUrl, null, null, null);
    },

    // 浏览器下载不了时（跨域限制），由后端读出内容转成 base64。
    async assetBase64(key) {
      await requireTeacher();
      const [item] = await getItems('assets', [key]);
      if (!item || !item.fileUrl) return null;
      return encodeBase64(await fileBytes(item.fileUrl));
    },

    // AI 调用分三步：aiStart 建任务 → aiRun 在后台调用 Gemini（前端不等它）→ aiPoll 取结果。
    async aiStart() {
      const { memberId } = await requireTeacher();
      const job = await data.insert(AI_JOBS, { status: 'running', createdBy: memberId, createdAt: now() }, dataOptions);
      return { jobId: job._id };
    },

    async aiRun(jobId, model, body, tempFiles = []) {
      await requireTeacher();
      const finish = async (fields) => {
        const job = await data.get(AI_JOBS, jobId, dataOptions);
        if (job) await data.update(AI_JOBS, { ...job, ...fields, finishedAt: now() }, dataOptions);
      };
      try {
        if (!MODEL_PATTERN.test(model)) throw new Error(`模型名称不对：${model}`);
        // 前端先传到媒体库的大文件：取回内容，换成 Gemini 能用的 inlineData。
        const contents = [];
        for (const content of body.contents || []) {
          const parts = [];
          for (const part of content.parts || []) {
            if (part.wixMedia) {
              parts.push({ inlineData: { mimeType: part.wixMedia.mimeType, data: encodeBase64(await fileBytes(part.wixMedia.fileUrl)) } });
            } else {
              parts.push(part);
            }
          }
          contents.push({ ...content, parts });
        }
        const key = await getSecret(SECRET_NAME);
        const response = await httpFetch(`${GEMINI_BASE}${model}:generateContent`, {
          method: 'post',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ ...body, contents }),
        });
        const text = await response.text();
        if (text.length > MAX_AI_RESULT) throw new Error('AI 返回的内容太大，存不进任务记录。');
        // 出错的状态码和内容原样交给前端，前端按本地版同样的规则解释（额度、Key 无效等）。
        await finish({ status: 'done', httpStatus: response.status, result: text });
      } catch (e) {
        await finish({ status: 'failed', error: e.message || String(e) });
      } finally {
        await trash(tempFiles);
      }
      return { ok: true };
    },

    async aiPoll(jobId) {
      await requireTeacher();
      const job = await data.get(AI_JOBS, jobId, dataOptions);
      if (!job) return { status: 'failed', error: '任务不存在。' };
      if (job.status === 'running') return { status: 'running' };
      await data.remove(AI_JOBS, jobId, dataOptions); // 结果取走后删掉任务，集合不会越积越多。
      return { status: job.status, httpStatus: job.httpStatus || null, result: job.result || null, error: job.error || null };
    },
  };
}
