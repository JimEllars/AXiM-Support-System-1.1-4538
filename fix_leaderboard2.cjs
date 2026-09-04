const fs = require('fs');
let code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');

// Now, update the backend API '/api/v1/analytics/leaderboard' to include CSAT.
// In index.ts, `handleLeaderboardAnalytics` fetch ops and we want to include avg_csat.
// Let's modify handleLeaderboardAnalytics.
const updatedLeaderboardFunc = `
async function handleLeaderboardAnalytics(request: Request, env: Env, ctx: any): Promise<Response> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch active operators
  const { data: operators, error: opsError } = await supabase
      .from("team_profiles")
      .select("id, email")
      .in("role", ["operator", "lead"]);

  if (opsError || !operators) {
      return new Response(JSON.stringify({ error: "Failed to fetch operators" }), {
          status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
      });
  }

  // 2. Fetch memory contributions (Score weight: 10)
  const { data: contributions } = await supabase
      .from("memory_banks")
      .select("author_id, created_at")
      .gte("created_at", thirtyDaysAgo);

  // 3. Fetch manual renewals (Score weight: 5)
  const { data: renewals } = await supabase
      .from("events_ax2024")
      .select("payload")
      .eq("type", "memory_manual_renewed")
      .gte("timestamp", thirtyDaysAgo);

  // 4. Fetch CSAT scores
  const { data: feedbacks } = await supabase
      .from("ticket_feedback")
      .select("operator_id, rating")
      .gte("created_at", thirtyDaysAgo);

  const opStats = operators.map(op => {
      const opContributes = (contributions || []).filter(c => c.author_id === op.id).length;
      const opRenewals = (renewals || []).filter(r => r.payload?.operator_id === op.id).length;

      const opFeedbacks = (feedbacks || []).filter(f => f.operator_id === op.id);
      let avg_csat = 0;
      if (opFeedbacks.length > 0) {
          avg_csat = opFeedbacks.reduce((sum, f) => sum + f.rating, 0) / opFeedbacks.length;
      }

      // Bonus points for good CSAT
      const csatBonus = avg_csat >= 4.5 ? 20 : (avg_csat >= 4.0 ? 10 : 0);

      const score = (opContributes * 10) + (opRenewals * 5) + csatBonus;

      return {
          id: op.id,
          email: op.email,
          contributions: opContributes,
          renewals: opRenewals,
          score: score,
          avg_csat: avg_csat
      };
  });

  const sortedLeaderboard = opStats.sort((a, b) => b.score - a.score);

  return new Response(JSON.stringify({ leaderboard: sortedLeaderboard }), {
      status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(env, request) }
  });
}
`;

// replace handleLeaderboardAnalytics
code = code.replace(/async function handleLeaderboardAnalytics[\s\S]*?(?=async function handleManualLeaderboardDispatch)/, updatedLeaderboardFunc + '\n');

fs.writeFileSync('onyx-edge-worker/src/index.ts', code);
console.log('Leaderboard backend updated.');
