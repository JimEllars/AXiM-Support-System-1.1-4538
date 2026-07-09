import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

# Replace env.SUPABASE_ANON_KEY with env.SUPABASE_SERVICE_ROLE_KEY
new_content = content.replace("env.SUPABASE_ANON_KEY", "env.SUPABASE_SERVICE_ROLE_KEY")

with open('onyx-edge-worker/src/index.ts', 'w') as f:
    f.write(new_content)
print("Replaced SUPABASE_ANON_KEY with SUPABASE_SERVICE_ROLE_KEY")
