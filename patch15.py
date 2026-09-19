import re

with open("onyx-edge-worker/test/llm-provider.test.js", "r") as f:
    code = f.read()

pattern = r"""content: \[\{ text: 'Anthropic response' \}\]"""
replacement = """content: [{ type: 'text', text: 'Anthropic response' }]"""
code = re.sub(pattern, replacement, code)

with open("onyx-edge-worker/test/llm-provider.test.js", "w") as f:
    f.write(code)
