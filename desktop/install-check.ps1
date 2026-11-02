param([ValidateSet('InstallTest','ReinstallTest','UninstallTest','InstallFinal')][string]$Step,[switch]$UseFinalInstall)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$audit=Join-Path $taskRoot 'outputs\desktop-audit'
$setup=Join-Path $taskRoot 'outputs\desktop-package\OpenTerminal-Kurulum-1.0.0-x64.exe'
$testInstall=Join-Path $audit 'installed-program'
$userData=Join-Path $env:LOCALAPPDATA 'OpenTerminal Desktop'
$finalInstall=Join-Path $env:LOCALAPPDATA 'Programs\OpenTerminal Desktop'
if($UseFinalInstall){if($Step -ne 'UninstallTest'){throw 'Final path override is only for uninstall validation'};$testInstall=$finalInstall}
$probe=Join-Path $userData 'installer-preservation-probe.txt'
function Install([string]$target){
 $process=Start-Process -FilePath $setup -ArgumentList @('/S',"/D=$target") -WindowStyle Hidden -PassThru -Wait
 if($process.ExitCode -ne 0){throw "Installer failed: $($process.ExitCode)"}
 if(-not (Test-Path (Join-Path $target 'OpenTerminal Desktop.exe'))){throw 'Installed application missing'}
}
function Record($value){$value|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $audit ($Step+'.json')) -Encoding utf8;$value|ConvertTo-Json -Depth 6}
if($Step -eq 'InstallTest'){
 if(Test-Path $testInstall){throw 'Test install directory already exists'}
 if(Test-Path $probe){throw 'Preservation probe already exists'}
 Install $testInstall
 New-Item -ItemType Directory -Path $userData -Force|Out-Null
 [guid]::NewGuid().ToString()|Set-Content -LiteralPath $probe
 Record @{passed=$true;step=$Step;install=$testInstall;probeSHA256=(Get-FileHash -LiteralPath $probe).Hash;setupSHA256=(Get-FileHash -LiteralPath $setup).Hash}
}elseif($Step -eq 'ReinstallTest'){
 $before=(Get-FileHash -LiteralPath $probe).Hash
 $dbPath=Join-Path $userData 'data\terminal.db';$dbBefore=if(Test-Path $dbPath){(Get-FileHash -LiteralPath $dbPath).Hash}else{$null}
 Install $testInstall
 if((Get-FileHash -LiteralPath $probe).Hash -ne $before){throw 'Reinstall changed user data'}
 if($dbBefore -and (Get-FileHash -LiteralPath $dbPath).Hash -ne $dbBefore){throw 'Reinstall changed portfolio database'}
 Record @{passed=$true;step=$Step;probePreserved=$true;databasePreserved=[bool]$dbBefore;setupSHA256=(Get-FileHash -LiteralPath $setup).Hash}
}elseif($Step -eq 'UninstallTest'){
 $expected=if($UseFinalInstall){[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\OpenTerminal Desktop'))}else{[IO.Path]::GetFullPath((Join-Path $taskRoot 'outputs\desktop-audit\installed-program'))}
 if([IO.Path]::GetFullPath($testInstall) -ne $expected){throw 'Unexpected uninstall path'}
 $before=(Get-FileHash -LiteralPath $probe).Hash
 $dbPath=Join-Path $userData 'data\terminal.db';$dbBefore=if(Test-Path $dbPath){(Get-FileHash -LiteralPath $dbPath).Hash}else{$null}
 $uninstaller=Join-Path $testInstall 'Uninstall OpenTerminal Desktop.exe'
 if(-not (Test-Path $uninstaller)){throw 'Uninstaller missing'}
 $process=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
 $until=[DateTime]::UtcNow.AddSeconds(45)
 while((Test-Path (Join-Path $testInstall 'OpenTerminal Desktop.exe')) -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 500}
 if(Test-Path (Join-Path $testInstall 'OpenTerminal Desktop.exe')){throw 'Uninstall did not remove application'}
 if((Get-FileHash -LiteralPath $probe).Hash -ne $before){throw 'Uninstall changed user data'}
 if($dbBefore -and (Get-FileHash -LiteralPath $dbPath).Hash -ne $dbBefore){throw 'Uninstall changed portfolio database'}
 $registration=Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'|Get-ItemProperty|Where-Object {$_.DisplayName -like 'OpenTerminal Desktop*'}
 if($registration){throw 'Uninstaller registration remains'}
 Record @{passed=$true;step=$Step;programRemoved=$true;registrationRemoved=$true;userDataPreserved=$true;databasePreserved=[bool]$dbBefore;setupSHA256=(Get-FileHash -LiteralPath $setup).Hash}
}elseif($Step -eq 'InstallFinal'){
 if(Test-Path (Join-Path $finalInstall 'OpenTerminal Desktop.exe')){
  foreach($relative in @('OpenTerminal Desktop.exe','resources\app.asar')){if((Get-FileHash -LiteralPath (Join-Path $finalInstall $relative)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $taskRoot ('outputs\desktop-package\win-unpacked\'+$relative))).Hash){throw 'Existing installation differs from this verified build'}}
 }else{Install $finalInstall}
 $desktopFolder=[Environment]::GetFolderPath('Desktop')
 $shortcut=Join-Path $desktopFolder 'OpenTerminal Desktop.lnk'
 $target=(New-Object -ComObject WScript.Shell).CreateShortcut($shortcut).TargetPath
 if($target -ne (Join-Path $finalInstall 'OpenTerminal Desktop.exe')){throw 'Desktop shortcut points to unexpected executable'}
 $desktopSetup=Join-Path $desktopFolder (Split-Path $setup -Leaf)
 if(-not (Test-Path $desktopSetup)){Copy-Item -LiteralPath $setup -Destination $desktopSetup}
 if((Get-FileHash -LiteralPath $setup).Hash -ne (Get-FileHash -LiteralPath $desktopSetup).Hash){throw 'Desktop installer checksum mismatch'}
 $registration=Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'|Get-ItemProperty|Where-Object {$_.DisplayName -like 'OpenTerminal Desktop*'}
 if(-not $registration){throw 'Windows application registration missing'}
 Record @{passed=$true;step=$Step;install=$finalInstall;desktopShortcut=$shortcut;desktopInstaller=$desktopSetup;setupSHA256=(Get-FileHash -LiteralPath $setup).Hash;uninstallerRegistered=$true}
 if(Test-Path $probe){Remove-Item -LiteralPath $probe}
}
