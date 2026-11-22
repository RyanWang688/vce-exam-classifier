# 下载回归检查要用的 VCAA 公开试卷。试卷有版权，只放在被 .gitignore 忽略的 tmp-fixtures/ 里。
# VCAA 官网维护时，同样的文件在它的备用服务器上也能下载，所以两个地址依次尝试。
$target = Join-Path $PSScriptRoot '..\tmp-fixtures\vcaa'
New-Item -ItemType Directory -Force $target | Out-Null
$hosts = @(
  'https://www.vcaa.vic.edu.au/sites/default/files',
  'https://vcaacorporateprod.prod.acquia-sites.com/sites/default/files'
)
$files = [ordered]@{
  '2023specmath1-w.pdf'     = 'Documents/exams/mathematics/2023/2023specmath1-w.pdf'
  '2023MM2-w.pdf'           = 'Documents/exams/mathematics/2023/2023MM2-w.pdf'
  '2024MM2-nht-w.pdf'       = 'Documents/exams/mathematics/2024/NHT/2024MM2-nht-w.pdf'
  '2024MM1-w.pdf'           = 'Documents/exams/mathematics/2024/2024MM1-w.pdf'
  '2023genmath1-w.pdf'      = 'Documents/exams/mathematics/2023/2023genmath1-w.pdf'
  '2024GeneralMaths1-w.pdf' = 'Documents/exams/mathematics/2024/2024GeneralMaths1-w.pdf'
  '2025SM2.pdf'             = '2025-11/2025-SpecialistMaths2.pdf'
  '2025MM2.pdf'             = '2025-11/2025-MathMethods2.pdf'
  '2025GM2.pdf'             = '2025-11/2025-GeneralMaths2.pdf'
  '2025MM1.pdf'             = '2025-11/2025-MathMethods1.pdf'
  '2023genmath2-w.pdf'      = 'Documents/exams/mathematics/2023/2023genmath2-w.pdf'
}
foreach ($name in $files.Keys) {
  $out = Join-Path $target $name
  $ok = $false
  foreach ($h in $hosts) {
    try {
      Invoke-WebRequest -UseBasicParsing -OutFile $out "$h/$($files[$name])" -TimeoutSec 90 -ErrorAction Stop
      $head = [Text.Encoding]::ASCII.GetString((Get-Content $out -Encoding Byte -TotalCount 5))
      if ($head -eq '%PDF-') { $ok = $true; break }
    } catch { }
  }
  if (-not $ok) { Write-Output "下载失败：$name" }
}
Write-Output '其余文件请手动复制到 tmp-fixtures/vcaa/：mocksac.pdf、mocksac.docx、AURORA1.pdf、AURORA2.pdf'
