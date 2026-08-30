Add-Type -AssemblyName System.Drawing

function New-ElfIcon([int]$size, [string]$path, [bool]$maskable) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }

  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $bg = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
  $g.Clear($bg)

  $pad = if ($maskable) { [int]($size * 0.18) } else { [int]($size * 0.12) }
  $inner = $size - (2 * $pad)
  $rect = New-Object System.Drawing.Rectangle $pad, $pad, $inner, $inner
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 11, 61, 58))
  $radius = [Math]::Max(8, [int]($inner * 0.22))
  $pathRounded = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $pathRounded.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $pathRounded.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $pathRounded.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $pathRounded.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $pathRounded.CloseFigure()
  $g.FillPath($brush, $pathRounded)

  $penGold = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 232, 165, 75), [Math]::Max(3.0, $size / 28.0))
  $penFoam = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 231, 244, 241), [Math]::Max(2.0, $size / 36.0))
  $penGold.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $penFoam.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $cx = $size / 2.0
  $cy = $size / 2.0
  $s = $inner * 0.34
  $pts = @(
    (New-Object System.Drawing.PointF ($cx), ($cy - $s)),
    (New-Object System.Drawing.PointF ($cx + $s), ($cy - $s * 0.35)),
    (New-Object System.Drawing.PointF ($cx + $s), ($cy + $s * 0.35)),
    (New-Object System.Drawing.PointF ($cx), ($cy + $s)),
    (New-Object System.Drawing.PointF ($cx - $s), ($cy + $s * 0.35)),
    (New-Object System.Drawing.PointF ($cx - $s), ($cy - $s * 0.35))
  )
  $g.DrawPolygon($penGold, $pts)
  $g.DrawLine($penFoam, $cx, $cy - $s, $cx, $cy + $s)
  $g.DrawLine($penFoam, $cx - $s, $cy - $s * 0.35, $cx, $cy + $s * 0.15)
  $g.DrawLine($penFoam, $cx + $s, $cy - $s * 0.35, $cx, $cy + $s * 0.15)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  $brush.Dispose()
  $penGold.Dispose()
  $penFoam.Dispose()
  $pathRounded.Dispose()
  Write-Output "wrote $path"
}

$root = "c:\Users\Hp\Desktop\ELFCOMS\apps\web\public"
New-ElfIcon 192 (Join-Path $root "icons\icon-192.png") $false
New-ElfIcon 512 (Join-Path $root "icons\icon-512.png") $false
New-ElfIcon 512 (Join-Path $root "icons\icon-maskable-512.png") $true
New-ElfIcon 180 (Join-Path $root "apple-touch-icon.png") $false
