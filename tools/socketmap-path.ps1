<#
.SYNOPSIS
SocketMap network path helper for Windows (PowerShell 5.1 or newer).

.DESCRIPTION
Records what a browser NetLog cannot see: this computer's network link, DNS servers, proxy and PAC
settings, public IP address, per-host connection timing measured with curl.exe, and the route to
each host. It writes ONE small JSON file that the SocketMap viewer can load next to a NetLog.

It only reads settings and makes ordinary requests: it never changes anything, needs no admin
rights, and sends nothing anywhere except an optional public-IP lookup (api.ipify.org) and a plain
GET / to each host you list. Nothing is uploaded; read the file before sharing it. The Wi-Fi
network name is recorded when Windows provides it.

.PARAMETER Hosts
Hostnames to measure. SocketMap's report lists the slowest ones for you.

.PARAMETER Out
Where to write the result (default: socketmap-path.json in the current folder).

.PARAMETER NoPublicIp
Do not contact api.ipify.org to learn the public IP address.

.PARAMETER NoProbe
Skip the curl timing to each host.

.PARAMETER NoRoute
Skip the route trace to each host.

.EXAMPLE
.\socketmap-path.ps1 example.com login.example.com
#>
[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Hosts,
  [string]$Out = 'socketmap-path.json',
  [switch]$NoPublicIp,
  [switch]$NoProbe,
  [switch]$NoRoute
)

$ErrorActionPreference = 'SilentlyContinue'
$Version = '1.0'
$notes = New-Object System.Collections.ArrayList
function Add-Note([string]$text) { [void]$notes.Add($text) }

# Only hostnames and addresses: anything else is skipped so a typo cannot become a command or a URL.
$clean = @()
foreach ($h in @($Hosts)) {
  if (-not $h) { continue }
  if ($h -match '^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$') { $clean += $h } else { Write-Warning "Skipping '$h': not a hostname" }
}
if ($clean.Count -gt 12) { $clean = $clean[0..11] }

function Strip-UserInfo([string]$value) { if ($value) { return ($value -replace '(://)[^/@\s]*@', '$1') } return $null }
function Ms($seconds, $from) {
  if ($null -eq $seconds -or $seconds -eq '') { return $null }
  $a = 0.0; $b = 0.0
  if (-not [double]::TryParse([string]$seconds, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$a)) { return $null }
  if ($null -ne $from) { [void][double]::TryParse([string]$from, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$b) }
  $v = ($a - $b) * 1000
  if ($v -lt 0) { $v = 0 }
  return [math]::Round($v, 1)
}

# ---- link ---------------------------------------------------------------------------------
$link = [ordered]@{ interface = $null; type = $null; ipv4 = $null; ipv6 = $null; gateway = $null; wifi = [ordered]@{ ssid = $null; rssiDbm = $null; noiseDbm = $null; channel = $null; txRateMbps = $null; phyMode = $null; security = $null } }
$dnsServers = @(); $dnsSearch = @()
try {
  $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
  if ($cfg) {
    $link.interface = $cfg.InterfaceAlias
    $link.ipv4 = ($cfg.IPv4Address | Select-Object -First 1).IPAddress
    $link.ipv6 = ($cfg.IPv6Address | Where-Object { $_.IPAddress -notlike 'fe80*' } | Select-Object -First 1).IPAddress
    $link.gateway = ($cfg.IPv4DefaultGateway | Select-Object -First 1).NextHop
    $adapter = $cfg.NetAdapter
    if ($adapter.PhysicalMediaType -match '802\.11|Wireless|Native 802') { $link.type = 'wifi' }
    elseif ($adapter.MediaType -match '802\.3' -or $adapter.PhysicalMediaType -match '802\.3|Ethernet') { $link.type = 'ethernet' }
    else { $link.type = 'other' }
    $dnsServers = @($cfg.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses } | Select-Object -Unique | Select-Object -First 8)
    $dnsSearch = @((Get-DnsClient -InterfaceIndex $cfg.InterfaceIndex).ConnectionSpecificSuffix | Where-Object { $_ } | Select-Object -Unique | Select-Object -First 8)
  } else { Add-Note 'No active network adapter with a default gateway was found.' }
} catch { Add-Note 'The network adapter could not be read.' }

if ($link.type -eq 'wifi') {
  try {
    $wlan = netsh wlan show interfaces 2>$null | Out-String
    function Field([string]$label) { if ($wlan -match "(?m)^\s*$label\s*:\s*(.+?)\s*$") { return $Matches[1] } return $null }
    $ssid = $null
    if ($wlan -match '(?m)^\s*SSID\s*:\s*(.+?)\s*$') { $ssid = $Matches[1] }
    $link.wifi.ssid = $ssid
    $link.wifi.channel = Field 'Channel'
    $link.wifi.phyMode = Field 'Radio type'
    $link.wifi.security = Field 'Authentication'
    $tx = Field 'Transmit rate \(Mbps\)'
    if ($tx) { $link.wifi.txRateMbps = [double]$tx }
    $sig = Field 'Signal'
    if ($sig -match '(\d+)%') {
      # Windows reports quality as a percentage. dBm is roughly (percent / 2) - 100.
      $link.wifi.rssiDbm = [math]::Round(([double]$Matches[1] / 2) - 100)
      Add-Note 'Wi-Fi signal was converted from the percentage Windows reports; it is an estimate, not a measured dBm.'
    }
  } catch { Add-Note 'Wi-Fi details were not available.' }
}

