const fs = require('fs');

let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

let replaceBlock = `      let promptMessages = "No context messages provided.";
      if (context_messages && Array.isArray(context_messages)) {
        promptMessages = context_messages.map((m: any) => \`\${m.sender_id === 'agent_user' || m.sender_id === 'system' ? 'Agent' : 'Customer'}: \${m.message_body}\`).join("\\n");
      }`;

let safeReplaceBlock = `      let promptMessages = "No context messages provided.";
      if (context_messages && Array.isArray(context_messages)) {
        // Redundant defense-in-depth filter to prevent any internal notes from leaking into LLM context
        const safeMessages = context_messages.filter((m: any) => m.is_internal_note !== true);
        promptMessages = safeMessages.map((m: any) => \`\${m.sender_id === 'agent_user' || m.sender_id === 'system' ? 'Agent' : 'Customer'}: \${m.message_body}\`).join("\\n");
      }`;

code = code.replace(replaceBlock, safeReplaceBlock);

fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
