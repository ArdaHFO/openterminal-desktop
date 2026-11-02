$ErrorActionPreference = 'Stop'
$installRoot = Split-Path $PSScriptRoot -Parent
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$buildDir = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
$rootLiteral = $installRoot.Replace('"', '""')
$nodeLiteral = $nodePath.Replace('"', '""')
@"
internal static class InstallPaths {
    internal const string Root = @"$rootLiteral";
    internal const string Node = @"$nodeLiteral";
}
"@ | Set-Content -LiteralPath (Join-Path $buildDir 'InstallPaths.cs') -Encoding UTF8
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /utf8output /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$buildDir\OpenTerminal.exe" (Join-Path $PSScriptRoot 'Launcher.cs') (Join-Path $buildDir 'InstallPaths.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
Get-Item -LiteralPath (Join-Path $buildDir 'OpenTerminal.exe') | Select-Object FullName,Length
