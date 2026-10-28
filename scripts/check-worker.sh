#!/bin/sh
set -eu
npx tsc -p worker/tsconfig.json
npx wrangler deploy --config worker/wrangler.jsonc --dry-run
