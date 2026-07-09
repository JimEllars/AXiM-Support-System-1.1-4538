import re

with open('src/components/tickets/ActionProposalBlock.jsx', 'r') as f:
    content = f.read()

# We need to find the `try` block in `handleExecute`
# Specifically replacing `if (onComplete) onComplete();` with the required snippet.

target = """      setLogDetails(prev => ({ ...prev, status: 'executed' }));
      toast.success(`Action executed securely via core gateway.`, {
         style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      if (onComplete) onComplete();"""

replacement = """      const responseData = await res.json();
      const executionTrace = responseData.cf_ray || "unknown";

      // CRITICAL FIX: Mutate state variables locally to instantly collapse controls on completion
      setLogDetails(prev => ({ ...prev, status: 'executed' }));

      toast.success(`Action executed securely.\\nTrace: ${executionTrace}`, {
         style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', whiteSpace: 'pre-wrap' }
      });

      if (onComplete) {
        onComplete();
      }"""

if target in content:
    new_content = content.replace(target, replacement)
    with open('src/components/tickets/ActionProposalBlock.jsx', 'w') as f:
        f.write(new_content)
    print("Replaced successfully")
else:
    print("Could not find target")
