[CmdletBinding()]
param(
  [string]$OutputDir = "artifacts/windows"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifactsRoot = [IO.Path]::GetFullPath((Join-Path $root "artifacts"))
$outputPath = if ([IO.Path]::IsPathRooted($OutputDir)) {
  [IO.Path]::GetFullPath($OutputDir)
} else {
  [IO.Path]::GetFullPath((Join-Path $root $OutputDir))
}
$allowedPrefix = $artifactsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) +
  [IO.Path]::DirectorySeparatorChar
if (-not $outputPath.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDir must be a child of $artifactsRoot"
}

$secretValues = @(
  $env:WINDOWS_CERTIFICATE,
  $env:WINDOWS_CERTIFICATE_PASSWORD,
  $env:WINDOWS_TIMESTAMP_URL
)
$providedSecrets = @(
  $secretValues | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
).Count
if ($providedSecrets -ne 0 -and $providedSecrets -ne 3) {
  throw "WINDOWS_CERTIFICATE, WINDOWS_CERTIFICATE_PASSWORD, and WINDOWS_TIMESTAMP_URL must be all set or all empty"
}
$signingEnabled = $providedSecrets -eq 3
$expectedSignature = if ($signingEnabled) { "Valid" } else { "NotSigned" }

$previousLocation = Get-Location
$tempBase = if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
  [IO.Path]::GetTempPath()
} else {
  $env:RUNNER_TEMP
}
$tempRoot = Join-Path $tempBase ("minesweeper-sign-" + [guid]::NewGuid().ToString("N"))
$importedThumbprint = $null
$newImportedThumbprints = @()
$primaryError = $null
$cleanupErrors = @()

