#!/usr/bin/env bash
set -euo pipefail

echo "=== Installing Python dependencies ==="
pip install -r backend/requirements.txt

echo "=== Building frontend ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Build complete ==="
