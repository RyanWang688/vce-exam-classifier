# 下载回归检查要用的 VCAA 公开试卷。试卷有版权，只放在被 .gitignore 忽略的 tmp-fixtures/ 里。
$target = Join-Path $PSScriptRoot '..\tmp-fixtures\vcaa'
New-Item -ItemType Directory -Force $target | Out-Null
$base = 'https://www.vcaa.vic.edu.au/sites/default/files/Documents/exams/mathematics'
foreach ($path in '2023/2023specmath1-w', '2023/2023MM2-w', '2024/NHT/2024MM2-nht-w') {
  $name = Split-Path $path -Leaf
  Invoke-WebRequest -UseBasicParsing -OutFile (Join-Path $target "$name.pdf") "$base/$path.pdf"
}
Write-Output '其余文件请手动复制到 tmp-fixtures/vcaa/：mocksac.pdf、mocksac.docx、2025SM2.pdf、2025MM2.pdf、2025GM2.pdf、AURORA1.pdf、AURORA2.pdf'
