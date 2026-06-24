import re

with open('src/components/layout/AppLayout.jsx', 'r') as f:
    content = f.read()

pattern1 = r"""  useEffect\(\(\) => \{
    const checkSLAStatus = async \(\) => \{
      const \{ data \} = await supabase
        \.from\('support_tickets'\)
        \.select\('sla_breach_at'\)
        \.in\('status', \['open', 'pending'\]\);

      if \(data\) \{
        const nearBreach = data\.some\(ticket => \{
          const remainingMs = new Date\(ticket\.big_breach_at \|\| ticket\.sla_breach_at\)\.getTime\(\) - Date\.now\(\);
          return remainingMs > 0 && remainingMs <= 15 \* 60 \* 1000;
        \}\);
        setHasImminentBreach\(nearBreach\);
      \}
    \};
    checkSLAStatus\(\);
    const interval = setInterval\(checkSLAStatus, 60000\);
    return \(\) => clearInterval\(interval\);
  \}, \[\]\);"""

replacement1 = """  useEffect(() => {
    const checkSLAStatus = async () => {
      const { data } = await supabase
        .from('support_tickets')
        .select('sla_breach_at')
        .in('status', ['open', 'pending']);

      if (data) {
        const nearBreach = data.some(ticket => {
          const remainingMs = new Date(ticket.sla_breach_at).getTime() - Date.now();
          return remainingMs > 0 && remainingMs <= 15 * 60 * 1000; // 15 mins
        });
        setHasImminentBreach(nearBreach);
      }
    };
    checkSLAStatus();
    const interval = setInterval(checkSLAStatus, 60000);
    return () => clearInterval(interval);
  }, []);"""

pattern2 = r"""  return \(
    <div className="min-h-screen bg-black">
      \{hasImminentBreach && \(
        <div className="w-full bg-rose-950/40 border-b border-rose-500/30 text-rose-400 font-mono text-\[10px\] uppercase font-black text-center py-1\.5 tracking-widest animate-pulse z-\[100\]">
          ⚠️ CRITICAL ATTENTION REQUIRED: SYSTEM SLA BREACH IMMINENT ON LIVE CASE CHANNELS
        </div>
      \)\}"""

replacement2 = """  return (
    <div className="min-h-screen bg-black">
      {hasImminentBreach && (
        <div className="w-full bg-rose-950/80 border-b border-rose-500/50 text-rose-100 font-mono text-[10px] uppercase font-black text-center py-2 tracking-[0.2em] shadow-[0_0_20px_rgba(225,29,72,0.3)] animate-pulse z-[100] relative">
          ⚠️ CRITICAL ATTENTION REQUIRED: SYSTEM SLA BREACH IMMINENT ON LIVE CASE CHANNELS
        </div>
      )}"""

content = re.sub(pattern1, replacement1, content)
content = re.sub(pattern2, replacement2, content)

with open('src/components/layout/AppLayout.jsx', 'w') as f:
    f.write(content)

print("AppLayout patched")
