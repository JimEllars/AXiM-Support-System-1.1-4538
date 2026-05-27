import re

with open('onyx-edge-worker/src/index.ts', 'r') as f:
    text = f.read()

# Let's see the context of createClient calls
lines = text.split('\n')
for i, line in enumerate(lines):
    if 'createClient(' in line and 'import' not in line:
        print(f"Line {i+1}:")
        # print 5 lines before and after
        start = max(0, i-5)
        end = min(len(lines), i+6)
        for j in range(start, end):
            print(f"  {j+1}: {lines[j]}")
        print("-" * 40)
