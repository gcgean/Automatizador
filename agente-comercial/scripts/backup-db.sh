#!/bin/sh
set -eu
mkdir -p /backups
while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  destination="/backups/command-comercial-${stamp}.dump"
  media="/backups/command-comercial-media-${stamp}.tar.gz"
  if pg_dump --format=custom --file="${destination}.tmp" && { [ ! -d /data/media ] || tar -czf "${media}.tmp" --exclude='*.part-*' -C /data media; }; then
    mv "${destination}.tmp" "$destination"
    if [ -f "${media}.tmp" ]; then mv "${media}.tmp" "$media"; fi
    find /backups -type f -name 'command-comercial-*.dump' -mtime +14 -delete
    find /backups -type f -name 'command-comercial-media-*.tar.gz' -mtime +14 -delete
    echo "Backup PostgreSQL e mídias concluído: ${stamp}"
  else
    echo 'Falha no backup PostgreSQL; nova tentativa em uma hora.' >&2
    sleep 3600
    continue
  fi
  sleep 86400
done
