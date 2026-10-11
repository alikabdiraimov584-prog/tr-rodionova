#!/bin/sh
# Local/full-tooling startup helper. Production Docker uses the split init + web targets.
set -e
sh scripts/init.sh
exec npx next start -p "${PORT:-3000}"
