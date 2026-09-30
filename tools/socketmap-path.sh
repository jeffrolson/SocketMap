#!/bin/bash
# SocketMap network path helper for macOS and Linux.
#
# Records what a browser NetLog cannot see: this computer's network link, DNS servers, proxy and PAC
# settings, public IP address, per-host connection timing measured with curl, and the route to each
# host. It writes ONE small JSON file that the SocketMap viewer can load next to a NetLog.
#
# Usage:  ./socketmap-path.sh [--no-public-ip] [--no-probe] [--no-route] [--out FILE] [host ...]
#   host          hostnames to measure (SocketMap's report lists the slowest ones for you)
#   --no-public-ip  do not contact api.ipify.org to learn the public IP address
#   --no-probe      skip the curl timing to each host
#   --no-route      skip the traceroute to each host
#   --out FILE      where to write the result (default: socketmap-path.json in this folder)
#
# It only reads settings and makes ordinary requests: it never changes anything, needs no admin
# rights, and sends nothing anywhere except the requests you can read below (an optional public-IP
# lookup and a plain GET / to each host you list). Nothing is uploaded; read the file before sharing.
# The Wi-Fi network name is recorded when the operating system provides it.

VERSION="1.1"
OUT="socketmap-path.json"
PUBLIC_IP=1
PROBE=1
ROUTE=1
HOSTS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --no-public-ip) PUBLIC_IP=0 ;;
    --no-probe) PROBE=0 ;;
    --no-route) ROUTE=0 ;;
    --out) shift; OUT="$1" ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) HOSTS+=("$1") ;;
  esac
  shift
done

# Only hostnames and addresses: refuse anything else so a typo cannot become a command or a URL.
clean_hosts=()
for h in "${HOSTS[@]}"; do
  if [[ "$h" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$ ]]; then clean_hosts+=("$h"); else echo "Skipping '$h': not a hostname" >&2; fi
done
HOSTS=("${clean_hosts[@]}")
[ ${#HOSTS[@]} -gt 12 ] && HOSTS=("${HOSTS[@]:0:12}")

OS_NAME="$(uname -s)"
NOTES=()
note() { NOTES+=("$1"); }

# JSON helpers: strings are escaped, missing values become null.
jstr() {
  if [ -z "$1" ]; then printf 'null'; return; fi
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g' | tr -d '\000-\010\013-\037' | tr '\n' ' ')"
}
jnum() { if [[ "$1" =~ ^-?[0-9]+(\.[0-9]+)?$ ]]; then printf '%s' "$1"; else printf 'null'; fi; }
jlist() { # strings -> JSON array
  local first=1 item
  printf '['
  for item in "$@"; do [ -z "$item" ] && continue; [ $first -eq 0 ] && printf ','; first=0; jstr "$item"; done
  printf ']'
}
ms() { awk -v a="$1" -v b="${2:-0}" 'BEGIN { if (a == "" || a ~ /[^0-9.]/) { print "null"; exit } v = (a - b) * 1000; if (v < 0) v = 0; printf "%.1f", v }'; }
# Removes credentials from a proxy address, both as scheme://user:pass@host and as a bare user:pass@host.
strip_userinfo() { sed -E -e 's#(://)[^/@ ]*@#\1#g' -e 's#(^|[;, =])[^/@ :;=]+:[^/@ ;]*@#\1#g'; }

# ---- link ------------------------------------------------------------------------------------
IFACE="" GATEWAY="" IPV4="" IPV6="" LINK_TYPE="" SSID="" RSSI="" NOISE="" CHANNEL="" TXRATE="" PHY="" SECURITY=""
if [ "$OS_NAME" = "Darwin" ]; then
  OS_VERSION="macOS $(sw_vers -productVersion 2>/dev/null)"
  eval "$(route -n get default 2>/dev/null | awk '/interface:/{print "IFACE=" $2} /gateway:/{print "GATEWAY=" $2}')"
  [ -n "$IFACE" ] && IPV4="$(ipconfig getifaddr "$IFACE" 2>/dev/null)"
  [ -n "$IFACE" ] && IPV6="$(ifconfig "$IFACE" 2>/dev/null | awk '/inet6 / && $2 !~ /^fe80/ {print $2; exit}')"
  if [ -n "$IFACE" ]; then
    port="$(networksetup -listallhardwareports 2>/dev/null | awk -v i="$IFACE" '/Hardware Port:/{p=$0} $0 ~ "Device: " i "$" {print p; exit}')"
    case "$port" in *Wi-Fi*|*AirPort*) LINK_TYPE="wifi" ;; *Ethernet*|*Thunderbolt*|*USB*|*LAN*) LINK_TYPE="ethernet" ;; "") LINK_TYPE="" ;; *) LINK_TYPE="other" ;; esac
  fi
  if [ "$LINK_TYPE" = "wifi" ]; then
    wifi="$(system_profiler SPAirPortDataType 2>/dev/null | awk '/Current Network Information:/{f=1;next} f&&/^ {12}[^ ]/{ssid=$0} f{print} /Other Local Wi-Fi Networks:/{exit}')"
    SSID="$(printf '%s\n' "$wifi" | awk 'NR==1{sub(/^ +/,""); sub(/:$/,""); print}')"
    [ "$SSID" = "<redacted>" ] && SSID=""
    PHY="$(printf '%s\n' "$wifi" | awk -F': ' '/PHY Mode:/{print $2; exit}')"
    CHANNEL="$(printf '%s\n' "$wifi" | awk -F': ' '/Channel:/{print $2; exit}')"
    SECURITY="$(printf '%s\n' "$wifi" | awk -F': ' '/Security:/{print $2; exit}')"
    TXRATE="$(printf '%s\n' "$wifi" | awk -F': ' '/Transmit Rate:/{print $2; exit}' | tr -dc '0-9.')"
    sn="$(printf '%s\n' "$wifi" | awk -F': ' '/Signal \/ Noise:/{print $2; exit}')"
    RSSI="$(printf '%s' "$sn" | sed -E 's#^(-?[0-9]+) dBm.*#\1#')"
    NOISE="$(printf '%s' "$sn" | sed -E 's#.*/ (-?[0-9]+) dBm.*#\1#')"
    [ -z "$sn" ] && { RSSI=""; NOISE=""; note "Wi-Fi signal strength was not available from this macOS version."; }
  fi
