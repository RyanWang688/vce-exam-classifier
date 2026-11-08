$out = Join-Path $PSScriptRoot '..\..\tmp-fixtures\reports'
New-Item -ItemType Directory -Force $out | Out-Null
$a = 'https://vcaacorporateprod.prod.acquia-sites.com/sites/default/files'
$b = 'https://www.vcaa.vic.edu.au/sites/default/files'
$m = 'Documents/exams/mathematics'
$map = [ordered]@{
  '2025MM1' = "$a/2026-01/2025-MathematicalMethods1-report.docx"; '2025MM2' = "$a/2026-02/2025-MathematicalMethods2-report_0.docx"
  '2025NMM1' = "$a/2025-10/2025-NHT-math-methods1-report.docx"; '2025NMM2' = "$a/2025-10/2025-NHT-math-methods2-report.docx"
  '2024MM1' = "$a/2025-10/2024mathematicalmethods1-report.docx"; '2024MM2' = "$a/2025-10/2024mathematicalmethods2-report.docx"
  '2024NMM1' = "$b/$m/2024/NHT/2024NHTmathmethods1-report.docx"; '2024NMM2' = "$b/$m/2024/NHT/2024NHTmathmethods-2-report.docx"
  '2023MM1' = "$b/$m/2023/2023mathmethods1-report.docx"; '2023MM2' = "$b/$m/2023/2023mathmethods2-report.docx"
  '2023NMM1' = "$b/$m/2023/NHT/2023mathmethods1-NHT-report.docx"; '2023NMM2' = "$b/$m/2023/NHT/2023mathsmethods2-NHT-report.docx"
  '2025SM1' = "$a/2026-01/2025-SpecialistMaths1-report.docx"; '2025SM2' = "$a/2026-02/2025-SpecialistMaths2-report.docx"
  '2025NSM1' = "$a/2025-10/2025-NHT-specialist-maths1-report_0.docx"; '2025NSM2' = "$a/2025-10/2025-NHT-specialist-maths2-report.docx"
  '2024SM1' = "$a/2025-11/2024specialistmaths1-report.docx"; '2024SM2' = "$a/2025-11/2024specialistmaths2-report.docx"
  '2024NSM1' = "$b/$m/2024/NHT/2024NHTspecialistmath-1-report.docx"; '2024NSM2' = "$b/$m/2024/NHT/2024NHTspecialistmath2-report.docx"
  '2023SM1' = "$b/$m/2023/2023specialistmaths1-report.docx"; '2023SM2' = "$b/$m/2023/2023specialistmaths2-report.docx"
  '2023NSM1' = "$b/$m/2023/NHT/2023specmaths1-NHT-report.docx"; '2023NSM2' = "$b/$m/2023/NHT/2023specmaths2%20NHT-report.docx"
  '2025GM1' = "$a/2026-02/2025-GeneralMaths1-report.docx"; '2025GM2' = "$a/2026-01/2025-GeneralMaths2-report.docx"
  '2025NGM1' = "$a/2025-10/2025-NHT-general-maths1-report.docx"; '2025NGM2' = "$a/2025-10/2025-NHT-general-maths2-report.docx"
  '2024GM1' = "$a/2025-03/2024generalmaths1-report.docx"; '2024GM2' = "$a/2025-03/2024generalmaths2-report.docx"
  '2024NGM1' = "$a/2026-10/2024-NHTgeneralmaths1-report.docx"; '2024NGM2' = "$b/$m/2024/NHT/2024NHTgeneralmaths2-report.docx"
  '2023GM1' = "$b/2025-07/2023generalmaths1-report.docx"; '2023GM2' = "$b/$m/2023/2023generalmaths2%20report.docx"
}
foreach ($k in $map.Keys) {
  $f = Join-Path $out "$k.docx"
  try { Invoke-WebRequest -UseBasicParsing -Uri $map[$k] -OutFile $f -TimeoutSec 60; "$k $((Get-Item $f).Length)" } catch { "$k FAIL $($_.Exception.Message)" }
}
