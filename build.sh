
#!/usr/bin/env bash

set -o errexit

# Install dependencies (already done by Render, but good to have)
npm install

# Ensure Puppeteer's cache directory exists
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
mkdir -p $PUPPETEER_CACHE_DIR

# Copy cached browser binary if available (try to restore from previous build)
if [[ -d $PUPPETEER_CACHE_DIR ]]; then
  echo "Restoring Puppeteer cache from $PUPPETEER_CACHE_DIR"
  cp -R $PUPPETEER_CACHE_DIR/* /opt/render/project/src/.cache/puppeteer/
else
  echo "No Puppeteer cache found at $PUPPETEER_CACHE_DIR"
fi