try {
  Set-Location $root
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

  $tauriArgs = @("tauri", "build", "--ci", "--bundles", "nsis")
  if ($signingEnabled) {
    $encodedPath = Join-Path $tempRoot "certificate.base64"
    $pfxPath = Join-Path $tempRoot "certificate.pfx"
    $configPath = Join-Path $tempRoot "signing.conf.json"
    Set-Content -LiteralPath $encodedPath -Value $env:WINDOWS_CERTIFICATE `
      -Encoding ascii -NoNewline
    & certutil.exe -f -decode $encodedPath $pfxPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "certutil failed with exit code $LASTEXITCODE"
    }

    $securePassword = ConvertTo-SecureString $env:WINDOWS_CERTIFICATE_PASSWORD `
      -AsPlainText -Force
    $beforeThumbprints = @(Get-ChildItem "Cert:\CurrentUser\My" | ForEach-Object {
      $_.Thumbprint.Replace(" ", "").ToUpperInvariant()
    })
    $importedCertificates = @(Import-PfxCertificate -FilePath $pfxPath `
      -CertStoreLocation "Cert:\CurrentUser\My" -Password $securePassword)
    $afterThumbprints = @(Get-ChildItem "Cert:\CurrentUser\My" | ForEach-Object {
      $_.Thumbprint.Replace(" ", "").ToUpperInvariant()
    })
    $importedReturnedThumbprints = @($importedCertificates | ForEach-Object {
      $_.Thumbprint.Replace(" ", "").ToUpperInvariant()
    } | Sort-Object -Unique)
    $newImportedThumbprints = @($importedReturnedThumbprints | Where-Object {
      $beforeThumbprints -notcontains $_ -and $afterThumbprints -contains $_
    })
    $signingCertificate = $importedCertificates | Where-Object { $_.HasPrivateKey } |
      Select-Object -First 1
    if ($null -eq $signingCertificate -or
      [string]::IsNullOrWhiteSpace($signingCertificate.Thumbprint)) {
      throw "PFX import returned no certificate thumbprint"
    }
    $importedThumbprint = $signingCertificate.Thumbprint.Replace(" ", "").ToUpperInvariant()

    @{
      bundle = @{
        windows = @{
          certificateThumbprint = $importedThumbprint
          digestAlgorithm = "sha256"
          timestampUrl = $env:WINDOWS_TIMESTAMP_URL
        }
      }
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $configPath -Encoding utf8
    $tauriArgs += @("--config", $configPath)
  } else {
    $tauriArgs += "--no-sign"
  }

  & npx @tauriArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Tauri build failed with exit code $LASTEXITCODE"
  }

  $package = Get-Content -Raw -LiteralPath "package.json" | ConvertFrom-Json
  $version = [string]$package.version
  $mainExe = Get-Item -LiteralPath "src-tauri/target/release/minesweeper.exe"
  $installers = @(
    Get-ChildItem -LiteralPath "src-tauri/target/release/bundle/nsis" `
      -Filter "*_${version}_*setup.exe" -File
  )
  if ($installers.Count -ne 1) {
    throw "Expected exactly one NSIS installer for $version; found $($installers.Count)"
  }

  $sourceArtifacts = @($mainExe, $installers[0])
  foreach ($source in $sourceArtifacts) {
    $status = (Get-AuthenticodeSignature -LiteralPath $source.FullName).Status.ToString()
    if ($status -ne $expectedSignature) {
      throw "Unexpected signature status for $($source.Name): $status; expected $expectedSignature"
    }
  }

  if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Recurse -Force
  }
  New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

  $records = foreach ($source in $sourceArtifacts) {
    $destination = Join-Path $outputPath $source.Name
    Copy-Item -LiteralPath $source.FullName -Destination $destination
    $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    $status = (Get-AuthenticodeSignature -LiteralPath $destination).Status.ToString()
    [ordered]@{
      name = $source.Name
      sha256 = $hash
      signatureStatus = $status
    }
  }

  $commit = if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_SHA)) {
    $env:GITHUB_SHA.Trim().ToLowerInvariant()
  } else {
    (& git rev-parse HEAD).Trim().ToLowerInvariant()
  }
  if ($commit -notmatch "^[0-9a-f]{40}$") {
    throw "Unable to determine an exact 40-character commit SHA"
  }

  $nodeVersion = (& node --version | Out-String).Trim()
  $rustVersion = (& rustc --version | Out-String).Trim()
  $tauriVersion = (& npx tauri --version | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read the Tauri CLI version"
  }

  $records | ForEach-Object {
    "$($_.sha256)  $($_.name)"
  } | Set-Content -LiteralPath (Join-Path $outputPath "SHA256SUMS.txt") -Encoding ascii

  [ordered]@{
    commit = $commit
    packageVersion = $version
    signingRequested = $signingEnabled
    node = $nodeVersion
    rust = $rustVersion
    tauri = $tauriVersion
    createdAtUtc = [DateTime]::UtcNow.ToString("o")
    artifacts = @($records)
  } | ConvertTo-Json -Depth 6 | Set-Content `
    -LiteralPath (Join-Path $outputPath "build-metadata.json") -Encoding utf8

  $metadata = Get-Content -Raw -LiteralPath (Join-Path $outputPath "build-metadata.json") |
    ConvertFrom-Json
  $metadataArtifacts = @($metadata.artifacts)
  if ($metadataArtifacts.Count -ne 2) {
    throw "Expected build metadata to contain exactly two artifacts"
  }
  $invalidStatuses = @($metadataArtifacts | Where-Object {
    $_.signatureStatus -ne $expectedSignature
  })
  if ($invalidStatuses.Count -ne 0) {
    throw "Build metadata contains a signature status other than $expectedSignature"
  }
  $checksumLines = @(Get-Content -LiteralPath (Join-Path $outputPath "SHA256SUMS.txt"))
  if ($checksumLines.Count -ne 2) {
    throw "Expected SHA256SUMS.txt to contain exactly two lines"
  }

  Write-Host "Windows artifacts written to $outputPath ($expectedSignature)"
} catch {
  $primaryError = $_
} finally {
  try {
    Set-Location $previousLocation
  } catch {
    $cleanupErrors += "restore working directory: $($_.Exception.Message)"
  }
  foreach ($thumbprint in $newImportedThumbprints) {
    $certificatePath = "Cert:\CurrentUser\My\$thumbprint"
    try {
      if (Test-Path -LiteralPath $certificatePath) {
        Remove-Item -LiteralPath $certificatePath -Force -ErrorAction Stop
      }
    } catch {
      $cleanupErrors += "certificate ${thumbprint}: $($_.Exception.Message)"
    }
  }
  try {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction Stop
    }
  } catch {
    $cleanupErrors += "temporary files: $($_.Exception.Message)"
  }
}

if ($cleanupErrors.Count -gt 0) {
  Write-Error "Windows release cleanup failed: $($cleanupErrors -join '; ')" `
    -ErrorAction Continue
}
if ($null -ne $primaryError) {
  throw $primaryError
}
if ($cleanupErrors.Count -gt 0) {
  throw "Windows release cleanup failed"
}
