#!/bin/sh
set -eu
: "${NOVA_AUTOMATION_TOKEN:?Set a long random adapter token}"
: "${NOVA_BROWSER_DOMAINS:?Set exact approved domain names}"
: "${NOVA_SECCOMP_PROFILE:?Provide the reviewed Playwright Chromium seccomp profile path}"
[ -f "$NOVA_SECCOMP_PROFILE" ] || { echo 'Seccomp profile not found'; exit 1; }
docker run --rm --init --name nova-automation \
  --user 10001:10001 --cap-drop=ALL --security-opt no-new-privileges \
  --security-opt "seccomp=$NOVA_SECCOMP_PROFILE" --read-only \
  --pids-limit=256 --memory=1g --cpus=2 --shm-size=256m \
  --tmpfs /tmp:rw,nosuid,size=256m --tmpfs /home/nova:rw,nosuid,size=64m \
  -p 127.0.0.1:4320:4320 \
  -e NOVA_AUTOMATION_TOKEN -e NOVA_BROWSER_DOMAINS -e NOVA_VIRTUAL_DESKTOP \
  nova-automation:local
