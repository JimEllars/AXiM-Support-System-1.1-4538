import re

with open('src/components/OnyxCommandHub.jsx', 'r') as f:
    content = f.read()

pattern = r"""        const pathParts = window\.location\.pathname\.split\('/'\);
        const ticketId = pathParts\[1\] === 'ticket' \? pathParts\[2\] : null;

        // CRITICAL TELEMETRY OVERRIDE: Intercept deep inspection macros
        if \(searchQuery\.trim\(\)\.startsWith\('/inspect'\)\) \{
          const targetTraceId = searchQuery\.replace\('/inspect', ''\)\.trim\(\);
          if \(targetTraceId\) \{
            setSearchQuery\(''\);
            inputRef\.current\?\.blur\(\);
            setIsProcessing\(false\);

            // Fire global store setter to reveal diagnostic frame
            useTicketStore\.getState\(\)\.triggerDeepTraceInspection\(targetTraceId\);
            return;
          \}
        \}

        const result = await onyxService\.parseCommand\(searchQuery, ticketId\);"""

replacement = """        const pathParts = window.location.pathname.split('/');
        const ticketId = pathParts[1] === 'ticket' ? pathParts[2] : null;

        // CRITICAL TELEMETRY OVERRIDE: Intercept deep inspection macros
        if (searchQuery.trim().startsWith('/inspect')) {
          const targetTraceId = searchQuery.replace('/inspect', '').trim();
          if (targetTraceId) {
            setSearchQuery('');
            inputRef.current?.blur();
            setIsProcessing(false);
            useTicketStore.getState().triggerDeepTraceInspection(targetTraceId);
            return;
          }
        }

        const result = await onyxService.parseCommand(searchQuery, ticketId);"""

new_content = re.sub(pattern, replacement, content)

if new_content != content:
    with open('src/components/OnyxCommandHub.jsx', 'w') as f:
        f.write(new_content)
    print("Replaced successfully")
else:
    print("Pattern not found, skipping or already applied.")
