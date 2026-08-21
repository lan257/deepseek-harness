$ErrorActionPreference = "Stop"


# ============================================================
# 路径
# ============================================================

$ScriptDir = $PSScriptRoot

$ProjectRoot = Resolve-Path `
    (Join-Path $ScriptDir "..\..")

$LocalRoot = Join-Path `
    $ProjectRoot ".dsh-local"

$StableDir = Join-Path `
    $LocalRoot "stable"

$RuntimeDir = Join-Path `
    $StableDir "runtime"

$StableHome = Join-Path `
    $LocalRoot "stable-home"


# ============================================================
# 检查 Stable
# ============================================================

$DshBin = Join-Path `
    $RuntimeDir `
    "node_modules\@deepseek-ai\dsh\lib\bin.js"


if (!(Test-Path $DshBin)) {

    throw @"
Stable runtime does not exist.

Please run:

.dsh-local\scripts\Build-Stable.ps1
"@

}


# ============================================================
# Stable 数据目录
# ============================================================

New-Item `
    -ItemType Directory `
    -Force `
    $StableHome |
    Out-Null


$env:DSH_HOME = $StableHome


# ============================================================
# 信息
# ============================================================

Write-Host ""
Write-Host "========================================"
Write-Host " DeepSeek Harness - STABLE"
Write-Host "========================================"
Write-Host "Runtime  : $RuntimeDir"
Write-Host "DSH_HOME : $StableHome"
Write-Host "URL      : http://127.0.0.1:3080"
Write-Host "========================================"
Write-Host ""


# ============================================================
# 运行
#
# 注意：
#
# 没有 pnpm run build
# 没有访问源码 build output
# ============================================================

Push-Location $ProjectRoot

try {

    node $DshBin web `
        --port 3080 `
        --no-open

}
finally {

    Pop-Location

}