# Renders Beam's icons at each native size and packs them into .ico files (PNG-compressed entries).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force $out | Out-Null

function Render([int]$size, [string]$variant) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 32.0
  $pad = [Math]::Max(0.5, 1 * $s)
  $r = 8 * $s
  $rect = New-Object System.Drawing.RectangleF $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  if ($variant -eq 'off') {
    $c1 = [System.Drawing.Color]::FromArgb(255, 150, 148, 160); $c2 = [System.Drawing.Color]::FromArgb(255, 112, 110, 122)
  } else {
    $c1 = [System.Drawing.Color]::FromArgb(255, 99, 103, 255); $c2 = [System.Drawing.Color]::FromArgb(255, 160, 92, 255)
  }
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45
  if ($variant -eq 'square') {
    # iOS rounds app icons itself, so phone icons are full-bleed squares
    $full = New-Object System.Drawing.RectangleF 0, 0, $size, $size
    $g.FillRectangle((New-Object System.Drawing.Drawing2D.LinearGradientBrush $full, $c1, $c2, 45), $full)
  } else {
    $g.FillPath($brush, $path)
  }
  # arrow: thicker at small sizes so it stays readable
  $w = if ($size -le 16) { 2.2 } elseif ($size -le 24) { 2.6 * $s } else { 3.2 * $s }
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $w
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $cx = $size / 2.0
  $top = 9 * $s; $bottom = 23 * $s; $arm = 5.6 * $s
  $g.DrawLine($pen, $cx, $bottom, $cx, $top)
  $g.DrawLines($pen, [System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF ($cx - $arm), ($top + $arm)),
      (New-Object System.Drawing.PointF $cx, $top),
      (New-Object System.Drawing.PointF ($cx + $arm), ($top + $arm))))
  if ($variant -eq 'unread') {
    $dot = 11 * $s
    $ring = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillEllipse($ring, ($size - $dot - 0.2 * $s), (0.2 * $s), $dot, $dot)
    $pinkB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 92, 160))
    $in = $dot - 3 * $s
    $g.FillEllipse($pinkB, ($size - $dot - 0.2 * $s + 1.5 * $s), (1.7 * $s), $in, $in)
  }
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return , $ms.ToArray()
}

function WriteIco([string]$file, [int[]]$sizes, [string]$variant) {
  $images = @(); foreach ($sz in $sizes) { $images += , (Render $sz $variant) }
  $fs = [System.IO.File]::Create($file)
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sz = $sizes[$i]; $len = $images[$i].Length
    $dim = if ($sz -ge 256) { 0 } else { $sz }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$len); $bw.Write([UInt32]$offset)
    $offset += $len
  }
  foreach ($img in $images) { $bw.Write($img) }
  $bw.Close()
}

$tray = 16, 20, 24, 32, 40, 48, 64
WriteIco (Join-Path $out 'tray-on.ico') $tray 'on'
WriteIco (Join-Path $out 'tray-off.ico') $tray 'off'
WriteIco (Join-Path $out 'tray-unread.ico') $tray 'unread'
WriteIco (Join-Path $out 'app.ico') (16, 20, 24, 32, 40, 48, 64, 128, 256) 'on'
[System.IO.File]::WriteAllBytes((Join-Path $out 'app.png'), (Render 256 'on'))
[System.IO.File]::WriteAllBytes((Join-Path $out 'drag.png'), (Render 64 'on'))
$web = Join-Path $PSScriptRoot '..\..\server\public'
[System.IO.File]::WriteAllBytes((Join-Path $web 'apple-touch-icon.png'), (Render 180 'square'))
[System.IO.File]::WriteAllBytes((Join-Path $web 'icon-192.png'), (Render 192 'square'))
[System.IO.File]::WriteAllBytes((Join-Path $web 'icon-512.png'), (Render 512 'square'))
Write-Host "Icons written to $out and $web"