else
  OS_VERSION="$( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || uname -sr )"
  if command -v ip >/dev/null 2>&1; then
    eval "$(ip route show default 2>/dev/null | awk 'NR==1{for(i=1;i<=NF;i++){if($i=="via")print "GATEWAY=" $(i+1); if($i=="dev")print "IFACE=" $(i+1)}}')"
    [ -n "$IFACE" ] && IPV4="$(ip -4 addr show "$IFACE" 2>/dev/null | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')"
    [ -n "$IFACE" ] && IPV6="$(ip -6 addr show "$IFACE" scope global 2>/dev/null | awk '/inet6 /{sub(/\/.*/,"",$2); print $2; exit}')"
    if [ -d "/sys/class/net/$IFACE/wireless" ]; then
      LINK_TYPE="wifi"
      if command -v iw >/dev/null 2>&1; then
        SSID="$(iw dev "$IFACE" link 2>/dev/null | awk -F': ' '/SSID:/{print $2; exit}')"
        RSSI="$(iw dev "$IFACE" link 2>/dev/null | awk '/signal:/{print $2; exit}')"
        TXRATE="$(iw dev "$IFACE" link 2>/dev/null | awk '/tx bitrate:/{print $3; exit}')"
      else note "Wi-Fi details need the iw command."; fi
    elif [ -n "$IFACE" ]; then LINK_TYPE="ethernet"; fi
  else note "The ip command was not found, so the link could not be read."; fi
fi

# ---- DNS -------------------------------------------------------------------------------------
DNS_SERVERS=() DNS_SEARCH=()
if [ "$OS_NAME" = "Darwin" ]; then
  while IFS= read -r line; do [ -n "$line" ] && DNS_SERVERS+=("$line"); done < <(scutil --dns 2>/dev/null | awk '/nameserver\[[0-9]+\]/{print $3}' | awk '!seen[$0]++' | head -8)
  while IFS= read -r line; do [ -n "$line" ] && DNS_SEARCH+=("$line"); done < <(scutil --dns 2>/dev/null | awk '/search domain\[[0-9]+\]/{print $4}' | awk '!seen[$0]++' | head -8)
