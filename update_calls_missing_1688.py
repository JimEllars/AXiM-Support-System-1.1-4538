import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

# Let's fix analyzeWithOnyx(subject, description, env.ANTHROPIC_API_KEY) in the tests if any or anywhere else.
def replacer(match):
    original = match.group(0)

    # Single line
    if "env.ANTHROPIC_API_KEY);" in original:
        return original.replace("env.ANTHROPIC_API_KEY);", "env.ANTHROPIC_API_KEY, null, null, \"\", env);")

    return original

content = re.sub(r'analyzeWithOnyx\([^)]+env\.ANTHROPIC_API_KEY,?\s*\);', replacer, content)

with open('onyx-edge-worker/src/index.ts', 'w') as f:
    f.write(content)
