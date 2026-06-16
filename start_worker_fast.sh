cd onyx-edge-worker
kill $(lsof -t -i :8787) 2>/dev/null || true
echo "SUPABASE_URL=http://localhost:54322" > .dev.vars
echo "SUPABASE_SERVICE_ROLE_KEY=test-key" >> .dev.vars
echo "AXIM_ONYX_SECRET=test-secret" >> .dev.vars
echo "ALLOWED_ORIGINS=http://localhost:5173" >> .dev.vars
npx wrangler dev --port 8787 > worker_fast.log 2>&1 &
