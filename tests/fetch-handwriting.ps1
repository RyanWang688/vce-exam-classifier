# 下载手写题测试图片到 tmp-fixtures/handwriting/（已被 .gitignore 忽略，不进仓库）。
# 1. MathWriting VLM pages（CC-BY-4.0）验证集里的 9 页：真人手写公式，带编号，拍照效果（阴影、倾斜、横线纸），
#    附标准答案（每道的 LaTeX 和位置），用来算转写准确率。
# 2. English Handwritten Math Notes（CC-BY-4.0）的 4 页：真实手写的线性代数笔记扫描件，有文字有公式。
$dir = Join-Path $PSScriptRoot '..\tmp-fixtures\handwriting'
New-Item -ItemType Directory -Force $dir | Out-Null

$u = 'https://datasets-server.huggingface.co/rows?dataset=elejke%2Fmathwriting-vlm-500k&config=human&split=validation&offset=0&length=40'
$rows = (Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 120).Content | ConvertFrom-Json
$want = 4, 7, 8, 9, 12, 16, 20, 21, 19   # 8 页带编号 + 1 页双栏
$truth = @()
foreach ($row in $rows.rows) {
  if ($want -notcontains $row.row_idx) { continue }
  $x = $row.row
  $ext = if ($x.image.src -match '\.png') { 'png' } else { 'jpg' }
  $name = "mw-$($row.row_idx).$ext"
  Invoke-WebRequest -UseBasicParsing $x.image.src -OutFile (Join-Path $dir $name) -TimeoutSec 120
  $truth += [pscustomobject]@{ name = $name; layout = $x.layout; background = $x.background; width = $x.width; height = $x.height; answer = $x.answer; formulas = $x.formulas }
}
$truth | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $dir 'mw-truth.json')

foreach ($n in 10, 25, 40, 60) {
  Invoke-WebRequest -UseBasicParsing "https://huggingface.co/datasets/HumynLabs/English-Handwritten-Math-Notes-Dataset/resolve/main/linear-algebra-kalika102pages-$n.pdf" -OutFile (Join-Path $dir "la-$n.pdf") -TimeoutSec 120
}
Get-ChildItem $dir | Select-Object Name, Length
