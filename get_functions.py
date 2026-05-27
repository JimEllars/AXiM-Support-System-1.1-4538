import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    text = f.read()

# Let's find each function declaration and see where createClient is called
functions = re.finditer(r'async function (\w+)\(request: Request, env: Env\): Promise<Response> \{', text)
for m in functions:
    name = m.group(1)
    print(f"Function: {name}")
