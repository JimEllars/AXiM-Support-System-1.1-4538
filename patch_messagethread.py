import re

with open('src/components/tickets/MessageThread.jsx', 'r') as f:
    content = f.read()

# We need to replace the return block inside the messages.map loop
# Let's use string manipulation to find it.

search_str = """        return (
          <div key={msg.id} className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'} mb-6`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${
              isCustomer
                ? 'bg-zinc-800/80 border border-zinc-700 text-zinc-200 shadow-md'
                : isInternal
                  ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(245,158,11,0.02)_10px,rgba(245,158,11,0.02)_20px)] bg-amber-950/10 border-amber-500/30 text-amber-100/90 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                  : 'bg-cyan-950/30 border border-cyan-500/20 text-cyan-100'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-black tracking-widest uppercase ${isCustomer ? 'text-zinc-400' : isInternal ? 'text-amber-500' : 'text-cyan-500'}`}>
                  {isCustomer ? 'Public Intake / Customer' : isInternal ? 'System Telemetry' : 'Support Team'}
                </span>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {new Date(msg.created_at).toLocaleString()}
                </span>
              </div>
              <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap">
                {msg.message_body}
              </div>

              {/* CRITICAL INTEGRATION: Surface Action Proposals */}
              {msg.metadata?.hitl_log_id && (
                <div className="mt-4 border-t border-black/20 pt-4">
                  <ActionProposalBlock
                    hitlLogId={msg.metadata.hitl_log_id}
                  />
                </div>
              )}
            </div>
          </div>
        );"""

replace_str = """        return (
          <div key={msg.id} className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'} mb-6`}>
            <div className={`max-w-[85%] rounded-2xl p-4 ${
              isCustomer
                ? 'bg-zinc-800/80 border border-zinc-700 text-zinc-200 shadow-md'
                : isInternal
                  ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(245,158,11,0.02)_10px,rgba(245,158,11,0.02)_20px)] bg-amber-950/10 border-amber-500/30 text-amber-100/90 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                  : 'bg-cyan-950/30 border border-cyan-500/20 text-cyan-100'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-black tracking-widest uppercase ${isCustomer ? 'text-zinc-400' : isInternal ? 'text-amber-500' : 'text-cyan-500'}`}>
                  {isCustomer ? 'Public Intake / Customer' : isInternal ? 'System Telemetry' : 'Support Team'}
                </span>
                <span className="text-[9px] text-zinc-500 font-mono">
                  {new Date(msg.created_at).toLocaleString()}
                </span>
              </div>
              <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap">
                {msg.message_body}
              </div>

              {/* CRITICAL INTEGRATION: Surface Action Proposals */}
              {msg.metadata?.hitl_log_id && (
                <div className="mt-4 border-t border-black/20 pt-4">
                  <ActionProposalBlock
                    hitlLogId={msg.metadata.hitl_log_id}
                  />
                </div>
              )}
            </div>
          </div>
        );"""

# The file might already have this block, let's check
if search_str in content:
    content = content.replace(search_str, replace_str)
    with open('src/components/tickets/MessageThread.jsx', 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Search string not found")
