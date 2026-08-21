$ErrorActionPreference = "Stop"


# ============================================================
# pnpm 11
#
# pnpm 11 可能在 pnpm run / pnpm exec 前自动检查依赖，
# 检测到 node_modules 与 lockfile 不一致时自动执行 install。
#
# Stable 构建脚本不应该隐式修改当前开发项目依赖。
# 因此设置为 warn：
#
#   - 仍然检查
#   - 发现问题时警告
#   - 不自动执行 pnpm install
# ============================================================

$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = "warn"


# ============================================================
# 路径
#
# 当前脚本：
#
# project/
# └─ .dsh-local/
#    └─ scripts/
#       └─ Build-Stable.ps1
#
# 所以项目根目录是 ../..
#
# 全部使用相对路径推导，不依赖 E:\xxx 等绝对路径。
# ============================================================

$ScriptDir = $PSScriptRoot

$ProjectRoot = (
    Resolve-Path (
        Join-Path $ScriptDir "..\.."
    )
).Path


$LocalRoot = Join-Path `
    $ProjectRoot `
    ".dsh-local"


$StableDir = Join-Path `
    $LocalRoot `
    "stable"


$NextDir = Join-Path `
    $LocalRoot `
    "stable-next"


$OldDir = Join-Path `
    $LocalRoot `
    "stable-old"


$ArtifactsDir = Join-Path `
    $NextDir `
    "artifacts"


$RuntimeDir = Join-Path `
    $NextDir `
    "runtime"


# ============================================================
# 基础信息
# ============================================================

Write-Host ""
Write-Host "========================================"
Write-Host " DeepSeek Harness - Build Stable"
Write-Host "========================================"
Write-Host "Project : $ProjectRoot"
Write-Host "Output  : $StableDir"
Write-Host "Temp    : $NextDir"
Write-Host "========================================"
Write-Host ""


# ============================================================
# 检查项目
# ============================================================

$RootPackageJson = Join-Path `
    $ProjectRoot `
    "package.json"


if (!(Test-Path $RootPackageJson)) {

    throw @"
DeepSeek Harness package.json not found:

$RootPackageJson

Please make sure this script is located at:

.dsh-local\scripts\Build-Stable.ps1
"@

}


$PackagesRoot = Join-Path `
    $ProjectRoot `
    "packages"


$AppsRoot = Join-Path `
    $ProjectRoot `
    "apps"


$VendorRoot = Join-Path `
    $ProjectRoot `
    "vendor"


if (!(Test-Path $PackagesRoot)) {
    throw "packages directory not found: $PackagesRoot"
}


if (!(Test-Path $AppsRoot)) {
    throw "apps directory not found: $AppsRoot"
}


if (!(Test-Path $VendorRoot)) {
    throw "vendor directory not found: $VendorRoot"
}


# ============================================================
# 清理 stable-next
#
# 非常重要：
#
# 这里绝对不删除 stable。
#
# 在整个新 Stable 构建成功之前，
# 当前 Stable 一直保持原样。
# ============================================================

