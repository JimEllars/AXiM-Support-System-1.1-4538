const fs = require('fs');

const path = 'onyx-edge-worker/src/index.ts';
let code = fs.readFileSync(path, 'utf8');

const cosineFunction = `
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
`;

if (!code.includes('cosineSimilarity')) {
    code += cosineFunction;
}

const triageBlock = `
    // CRITICAL FIX: Extract Cloudflare distributed trace ID
    const cfRayId = request.headers.get("cf-ray") || "unknown_ray";

    let potentialDuplicateOf = null;

    if (env.AI && customerOrgId) {
      try {
        // 1. Generate embedding for incoming ticket
        const textToEmbed = \`\${normalizedData.subject} \${normalizedData.description || ""}\`.trim();
        const embeddingsResponse: any = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
          text: [textToEmbed]
        });
        const incomingEmbedding = embeddingsResponse.data?.[0];

        if (incomingEmbedding) {
          // 2. Query recent unresolved tickets for this tenant
          const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const { data: recentTickets, error: recentError } = await supabase
            .from("support_tickets")
            .select("id, subject, description")
            .eq("organization_id", customerOrgId)
            .in("status", ["open", "pending"])
            .gte("created_at", fortyEightHoursAgo);

          if (!recentError && recentTickets && recentTickets.length > 0) {
            let bestMatchId = null;
            let highestSimilarity = 0;

            // 3. Generate embeddings for recent tickets and compare
            for (const t of recentTickets) {
              const tText = \`\${t.subject} \${t.description || ""}\`.trim();
              const tEmbeddingsResponse: any = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
                text: [tText]
              });
              const tEmbedding = tEmbeddingsResponse.data?.[0];

              if (tEmbedding) {
                const similarity = cosineSimilarity(incomingEmbedding, tEmbedding);
                if (similarity > highestSimilarity) {
                  highestSimilarity = similarity;
                  bestMatchId = t.id;
                }
              }
            }

            // 4. Threshold Check (e.g. 0.90)
            if (highestSimilarity >= 0.90 && bestMatchId) {
              potentialDuplicateOf = bestMatchId;

              // 5. Log the duplicate detection event
              ctx.waitUntil(
                supabase.from("events_ax2024").insert({
                  type: "onyx_duplicate_detected",
                  payload: {
                    incoming_subject: normalizedData.subject,
                    matched_ticket_id: bestMatchId,
                    similarity_score: highestSimilarity,
                    organization_id: customerOrgId,
                    timestamp: new Date().toISOString()
                  }
                })
              );
            }
          }
        }
      } catch (aiErr) {
        console.warn("[Duplicate Detection] Error generating embeddings or checking duplicates:", aiErr);
      }
    }

    // Append the trace ID to the ticket's metadata JSONB column for enterprise debugging
    const ticketMetadata: any = {
      source: normalizedData.source || "api_gateway",
      browser: request.headers.get("user-agent") || "unknown",
      cf_ray: cfRayId,
      operational_status: "Pending Triage",
      tags: normalizedData.tags,
      workflow_category: normalizedData.workflow_category,
    };

    if (potentialDuplicateOf) {
        ticketMetadata.potential_duplicate_of = potentialDuplicateOf;
    }
`;

const originalBlock = `
    // CRITICAL FIX: Extract Cloudflare distributed trace ID
    const cfRayId = request.headers.get("cf-ray") || "unknown_ray";

    // Append the trace ID to the ticket's metadata JSONB column for enterprise debugging
    const ticketMetadata = {
      source: normalizedData.source || "api_gateway",
      browser: request.headers.get("user-agent") || "unknown",
      cf_ray: cfRayId,
      operational_status: "Pending Triage",
      tags: normalizedData.tags,
      workflow_category: normalizedData.workflow_category,
    };
`;

code = code.replace(originalBlock.trim(), triageBlock.trim());

fs.writeFileSync(path, code);
