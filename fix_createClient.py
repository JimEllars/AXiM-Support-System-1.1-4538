import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    text = f.read()

# createClient is called multiple times inside handles?
# Let's count within handlers.

import ast
