param(
  [string]$Source = "app_loge_demo.png",
  [string]$ResRoot = "android/app/src/main/res"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$sourcePath = Resolve-Path -LiteralPath $Source
$resPath = Resolve-Path -LiteralPath $ResRoot

$sizes = @{
  "mipmap-mdpi" = @{ Icon = 48; Foreground = 108 }
  "mipmap-hdpi" = @{ Icon = 72; Foreground = 162 }
  "mipmap-xhdpi" = @{ Icon = 96; Foreground = 216 }
  "mipmap-xxhdpi" = @{ Icon = 144; Foreground = 324 }
  "mipmap-xxxhdpi" = @{ Icon = 192; Foreground = 432 }
}

function Save-Icon {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [string]$Path
  )

  $canvas = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $scale = [Math]::Min($Size / $Image.Width, $Size / $Image.Height)
  $width = [int][Math]::Round($Image.Width * $scale)
  $height = [int][Math]::Round($Image.Height * $scale)
  $x = [int][Math]::Floor(($Size - $width) / 2)
  $y = [int][Math]::Floor(($Size - $height) / 2)

  $graphics.DrawImage($Image, $x, $y, $width, $height)
  $canvas.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $canvas.Dispose()
}

$image = [System.Drawing.Image]::FromFile($sourcePath)
try {
  foreach ($entry in $sizes.GetEnumerator()) {
    $dir = Join-Path $resPath $entry.Key
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Save-Icon -Image $image -Size $entry.Value.Icon -Path (Join-Path $dir "ic_launcher.png")
    Save-Icon -Image $image -Size $entry.Value.Icon -Path (Join-Path $dir "ic_launcher_round.png")
    Save-Icon -Image $image -Size $entry.Value.Foreground -Path (Join-Path $dir "ic_launcher_foreground.png")
  }
}
finally {
  $image.Dispose()
}