# ---- proxy and PAC ------------------------------------------------------------------------
$proxy = [ordered]@{ http = $null; https = $null; autoConfigUrl = $null; autoConfigEnabled = $null; autoDetect = $null; bypass = @() }
try {
  $ie = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
  if ($ie) {
    if ($ie.ProxyEnable -eq 1 -and $ie.ProxyServer) {
      $server = [string]$ie.ProxyServer
      if ($server -match '=') {
        foreach ($part in $server -split ';') {
          if ($part -match '^http=(.+)$') { $proxy.http = Strip-UserInfo $Matches[1] }
          if ($part -match '^https=(.+)$') { $proxy.https = Strip-UserInfo $Matches[1] }
        }
      } else { $proxy.http = Strip-UserInfo $server; $proxy.https = Strip-UserInfo $server }
    }
    $proxy.autoConfigEnabled = [bool]$ie.AutoConfigURL
    if ($ie.AutoConfigURL) { $proxy.autoConfigUrl = Strip-UserInfo ([string]$ie.AutoConfigURL) }
    # AutoDetect lives in the DefaultConnectionSettings blob: bit 0x08 of the flags byte.
    $conn = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\Connections'
    if ($conn -and $conn.DefaultConnectionSettings) { $proxy.autoDetect = [bool]($conn.DefaultConnectionSettings[8] -band 8) }
    if ($ie.ProxyOverride) { $proxy.bypass = @(([string]$ie.ProxyOverride) -split ';' | Where-Object { $_ } | Select-Object -First 20) }
  }
} catch { Add-Note 'Proxy settings could not be read.' }

# ---- public IP ----------------------------------------------------------------------------
$publicIp = $null
if (-not $NoPublicIp) {
  try {
    $ip = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 6 -UseBasicParsing) -as [string]
    if ($ip -match '^[0-9a-fA-F:.]{3,45}$') { $publicIp = $ip.Trim() } else { Add-Note 'The public IP address could not be looked up.' }
  } catch { Add-Note 'The public IP address could not be looked up.' }
}

# ---- per-host timing (curl.exe) -----------------------------------------------------------
$probes = @()
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $NoProbe -and $clean.Count -gt 0) {
  if (-not $curl) { Add-Note 'curl.exe was not found (it ships with Windows 10 version 1803 and newer), so host timing was skipped.' }
  else {
    foreach ($h in $clean) {
      $errText = $null
      $line = & $curl.Source -sS -o NUL --max-time 15 -w '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{http_version} %{remote_ip} %{http_code}' "https://$h/" 2>&1 | Out-String
      $parts = ($line.Trim() -split '\s+')
      if ($parts.Count -lt 7) { $errText = $line.Trim(); if ($errText.Length -gt 160) { $errText = $errText.Substring(0, 160) }; $parts = @($null, $null, $null, $null, $null, $null, $null) }
      $code = $null; if ($parts[6] -match '^\d+$') { $code = [int]$parts[6] }
      $probes += [ordered]@{
        host = $h; dnsMs = (Ms $parts[0] $null); connectMs = (Ms $parts[1] $parts[0]); tlsMs = (Ms $parts[2] $parts[1]); firstByteMs = (Ms $parts[3] $parts[2])
        httpVersion = $parts[4]; remoteIp = $parts[5]; status = $code; error = $errText
      }
    }
  }
}

# ---- route (tracert) ----------------------------------------------------------------------
$routes = @()
if (-not $NoRoute -and $clean.Count -gt 0) {
  foreach ($h in $clean) {
    $hops = @()
    $lines = tracert -d -h 20 -w 1000 $h 2>$null
    foreach ($l in $lines) {
      if ($l -match '^\s*(\d+)\s+(.*)$') {
        $n = [int]$Matches[1]; $rest = $Matches[2]
        $ip = $null; if ($rest -match '([0-9]{1,3}(\.[0-9]{1,3}){3}|[0-9a-fA-F]*:[0-9a-fA-F:]+)\s*$') { $ip = $Matches[1] }
        $rtts = @([regex]::Matches($rest, '(<?\d+)\s*ms') | ForEach-Object { [double]($_.Groups[1].Value -replace '<', '') })
        $rtt = $null; if ($rtts.Count -gt 0) { $rtt = ($rtts | Sort-Object)[[int][math]::Floor(($rtts.Count - 1) / 2)] }
        $hops += [ordered]@{ n = $n; ip = $ip; rttMs = $rtt }
      }
    }
    $routes += [ordered]@{ host = $h; method = 'icmp'; hops = $hops }
  }
}

# ---- write --------------------------------------------------------------------------------
$result = [ordered]@{
  kind = 'socketmap-path'; version = 1; tool = "socketmap-path.ps1 $Version"
  collectedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platform = 'windows'; os = ((Get-CimInstance Win32_OperatingSystem).Caption + ' ' + [Environment]::OSVersion.Version.ToString()).Trim()
  computer = $env:COMPUTERNAME
  link = $link
  dns = [ordered]@{ servers = @($dnsServers); searchDomains = @($dnsSearch) }
  proxy = $proxy
  publicIp = $publicIp; publicIpSource = $(if ($publicIp) { 'api.ipify.org' } else { $null })
  hosts = @($probes); routes = @($routes); notes = @($notes)
}
$json = ConvertTo-Json -InputObject $result -Depth 8
$path = if ([IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location).Path $Out }
[IO.File]::WriteAllText($path, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host "Wrote $path ($([IO.File]::ReadAllBytes($path).Length) bytes). Open it in SocketMap next to your capture. Read it first if you plan to share it."
