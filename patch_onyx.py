import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    content = f.read()

# Let's verify the replacement happened correctly.
import sys
if 'env.DEEPSEEK_API_KEY' in content:
    print("Replace was successful")
else:
    print("Replace failed")