if (Test-Path $NextDir) {

    Write-Host "Removing old temporary build..."

    Remove-Item `
        $NextDir `
        -Recurse `
        -Force

}


New-Item `
    -ItemType Directory `
    -Force `
    $ArtifactsDir |
    Out-Null


New-Item `
    -ItemType Directory `
    -Force `
    $RuntimeDir |
    Out-Null


# ============================================================
# 保存所有已经 Pack 的包
#
# 每个元素：
#
# {
#     Name = "@deepseek-ai/xxx"
#     File = "xxx.tgz"
# }
#
# 这样后面不需要重新从 tgz 解 package.json。
# ============================================================

$PackedPackages = @()


# ============================================================
# Pack-Package
#
# 将一个 workspace package 打成 npm tgz。
#
# 注意：
#
# 不调用：
#
# scripts/release/pack.ts
#
# 因为其内部使用：
#
# spawnSync("pnpm")
#
# 在 Windows + Corepack 环境可能无法解析 pnpm.cmd，
# 导致：
#
# spawnSync pnpm ENOENT
#
# 因此直接由 PowerShell 调 pnpm。
# ============================================================

function Pack-Package {

    param(

        [Parameter(Mandatory = $true)]
        [string]$PackageDir,

        [Parameter(Mandatory = $true)]
        [string]$OutputDir

    )


    $PackageJson = Join-Path `
        $PackageDir `
        "package.json"


    if (!(Test-Path $PackageJson)) {

        throw "package.json not found: $PackageJson"

    }


    # ========================================================
    # 读取 package.json
    # ========================================================

    try {

        $Manifest = Get-Content `
            $PackageJson `
            -Raw |
            ConvertFrom-Json

    }
    catch {

        throw "Invalid package.json: $PackageJson"

    }


    $PackageName = $Manifest.name


    if ([string]::IsNullOrWhiteSpace($PackageName)) {

        throw "Package name missing: $PackageJson"

    }


    Write-Host "  Packing $PackageName"


    # ========================================================
    # Pack 前已有 tgz
    # ========================================================

    $Before = @(

        Get-ChildItem `
            -Path $OutputDir `
            -Filter "*.tgz" `
            -File `
            -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName

    )


    # ========================================================
    # Pack
    #
    # 非常重要：
    #
    # Out-Host 让 pnpm 的 stdout 只显示，
    # 不进入本 PowerShell 函数的返回值。
    #
    # 否则：
    #
    # $Packed = Pack-Package ...
    #
    # 会同时收到：
    #
    # - pnpm 输出文本
    # - PSCustomObject
    #
    # 最终造成 PackedPackages 数量异常。
    # ========================================================

    & pnpm `
        --dir $PackageDir `
        pack `
        --pack-destination $OutputDir |
        Out-Host


    if ($LASTEXITCODE -ne 0) {

        throw "Failed to pack $PackageName"

    }


    # ========================================================
    # Pack 后 tgz
    # ========================================================

    $After = @(

        Get-ChildItem `
            -Path $OutputDir `
            -Filter "*.tgz" `
            -File `
            -ErrorAction Stop |
        Select-Object -ExpandProperty FullName

    )


    $NewFiles = @(

        $After |
        Where-Object {

            $_ -notin $Before

        }

    )


    if ($NewFiles.Count -ne 1) {

        throw @"
Unable to determine packed file for:

$PackageName

Expected exactly one new .tgz file,
but found:

$($NewFiles.Count)
"@

    }


    # ========================================================
    # 函数唯一返回值
    # ========================================================

    [PSCustomObject]@{

        Name = $PackageName

        File = $NewFiles[0]

    }

}
# ============================================================
# 进入项目根目录
# ============================================================

Push-Location $ProjectRoot


