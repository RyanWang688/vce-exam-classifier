# 题库数据结构

本地版存在浏览器的 IndexedDB 里，迁到 Wix 后每张表对应一个 Wix 数据集合，文件放进 Wix 媒体库。
页面只通过“题库接口”（`index.html` 里的 `bank`）读写，换存储时只换底层的驱动（`driver`），切题、分类、组卷的代码不用改。

当前版本：记录版本 `schema_version = 2`，IndexedDB 版本 3。

## 表

| 表 | 主键 | 内容 | Wix 里对应 |
|---|---|---|---|
| `papers` | `paper_id` | 每份试卷一条：来源信息、原卷文件、重新裁图要用的页面数据 | 集合 Papers |
| `questions` | `source_id` | 每道题一条：分类结果、裁图位置、审核状态；AI 出的题也在这里（`generated: true`） | 集合 Questions，`paper_id` 是指向 Papers 的引用字段 |
| `assets` | `id` | 图片和原卷文件本身（Blob） | Wix 媒体库；记录里只存文件链接 |
| `specs` | `version` | 出题规范的每个版本 | 集合 Specs |
| `feedback` | `id` | 老师审核 AI 题的意见 | 集合 Feedback |

记录里不再直接放图片（以前每题的截图是几十到几百 KB 的 base64）。图片单独存成文件，记录里写文件 ID。
这样题库列表、组卷筛题时不用读图片，题目多了也不会变慢；迁到 Wix 时也不会超过单条记录的大小限制。

## papers

| 字段 | 说明 |
|---|---|
| `paper_id` | 原卷文件的 SHA-256；算不出来时用来源信息拼的 ID |
| `subject`、`unit`、`year`、`publisher`、`paper_title`、`paper_type` | 来源信息（和试卷信息栏一致） |
| `info` | 解析出的试卷信息原样保存（重新打开试卷时用） |
| `file_name`、`files`、`file_type` | 原文件名、多张图片时的每个文件名、类型（pdf / images / docx） |
| `source_assets` | 原卷文件在 `assets` 里的 ID，按页顺序 |
| `crop` | 重新裁图要用的页面数据：每页的页眉页脚位置（`pages`）、扫描件的页码位置（`page_marks`）。Word 为 `null` |
| `meta` | 分析时间、封面核对结果、考试报告难度、裁图对账结果等 |
| `question_ids` | 这份试卷的题目 ID |
| `created_at`、`updated_at`、`created_by`、`updated_by` | 时间和操作人。本地版操作人是 `local`，Wix 里填会员 ID |

## questions

| 字段 | 说明 |
|---|---|
| `source_id` | 题目 ID：出版方-年份-试卷名-类型-Section-题号。重新分析同一份试卷时覆盖旧记录 |
| `paper_id` | 所属试卷；AI 出的题为 `null` |
| `subject`、`unit` | 冗余一份，组卷筛题时不用再查试卷 |
| `source` | 给人看的来源（`label`）和来源信息，冗余一份 |
| `question_number`、`section`、`area`、`page` | 题号、Section、Module/Area、起始页 |
| `text`、`sub_parts` | 提取的文字和小问（后台用于分类和检索，页面显示裁图） |
| `marks`、`marks_mismatch` | 分值；小问分值之和不等于总分时为 `true` |
| `topic`、`topic_fit`、`alternative_topics`、`reason` | 知识点和判断依据 |
| `question_type`、`difficulty`、`difficulty_source`、`facility` | 题型、难度、难度来源（teacher / vcaa-report）、考试报告得分率 |
| `confidence`、`math_problems`、`review_reasons` | 读取可信度、公式要核对的地方、复核原因 |
| `confirmed`、`edited`、`ai_original` | 老师已确认、改过分类、算法或 AI 的原始结果 |
| `snapshot_asset` | 裁图在 `assets` 里的 ID |
| `heading_box` | 裁图里原题号的位置（组卷换题号用） |
| `crop` | 裁图范围：`regions`（每段的页码和上下边界）、`auto`（自动裁图的范围）、`raw`（不擦页眉页脚）、`heading`（题号行在原卷上的位置）、`flags_auto`（自动对账的提示） |
| `crop_flags`、`crop_edited` | 裁图提示、老师是否手动调整过 |
| `figures` | 配图：页码、位置、说明，图片在 `image_asset` |
| `created_at`、`updated_at`、`created_by`、`updated_by` | 同上 |
| AI 题另有 | `generated`、`status`（pending / approved / rejected）、`stem`、`options`、`gen_parts`、`answers`、`solution`、`marking`、`figure`（本地画图用的函数和范围）、`based_on`（范例题 ID）、`spec_version`、`model`、`check`、`check_ok`、`reviewed`，见出题代码 `generateQuestion` |

## assets

| 字段 | 说明 |
|---|---|
| `id` | 由用途决定，例如 `<source_id>#snapshot`、`<source_id>#figure-0`、`<paper_id>#source-0`。同一题重新保存时覆盖，不会越存越多 |
| `kind` | snapshot / figure / source |
| `mime`、`size` | 文件类型和大小 |
| `blob` | 文件内容 |
| `owner` | 所属题目或试卷的 ID，删题、删试卷时一起删 |

## 版本升级

- 记录版本 1（2026-11-22 以前）：图片以 base64 直接放在题目记录里，没有 `papers` 表。打开页面时自动升级：图片拆进 `assets`，按题目来源补出 `papers`。旧试卷没有保存原卷，要调整裁图需重新分析一次。
- 导入题库时也会按同样规则升级旧格式（包括以前“导出题库 JSON”得到的文件）。

## 导出 / 导入

“导出完整题库”生成一个 ZIP：

- `bank.json`：`{ format: "vce-question-bank", schema_version, exported_at, papers, questions, specs, feedback, assets }`，其中 `assets` 只有文件信息，不含内容
- `assets/<文件名>`：每个文件一份

导入时按主键合并：同一题、同一份试卷以 `updated_at` 较新的为准；规范按版本号合并；审核意见按 ID 去重。这也是把本地题库搬到 Wix 的通道。

## 迁到 Wix 时要换的部分

1. 写一个 Wix 驱动，实现 `getAll / get / put / remove / clear` 五个方法，分别调用 `wix-data`；`assets` 表改为上传到媒体库、返回文件链接。
2. 把 `created_by`、`updated_by` 改为当前会员 ID，并在集合权限里限制谁能删除。
3. 题目多了以后，组卷改为按科目、知识点、难度在服务端查询并分页，不再一次读全部题目。
