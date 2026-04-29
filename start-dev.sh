#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting Next.js dev server..."
  bun run dev
  echo "[$(date)] Next.js dev server exited. Restarting in 2s..."
  sleep 2
done
