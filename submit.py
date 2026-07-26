import urllib.request
import json

data = json.dumps({
    "jsonrpc": "2.0",
    "method": "submit",
    "params": {
        "branch_name": "feat/phase-145-brief-command",
        "commit_message": "feat: phase 145 brief dispatch telemetry",
        "title": "feat: Phase 145 Onyx Command Hub Brief Dispatch & Telemetry",
        "description": "This PR implements the `/brief` command within the Onyx Command Hub to generate executive summaries via `Workers AI` and dispatch them to `james.ellars@axim.us.com`. It also updates `SupportMetrics.jsx` to reflect 24h executive response counts."
    },
    "id": 1
}).encode('utf-8')

try:
    req = urllib.request.Request('http://localhost:54321/api/v1/submit', data=data, headers={'Content-Type': 'application/json'})
    # urllib.request.urlopen(req)
except Exception as e:
    pass
