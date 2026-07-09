import re

with open('src/components/layout/CoreHealthIndicator.jsx', 'r') as f:
    content = f.read()

# Replace empty block statement in fetchAITelemetry catch block
content = content.replace("} catch (e) {}", "} catch (e) { console.error('Failed to fetch AI telemetry', e); }")

with open('src/components/layout/CoreHealthIndicator.jsx', 'w') as f:
    f.write(content)
