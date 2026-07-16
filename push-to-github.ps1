# ============================================================
#  Комит и push към съществуващото repo:
#  https://github.com/s2kdesign-com/europe-projects
#
#  Как да го стартираш (PowerShell, в папката dashboard):
#     powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
#  При поискване въведи своя GitHub вход (браузър или токен).
# ============================================================

$ErrorActionPreference = "Stop"
$Remote = "https://github.com/s2kdesign-com/europe-projects.git"
$Msg = "Обзор: период 30/60/90 в „Какво е ново“ + Тип кандидат/Програма на ред; карти: бутон Документи, без календарния бутон; fix мобилен overflow (sr-only таблици) + компактен cookie bottom sheet; премахната KPI „Изтичащи до 7 дни“"

# Работим в папката на скрипта (dashboard)
Set-Location -Path $PSScriptRoot
Write-Host "Папка: $(Get-Location)" -ForegroundColor Cyan

# 1) Ако локалното .git е повредено/липсва — реинициализирай
$needInit = $true
if (Test-Path ".git") {
  try { git rev-parse --git-dir *> $null; if ($LASTEXITCODE -eq 0) { $needInit = $false } } catch {}
}
if ($needInit) {
  Write-Host "Инициализирам ново git repo..." -ForegroundColor Yellow
  if (Test-Path ".git") { Remove-Item -Recurse -Force ".git" }
  git init | Out-Null
}

# 2) Настрой remote „origin“ към съществуващото repo
$existing = (git remote 2>$null)
if ($existing -match "origin") { git remote set-url origin $Remote } else { git remote add origin $Remote }
Write-Host "origin -> $Remote" -ForegroundColor Cyan

# 3) Вземи историята и открий основния клон (main или master)
git fetch origin
$branch = "main"
git show-ref --verify --quiet refs/remotes/origin/main
if ($LASTEXITCODE -ne 0) {
  git show-ref --verify --quiet refs/remotes/origin/master
  if ($LASTEXITCODE -eq 0) { $branch = "master" }
}
Write-Host "Основен клон: $branch" -ForegroundColor Cyan

# 4) Постави HEAD върху върха на отдалечения клон, БЕЗ да пипаш работните файлове,
#    така че всички наши промени да се запишат като един нов комит отгоре.
git reset --soft "origin/$branch"

# 5) Комитни всичко (.gitignore вече изключва .dev.vars, node_modules, .next и т.н.)
git add -A
git commit -m $Msg
if ($LASTEXITCODE -ne 0) { Write-Host "Няма промени за комит (или комитът се провали)." -ForegroundColor Yellow }

# 6) Push към GitHub (тук ще поиска твоя GitHub вход, ако не е кеширан)
git push origin "HEAD:$branch"
Write-Host "`nГотово. Провери: https://github.com/s2kdesign-com/europe-projects" -ForegroundColor Green
