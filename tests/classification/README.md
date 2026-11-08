# 分类规则与评分

- `rules.py`：有序判定规则。`install_rules.py` 把它写入 `index.html`。
- `labels_*.py`：人工标注（只有题号和知识点代码）。标注由 Claude 按 Study Design 完成，未经老师确认。dev 是训练卷，blind 是用过的第一轮盲测，final 是最终盲测。
- `batch.js`、`receive_many.py`：在页面里批量跑试卷，结果存到本地目录。放进 `tmp-fixtures/` 后在页面控制台加载，试卷文件不进仓库。
- `score.py <结果目录> labels_final errors`：计算严格和宽松准确率。

改规则后要重新跑回归。final 这批已经用过一次，继续拿它调规则后，它的分数就不再是盲测结果，要换新试卷。
## 难度表

- `get_reports.ps1`：下载 VCAA 考试报告到被忽略的 `tmp-fixtures/reports/`。
- `parse_reports.py <目录> <输出.json>`：算出每题得分率。结果写在 `index.html` 的 `VCAA_FACILITY`（只收正式考试；NHT 报告没有统计）。
