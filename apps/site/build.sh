#!/usr/bin/env bash
# Builds the website: the static page here, plus the demo web app under app/ (served at /app).
# Run from the repository root: apps/site/build.sh
set -euo pipefail
cd "$(dirname "$0")/../mobile"
rm -rf ../site/app
EXPO_NO_DOTENV=1 KANTV_WEB_BASE=/app npx expo export --platform web --output-dir ../site/app
echo "Built apps/site (the page) and apps/site/app (the web app)."
