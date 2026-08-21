$ErrorActionPreference = "Stop"


# ============================================================
# 路径
# ============================================================

$ScriptDir = $PSScriptRoot

$ProjectRoot = Resolve-Path `
    (Join-Path $ScriptDir "..\..")

$LocalRoot = Join-Path `
    $ProjectRoot ".dsh-local"

$DevHome = Join-Path `
    $LocalRoot "dev-home"


# ============================================================
# 开发数据目录
# ============================================================

New-Item `
    -ItemType Directory `
    -Force `
    $DevHome |
    Out-Null


$env:DSH_HOME = $DevHome


Write-Host ""
Write-Host "========================================"
Write-Host " DeepSeek Harness - DEVELOPMENT"
Write-Host "========================================"
Write-Host "Source   : $ProjectRoot"
Write-Host "DSH_HOME : $DevHome"
Write-Host "URL      : http://127.0.0.1:3081"
Write-Host "========================================"
Write-Host ""


Push-Location $ProjectRoot

try {

    # ========================================================
    # 开发版 Build
    #
    # 只修改当前源码仓库里的构建产物。
    #
    # 不访问：
    #
    # .dsh-local/stable
    # ========================================================

    Write-Host "Building development version..."

    pnpm run build

    if ($LASTEXITCODE -ne 0) {
        throw "Development build failed."
    }


    Write-Host ""
    Write-Host "Starting development server..."


    pnpm dsh web `
        --port 3081 `
        --no-open

}
finally {

    Pop-Location

}