else
  if command -v resolvectl >/dev/null 2>&1; then
    while IFS= read -r line; do [ -n "$line" ] && DNS_SERVERS+=("$line"); done < <(resolvectl dns 2>/dev/null | sed 's/^[^:]*: *//' | tr ' ' '\n' | awk 'NF && !seen[$0]++' | head -8)
  fi
  if [ ${#DNS_SERVERS[@]} -eq 0 ]; then
    while IFS= read -r line; do [ -n "$line" ] && DNS_SERVERS+=("$line"); done < <(awk '/^nameserver/{print $2}' /etc/resolv.conf 2>/dev/null | head -8)
  fi
  while IFS= read -r line; do [ -n "$line" ] && DNS_SEARCH+=("$line"); done < <(awk '/^search/{for(i=2;i<=NF;i++)print $i}' /etc/resolv.conf 2>/dev/null | head -8)
fi

# ---- proxy and PAC ---------------------------------------------------------------------------
PROXY_HTTP="" PROXY_HTTPS="" PAC_URL="" PAC_ON="" AUTODETECT="" BYPASS=()
if [ "$OS_NAME" = "Darwin" ]; then
  proxy="$(scutil --proxy 2>/dev/null)"
  pv() { printf '%s\n' "$proxy" | awk -v k="$1" '$1==k && $2==":" {print $3; exit}'; }
  [ "$(pv HTTPEnable)" = "1" ] && PROXY_HTTP="$(pv HTTPProxy):$(pv HTTPPort)"
  [ "$(pv HTTPSEnable)" = "1" ] && PROXY_HTTPS="$(pv HTTPSProxy):$(pv HTTPSPort)"
  PAC_ON="$(pv ProxyAutoConfigEnable)"
  [ "$PAC_ON" = "1" ] && PAC_URL="$(printf '%s\n' "$proxy" | awk '/ProxyAutoConfigURLString/{print $3; exit}' | strip_userinfo)"
  AUTODETECT="$(pv ProxyAutoDiscoveryEnable)"
  while IFS= read -r line; do [ -n "$line" ] && BYPASS+=("$line"); done < <(printf '%s\n' "$proxy" | awk '/ExceptionsList/{f=1;next} f&&/^ *[0-9]+ :/{print $3} f&&/}/{exit}' | head -20)
else
  PROXY_HTTP="$(printf '%s' "${http_proxy:-$HTTP_PROXY}" | strip_userinfo)"
  PROXY_HTTPS="$(printf '%s' "${https_proxy:-$HTTPS_PROXY}" | strip_userinfo)"
  note "On Linux only proxy environment variables are read, not desktop settings."
fi

# ---- public IP -------------------------------------------------------------------------------
PUBLIC=""
if [ $PUBLIC_IP -eq 1 ] && command -v curl >/dev/null 2>&1; then
  PUBLIC="$(curl -s --max-time 6 https://api.ipify.org 2>/dev/null | tr -d '[:space:]')"
  [[ "$PUBLIC" =~ ^[0-9a-fA-F:.]{3,45}$ ]] || { PUBLIC=""; note "The public IP address could not be looked up."; }
fi

# ---- per-host timing (curl) ------------------------------------------------------------------
probes_json() {
  local first=1 h line dns conn app start ver ip code err
  printf '['
  for h in "${HOSTS[@]}"; do
    [ $first -eq 0 ] && printf ','; first=0
    err=""
    line="$(curl -sS -o /dev/null --max-time 15 -w '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{http_version} %{remote_ip} %{http_code}' "https://$h/" 2>/tmp/socketmap-path-err.$$)"
    rc=$?
    if [ $rc -ne 0 ]; then
      # A failed request: report why, and record no timings (curl still prints partial fields).
      err="$(head -c 160 /tmp/socketmap-path-err.$$ 2>/dev/null | tr '\n' ' ')"; [ -z "$err" ] && err="curl exit code $rc"
      line=""
    fi
    read -r dns conn app start ver ip code <<< "$line"
    printf '{"host":%s,"dnsMs":%s,"connectMs":%s,"tlsMs":%s,"firstByteMs":%s,"httpVersion":%s,"remoteIp":%s,"status":%s,"error":%s}' \
      "$(jstr "$h")" "$(ms "$dns")" "$(ms "$conn" "$dns")" "$(ms "$app" "$conn")" "$(ms "$start" "$app")" "$(jstr "$ver")" "$(jstr "$ip")" "$(jnum "$code")" "$(jstr "$err")"
  done
  rm -f /tmp/socketmap-path-err.$$
  printf ']'
}

# ---- route (traceroute) ----------------------------------------------------------------------
routes_json() {
  local first=1 h out
  printf '['
  for h in "${HOSTS[@]}"; do
    [ $first -eq 0 ] && printf ','; first=0
    out="$(traceroute -n -q 1 -w 2 -m 20 "$h" 2>/dev/null)"
    printf '{"host":%s,"method":"udp","hops":' "$(jstr "$h")"
    printf '%s\n' "$out" | awk '
      BEGIN { printf "["; n = 0 }
      /^ *[0-9]+ / {
        hop = $1; ip = ""; rtt = ""
        for (i = 2; i <= NF; i++) { if ($i ~ /^[0-9a-fA-F:.]+$/ && ip == "" && $i ~ /[.:]/) ip = $i; if ($i == "ms" && rtt == "") rtt = $(i-1) }
        if (n++) printf ","
        printf "{\"n\":%s,\"ip\":%s,\"rttMs\":%s}", hop, (ip == "" ? "null" : "\"" ip "\""), (rtt == "" ? "null" : rtt)
      }
      END { printf "]" }'
    printf '}'
  done
  printf ']'
}

# ---- write -----------------------------------------------------------------------------------
{
  printf '{"kind":"socketmap-path","version":1,"tool":%s,' "$(jstr "socketmap-path.sh $VERSION")"
  printf '"collectedAt":%s,"platform":%s,"os":%s,"computer":%s,' "$(jstr "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" "$(jstr "$( [ "$OS_NAME" = Darwin ] && echo macos || echo linux )")" "$(jstr "$OS_VERSION")" "$(jstr "$(hostname 2>/dev/null)")"
  printf '"link":{"interface":%s,"type":%s,"ipv4":%s,"ipv6":%s,"gateway":%s,' "$(jstr "$IFACE")" "$(jstr "$LINK_TYPE")" "$(jstr "$IPV4")" "$(jstr "$IPV6")" "$(jstr "$GATEWAY")"
  printf '"wifi":{"ssid":%s,"rssiDbm":%s,"noiseDbm":%s,"channel":%s,"txRateMbps":%s,"phyMode":%s,"security":%s}},' "$(jstr "$SSID")" "$(jnum "$RSSI")" "$(jnum "$NOISE")" "$(jstr "$CHANNEL")" "$(jnum "$TXRATE")" "$(jstr "$PHY")" "$(jstr "$SECURITY")"
  printf '"dns":{"servers":%s,"searchDomains":%s},' "$(jlist "${DNS_SERVERS[@]}")" "$(jlist "${DNS_SEARCH[@]}")"
  printf '"proxy":{"http":%s,"https":%s,"autoConfigUrl":%s,"autoConfigEnabled":%s,"autoDetect":%s,"bypass":%s},' "$(jstr "$PROXY_HTTP")" "$(jstr "$PROXY_HTTPS")" "$(jstr "$PAC_URL")" "$( [ "$PAC_ON" = 1 ] && echo true || ( [ "$PAC_ON" = 0 ] && echo false || echo null ) )" "$( [ "$AUTODETECT" = 1 ] && echo true || ( [ "$AUTODETECT" = 0 ] && echo false || echo null ) )" "$(jlist "${BYPASS[@]}")"
  printf '"probeUsesProxy":%s,' "$( [ -n "${https_proxy:-$HTTPS_PROXY}${all_proxy:-$ALL_PROXY}" ] && echo true || echo false )"
  printf '"publicIp":%s,"publicIpSource":%s,' "$(jstr "$PUBLIC")" "$( [ -n "$PUBLIC" ] && jstr api.ipify.org || echo null )"
  if [ $PROBE -eq 1 ] && [ ${#HOSTS[@]} -gt 0 ] && command -v curl >/dev/null 2>&1; then printf '"hosts":%s,' "$(probes_json)"; else printf '"hosts":[],'; fi
  if [ $ROUTE -eq 1 ] && [ ${#HOSTS[@]} -gt 0 ] && command -v traceroute >/dev/null 2>&1; then printf '"routes":%s,' "$(routes_json)"; else printf '"routes":[],'; [ $ROUTE -eq 1 ] && [ ${#HOSTS[@]} -gt 0 ] && note "traceroute was not found, so no route was recorded."; fi
  printf '"notes":%s}\n' "$(jlist "${NOTES[@]}")"
} > "$OUT"

echo "Wrote $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes). Open it in SocketMap next to your capture. Read it first if you plan to share it."