try {

    # ========================================================
    # [1/5] Build
    #
    # 不同 DeepSeek Harness 版本可能不同：
    #
    # 新版：
    #   build:official
    #
    # 较早版本：
    #   build
    #
    # 自动检测。
    # ========================================================

    Write-Host ""
    Write-Host "[1/5] Building artifacts..."
    Write-Host ""


    $RootManifest = Get-Content `
        $RootPackageJson `
        -Raw |
        ConvertFrom-Json


    if ($null -ne $RootManifest.scripts.'build:official') {

        Write-Host "Using:"
        Write-Host "  pnpm run build:official"
        Write-Host ""

        pnpm run build:official

    }
    elseif ($null -ne $RootManifest.scripts.build) {

        Write-Host "Using:"
        Write-Host "  pnpm run build"
        Write-Host ""

        pnpm run build

    }
    else {

        throw @"
No supported DeepSeek Harness build script found.

Expected one of:

    build:official
    build
"@

    }


    if ($LASTEXITCODE -ne 0) {

        throw @"
DeepSeek Harness build failed.

If you see a warning such as:

    node_modules are out of sync

you may need to manually run:

    pnpm install

from the project root first.

The Stable build script itself will NOT automatically
modify your project dependencies.
"@

    }


    # ========================================================
    # [2/5] Pack Vendor
    #
    # vendor/*/package.json
    # ========================================================

    Write-Host ""
    Write-Host "[2/5] Packing vendor packages..."
    Write-Host ""


    $VendorOut = Join-Path `
        $ArtifactsDir `
        "vendor"


    New-Item `
        -ItemType Directory `
        -Force `
        $VendorOut |
        Out-Null


    $VendorPackages = Get-ChildItem `
        -Path $VendorRoot `
        -Directory


    foreach ($PackageDir in $VendorPackages) {

        $PackageJson = Join-Path `
            $PackageDir.FullName `
            "package.json"


        if (!(Test-Path $PackageJson)) {

            continue

        }


        $Packed = Pack-Package `
            -PackageDir $PackageDir.FullName `
            -OutputDir $VendorOut


        $PackedPackages += $Packed

    }


    # ========================================================
    # [3/5] Pack DSH
    #
    # 官方 DSH family 基本对应：
    #
    # packages/*/*/package.json
    #
    # 排除：
    #
    # packages/experimental
    #
    # 加上：
    #
    # apps/*/package.json
    # ========================================================

    Write-Host ""
    Write-Host "[3/5] Packing DSH packages..."
    Write-Host ""


    $DshOut = Join-Path `
        $ArtifactsDir `
        "dsh"


    New-Item `
        -ItemType Directory `
        -Force `
        $DshOut |
        Out-Null


    # --------------------------------------------------------
    # packages/*/*
    # --------------------------------------------------------

    $Categories = Get-ChildItem `
        -Path $PackagesRoot `
        -Directory


    foreach ($Category in $Categories) {


        if ($Category.Name -eq "experimental") {

            continue

        }


        $Children = Get-ChildItem `
            -Path $Category.FullName `
            -Directory


        foreach ($PackageDir in $Children) {


            $PackageJson = Join-Path `
                $PackageDir.FullName `
                "package.json"


            if (!(Test-Path $PackageJson)) {

                continue

            }


            $Packed = Pack-Package `
                -PackageDir $PackageDir.FullName `
                -OutputDir $DshOut


            $PackedPackages += $Packed

        }

    }


    # --------------------------------------------------------
    # apps/*
    # --------------------------------------------------------

    $Apps = Get-ChildItem `
        -Path $AppsRoot `
        -Directory


    foreach ($PackageDir in $Apps) {


        $PackageJson = Join-Path `
            $PackageDir.FullName `
            "package.json"


        if (!(Test-Path $PackageJson)) {

            continue

        }


        $Packed = Pack-Package `
            -PackageDir $PackageDir.FullName `
            -OutputDir $DshOut


        $PackedPackages += $Packed

    }


    Write-Host ""
    Write-Host "Packed package count: $($PackedPackages.Count)"


    if ($PackedPackages.Count -eq 0) {

        throw "No packages were packed."

    }


    # ========================================================
    # 检查重复 package name
    #
    # Runtime package.json 中一个依赖名只能出现一次。
    # ========================================================

# 先确保数组里全部是真正的 package 对象
$InvalidPackages = @(
    $PackedPackages |
    Where-Object {
        $_ -isnot [PSCustomObject] -or
        [string]::IsNullOrWhiteSpace($_.Name) -or
        [string]::IsNullOrWhiteSpace($_.File)
    }
)

if ($InvalidPackages.Count -gt 0) {

    throw @"
Internal error:

PackedPackages contains invalid entries.

Invalid count:
$($InvalidPackages.Count)
"@

}


$DuplicateNames = @(

    $PackedPackages |
    Group-Object Name |
    Where-Object {
        $_.Count -gt 1
    }

)


if ($DuplicateNames.Count -gt 0) {

    $Names = (
        $DuplicateNames |
        ForEach-Object {
            "$($_.Name) x$($_.Count)"
        }
    ) -join "`n"


    throw @"
Duplicate package names detected:

$Names
"@

}


    if ($DuplicateNames.Count -gt 0) {

        $Names = (

            $DuplicateNames |
            ForEach-Object {

                $_.Name

            }

        ) -join "`n"


        throw @"
Duplicate package names detected:

$Names
"@

    }


# ========================================================
# [4/5] 创建独立 Runtime
#
# 注意：
#
# 这里绝对不读取 tgz 内部的 package.json。
#
# 包名和 tgz 文件路径已经在 Pack-Package 阶段记录进：
#
# $PackedPackages
#
# 每个元素：
#
# {
#     Name = "@deepseek-ai/xxx"
#     File = "...\xxx.tgz"
# }
# ========================================================

Write-Host ""
Write-Host "[4/5] Creating isolated runtime..."
Write-Host ""


# ========================================================
# 基础检查
# ========================================================

if ($PackedPackages.Count -eq 0) {

    throw "No packed packages found."

}


Write-Host "Preparing $($PackedPackages.Count) packed packages..."


# ========================================================
# 生成 Runtime dependencies
# ========================================================

$Dependencies = [ordered]@{}


foreach ($Package in $PackedPackages) {


    if ([string]::IsNullOrWhiteSpace($Package.Name)) {

        throw "Packed package contains no package name."

    }


    if ([string]::IsNullOrWhiteSpace($Package.File)) {

        throw "Packed package contains no tgz path: $($Package.Name)"

    }


    if (!(Test-Path $Package.File)) {

        throw @"
Packed package file does not exist:

Package:
$($Package.Name)

File:
$($Package.File)
"@

    }


    # ----------------------------------------------------
    # 从 runtime 计算 tgz 相对路径
    #
    # 例如：
    #
    # ../artifacts/dsh/deepseek-ai-dsh-xxx.tgz
    # ----------------------------------------------------

    $Relative = [System.IO.Path]::GetRelativePath(
        $RuntimeDir,
        $Package.File
    )


    # npm file: URL 推荐使用 /
    $Relative = $Relative.Replace("\", "/")


    Write-Host "  $($Package.Name)"


    $Dependencies[$Package.Name] = "file:$Relative"

}


# ========================================================
# 创建 Runtime package.json
#
# 注意这里使用 ConvertTo-Json，
# 不存在 ConvertFrom-Json。
# ========================================================

$RuntimePackage = [ordered]@{

    name = "deepseek-harness-stable-runtime"

    version = "1.0.0"

    private = $true

    dependencies = $Dependencies

}


$RuntimePackagePath = Join-Path `
    $RuntimeDir `
    "package.json"


$RuntimePackage |
    ConvertTo-Json -Depth 20 |
    Set-Content `
        $RuntimePackagePath `
        -Encoding UTF8


Write-Host ""
Write-Host "Runtime package.json created."
Write-Host "Local package count: $($Dependencies.Count)"
Write-Host ""


# ========================================================
# 安装 Stable Runtime
#
# 这里是一个普通、独立的 npm 项目。
#
# 它不会引用当前 pnpm workspace 中的：
#
# packages/
# apps/
# vendor/
#
# Stable 最终只使用自己的：
#
# stable/runtime/node_modules
# ========================================================

Push-Location $RuntimeDir


try {

    Write-Host "Installing isolated runtime..."
    Write-Host ""


    npm install `
        --no-audit `
        --no-fund `
        --package-lock=false


    if ($LASTEXITCODE -ne 0) {

        throw "Stable runtime npm install failed."

    }

}
finally {

    Pop-Location

}

    # ========================================================
    # [5/5] 验证 Stable CLI
    # ========================================================

    Write-Host ""
    Write-Host "[5/5] Verifying stable runtime..."
    Write-Host ""


    $DshBin = Join-Path `
        $RuntimeDir `
        "node_modules\@deepseek-ai\dsh\lib\bin.js"


    if (!(Test-Path $DshBin)) {

        throw @"
Stable DSH executable was not created:

$DshBin

The runtime installation is incomplete.
"@

    }


    node $DshBin --version


    if ($LASTEXITCODE -ne 0) {

        throw "Stable runtime verification failed."

    }


    Write-Host ""
    Write-Host "Stable runtime verification passed."


}
finally {

    Pop-Location

}


# ============================================================
# 发布 Stable
#
# 到这里说明：
#
# build
# pack
# npm install
# CLI verify
#
# 全部已经成功。
#
# 现在才允许修改当前 stable。
# ============================================================

Write-Host ""
Write-Host "Publishing stable runtime..."
Write-Host ""


# ============================================================
# 清理之前残留的 stable-old
# ============================================================

if (Test-Path $OldDir) {

    Remove-Item `
        $OldDir `
        -Recurse `
        -Force

}


# ============================================================
# 当前已有 Stable
# ============================================================

if (Test-Path $StableDir) {


    # --------------------------------------------------------
    # Stable → stable-old
    # --------------------------------------------------------

    Rename-Item `
        $StableDir `
        "stable-old"


    try {


        # ----------------------------------------------------
        # stable-next → stable
        # ----------------------------------------------------

        Rename-Item `
            $NextDir `
            "stable"


        # ----------------------------------------------------
        # 新 Stable 已成功发布
        # 删除旧 Stable
        # ----------------------------------------------------

        Remove-Item `
            $OldDir `
            -Recurse `
            -Force


    }
    catch {


        Write-Host ""
        Write-Host "Stable publish failed."
        Write-Host "Restoring previous Stable..."
        Write-Host ""


        # ----------------------------------------------------
        # 如果新 stable 已部分创建，先删除
        # ----------------------------------------------------

        if (Test-Path $StableDir) {

            Remove-Item `
                $StableDir `
                -Recurse `
                -Force

        }


        # ----------------------------------------------------
        # 恢复旧 Stable
        # ----------------------------------------------------

        if (Test-Path $OldDir) {

            Rename-Item `
                $OldDir `
                "stable"

        }


        throw

    }

}
else {


    # ========================================================
    # 第一次构建 Stable
    # ========================================================

    Rename-Item `
        $NextDir `
        "stable"

}


# ============================================================
# 完成
# ============================================================

Write-Host ""
Write-Host "========================================"
Write-Host " Stable build completed"
Write-Host "========================================"
Write-Host ""
Write-Host "Stable:"
Write-Host "  $StableDir"
Write-Host ""
Write-Host "You can now run:"
Write-Host ""
Write-Host "  .\.dsh-local\scripts\Run-Stable.ps1"
Write-Host ""