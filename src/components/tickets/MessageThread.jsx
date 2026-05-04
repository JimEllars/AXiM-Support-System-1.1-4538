import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
import ActionProposalBlock from './ActionProposalBlock';

const { FiUser, FiCpu, FiLock, FiTerminal } = FiIcons;

export default function MessageThread({ messages }) {
  return (
    <div className="space-y-8">
      {messages.map((msg) => {
        const isAI = msg.sender_id === 'onyx_system';
        const isInternal = msg.is_internal_note;
        
        return (
          <div key={msg.id} className={`flex gap-6 ${isInternal ? 'opacity-90' : ''}`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 transition-all shadow-lg ${
              isAI ? 'bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-500' :
              isInternal ? 'bg-amber-500/10 border-amber-500/40 text-amber-500' :
              'bg-zinc-800 border-zinc-700 text-zinc-400'
            }`}>
              <SafeIcon icon={isAI ? FiCpu : isInternal ? FiLock : FiUser} className="text-xl" />
            </div>
            
            <div className={`flex-1 p-6 rounded-[1.5rem] border transition-all ${
              isAI ? 'bg-fuchsia-950/10 border-fuchsia-500/20 neon-border-fuchsia' :
              isInternal ? 'bg-amber-900/20 border-amber-500/30' :
              'bg-zinc-900/40 border-zinc-800 shadow-xl'
            }`}>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                    isAI ? 'text-fuchsia-400' : isInternal ? 'text-amber-400' : 'text-zinc-500'
                  }`}>
                    {isAI ? 'Onyx Intelligence' : isInternal ? 'Agent Internal' : 'Customer Relay'}
                  </span>
                  {isAI && <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse" />}
                </div>
                <span className="mono-font text-[10px] text-zinc-600 font-bold">
                  {formatDistanceToNow(new Date(msg.created_at))} AGO
                </span>
              </div>
              <p className={`text-zinc-300 leading-relaxed font-medium ${isAI ? 'mono-font text-sm' : ''}`}>
                {msg.message_body}
              </p>
              {msg.metadata?.hitl_log_id && (
                  <ActionProposalBlock hitlLogId={msg.metadata.hitl_log_id} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}