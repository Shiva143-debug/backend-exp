#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

echo "=== Environment Setup Script ==="

if [ -f "$ENV_FILE" ]; then
  echo "[!] $ENV_FILE already exists. Skipping creation."
  echo "    Edit it directly to update your environment variables."
else
  if [ -f "$EXAMPLE_FILE" ]; then
    cp "$EXAMPLE_FILE" "$ENV_FILE"
    echo "[+] Created $ENV_FILE from $EXAMPLE_FILE"
    echo ""
    echo "    Open $ENV_FILE and fill in your actual values:"
    echo "      - DATABASE_URL    (your Supabase PostgreSQL connection string)
      - DB_SSL          (set to 'false' if your DB doesn't support SSL)"
    echo "      - GEMINI_API_KEY  (your Google Gemini API key)"
    echo "      - GMAIL_* / EMAIL_FROM (for email notifications)"
    echo "      - JWT_SECRET      (any strong random string)"
    echo ""
  else
    echo "[ERROR] $EXAMPLE_FILE not found!"
    exit 1
  fi
fi

echo ""
echo "=== Installing npm dependencies ==="
npm install

echo ""
echo "=== Setup Complete ==="
echo "Run 'npm start' to start the server."
