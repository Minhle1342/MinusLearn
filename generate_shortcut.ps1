Add-Type -AssemblyName System.Drawing

$root = "$PSScriptRoot"
if (-not $root) { $root = "d:\MinusLearn" }

$pngPath = "$root\extension\icon.png"
$icoPath = "$root\icon.ico"

if (Test-Path $pngPath) {
    try {
        $img = [System.Drawing.Image]::FromFile($pngPath)
        
        # Generate icon.ico for Windows shortcuts
        $bmpIco = New-Object System.Drawing.Bitmap($img, 128, 128)
        $hIcon = $bmpIco.GetHicon()
        $icon = [System.Drawing.Icon]::FromHandle($hIcon)
        $fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
        $icon.Save($fs)
        $fs.Close()
        $bmpIco.Dispose()
        Write-Host "Icon ICO created at $icoPath"

        # Generate extension icons: icon16.png, icon32.png, icon48.png, icon128.png
        $sizes = @(16, 32, 48, 128)
        foreach ($s in $sizes) {
            $destPath = "$root\extension\icon$s.png"
            $bmpResized = New-Object System.Drawing.Bitmap($s, $s)
            $g = [System.Drawing.Graphics]::FromImage($bmpResized)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.DrawImage($img, 0, 0, $s, $s)
            $bmpResized.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
            $g.Dispose()
            $bmpResized.Dispose()
            Write-Host "Created extension icon: $destPath"
        }

        $img.Dispose()
    } catch {
        Write-Host "Error creating icons: $_"
    }
}

# Create desktop shortcut pointing to start.bat with icon.ico
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $DesktopPath = [System.Environment]::GetFolderPath('Desktop')
    
    # Desktop Shortcut
    $Shortcut = $WshShell.CreateShortcut("$DesktopPath\MinusLearn.lnk")
    $Shortcut.TargetPath = "$root\start.bat"
    $Shortcut.WorkingDirectory = "$root"
    if (Test-Path $icoPath) {
        $Shortcut.IconLocation = "$icoPath"
    }
    $Shortcut.Description = "Start MinusLearn AI Application"
    $Shortcut.Save()
    Write-Host "Shortcut created on Desktop: $DesktopPath\MinusLearn.lnk"

    # Root Shortcut
    $RootShortcut = $WshShell.CreateShortcut("$root\MinusLearn.lnk")
    $RootShortcut.TargetPath = "$root\start.bat"
    $RootShortcut.WorkingDirectory = "$root"
    if (Test-Path $icoPath) {
        $RootShortcut.IconLocation = "$icoPath"
    }
    $RootShortcut.Description = "Start MinusLearn AI Application"
    $RootShortcut.Save()
    Write-Host "Shortcut created in root: $root\MinusLearn.lnk"
} catch {
    Write-Host "Error creating shortcut: $_"
}
