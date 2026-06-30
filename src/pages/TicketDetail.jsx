import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTicketStore } from '../store/useTicketStore';
import toast from 'react-hot-toast';
import MessageThread from '../components/tickets/MessageThread';
import AutoDraftWhisper from '../components/tickets/AutoDraftWhisper';
import Customer360 from '../components/tickets/Customer360';
import { FiArrowLeft, FiSend, FiLock, FiUnlock, FiCheckCircle, FiPaperclip, FiFileText } from 'react-icons/fi';

export default function TicketDetail() {
  const { fetchTickets, currentTicketAttachments, fetchTicketAttachments, clearCurrentTicketData, activeAgents, updateTypingStatus, joinTicketPresence, leaveTicketPresence } = useTicketStore();
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
    const typingTimeoutRef = React.useRef(null);
  const [currentUser, setCurrentUser] = useState(null);

    useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data?.user);
      if (data?.user) {
        if (joinTicketPresence) {
          joinTicketPresence(id, {
            agentId: data.user.id,
            name: data.user.email?.split('@')[0] || 'Agent',
            role: 'Support Engineer',
            color: 'bg-cyan-500'
          });
        }
      }
    });

    return () => {
      if (leaveTicketPresence) leaveTicketPresence();
      if (clearCurrentTicketData) clearCurrentTicketData();
    };
  }, [id, joinTicketPresence, leaveTicketPresence, clearCurrentTicketData]);

  const handleTyping = (e) => {
    setReplyText(e.target.value);

    if (!currentUser) return;

    const agentPayload = {
      agentId: currentUser.id,
      name: currentUser.email?.split('@')[0] || 'Agent',
      role: 'Support Engineer',
      color: 'bg-cyan-500'
    };

    updateTypingStatus(true, agentPayload);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false, agentPayload);
    }, 2000);
  };

  useEffect(() => {
    const fetchTicketData = async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*, contacts_ax2024(*)')
        .eq('id', id)
        .single();
      if (error) toast.error("Failed to load ticket.");

      const { data: attData } = await supabase
        .from("support_attachments")
        .select("*")
        .eq("ticket_id", id);
      if (attData) setAttachments(attData);
    };
    fetchTicketData();
  }, [id]);


  const handleClaim = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      await supabase.from('support_tickets').update({ assignee_id: user.id }).eq('id', id);
      setTicket(prev => ({ ...prev, assignee_id: user.id }));
      fetchTickets(); // Sync global
      toast.success('Ticket claimed successfully.', { style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' } });
    } catch (err) {
      toast.error('Failed to claim ticket.');
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: id,
        sender_id: user?.id || 'agent',
        sender_type: 'agent',
        message_body: replyText,
        is_internal_note: isInternal
      });
      if (error) throw error;

      // Auto-transition status to pending if agent replies publicly
      if (!isInternal && ticket.status === 'open') {
         await supabase.from('support_tickets').update({ status: 'pending' }).eq('id', id);
         setTicket(prev => ({ ...prev, status: 'pending' })); // Update local
         fetchTickets(); // CRITICAL FIX: Update global dashboard cache
      }

      setReplyText('');
      toast.success(isInternal ? 'Internal note added.' : 'Reply sent to customer.');
    } catch (err) {
      toast.error('Failed to send message: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBroadcastOutage = async () => {
    if (!window.confirm("Broadcast this issue to the public AXiM Health Status page?")) return;
    try {
      await supabase.from("events_ax2024").insert({
        type: "status_broadcast",
        payload: { ticket_id: id, subject: ticket.subject, status: 'investigating', timestamp: new Date().toISOString() }
      });
      toast.success('Public Status Page Updated', { icon: '📢', style: { background: '#09090b', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' } });
    } catch (err) {
      toast.error('Failed to broadcast status.');
    }
  };

  const handleResolve = async () => {
    if (!window.confirm("Mark this ticket as Resolved?")) return;
    try {
      await supabase.from('support_tickets').update({ status: 'resolved' }).eq('id', id);
      toast.success('Ticket Resolved');
      navigate('/dashboard');
    } catch (err) {
      toast.error('Failed to resolve.');
    }
  };

  if (!ticket) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-black p-8 text-white pb-32">
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-zinc-500 hover:text-cyan-400 transition-colors mb-8 font-mono text-xs uppercase font-bold tracking-widest">
        <FiArrowLeft /> Back to Dashboard
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 max-w-[1600px] mx-auto">
        <div className="xl:col-span-2 space-y-6">
          {/* Header */}
          <div className="glass-panel bg-zinc-950/80 border-zinc-800 rounded-3xl p-8">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-3xl font-black tracking-tight">{ticket.subject}</h1>
              <div className="flex gap-2 items-center">
                {ticket.priority === 'urgent' && ticket.status !== 'resolved' && (
                  <button onClick={handleBroadcastOutage} className="px-3 py-1 rounded text-[10px] uppercase font-black tracking-widest bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors">
                    📢 Broadcast Status
                  </button>
                )}
                {ticket.priority !== 'urgent' && (
                  <button className="px-3 py-1 rounded text-[10px] uppercase font-black tracking-widest bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-colors">
                    Escalate
                  </button>
                )}
                <span className={`px-3 py-1 rounded text-[10px] uppercase font-black tracking-widest ${ticket.priority === 'urgent' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'}`}>
                  {ticket.priority}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500 mt-4 flex-wrap">
              <span className="bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80 shadow-inner text-zinc-400">ID: {ticket.id.split('-')[0]}</span>
              <span className="bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80 shadow-inner">Status: <span className="text-white font-bold">{ticket.status}</span></span>
              <span className="bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80 shadow-inner">Dept: <span className="text-cyan-400 font-bold">{ticket.assigned_department || 'General'}</span></span>
              <span className="bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80 shadow-inner">Source: <span className="text-emerald-400 font-bold uppercase">{ticket.metadata?.source || 'Web'}</span></span>
              <span className="bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80 shadow-inner">Customer: <span className="text-fuchsia-400 font-bold">{ticket.contacts_ax2024?.email || 'Unknown'}</span></span>

              {!ticket.assignee_id && ticket.status !== 'resolved' && (
                 <button onClick={handleClaim} className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors shadow-inner">
                   🙋‍♂️ Claim Ticket
                 </button>
              )}
              {ticket.assignee_id && (
                 <span className="bg-emerald-950/20 px-2.5 py-1.5 rounded-lg border border-emerald-900/30 text-emerald-500 font-bold shadow-inner">Assigned</span>
              )}
            </div>
          </div>

          {attachments.length > 0 && (
            <div className="glass-panel bg-cyan-950/10 border-cyan-900/30 rounded-3xl p-6 mb-6">
              <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-cyan-500 mb-3 flex items-center gap-2">
                <FiPaperclip /> Attached Diagnostics
              </h3>
              <div className="flex flex-wrap gap-3">
                {attachments.map(att => (
                  <a
                    key={att.id}
                    href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ticket_attachments/${att.file_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-black/50 border border-zinc-800 hover:border-cyan-500/50 rounded-xl transition-all group"
                  >
                    <FiFileText className="text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                    <div>
                      <p className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{att.file_name}</p>
                      <p className="text-[10px] text-zinc-600 font-mono uppercase">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
          <AutoDraftWhisper ticketId={ticket.id} onApplyDraft={(draft) => setReplyText(draft)} />

          <div className="glass-panel bg-zinc-950/80 border-zinc-800 rounded-3xl p-8">
            <MessageThread ticketId={ticket.id} />

            {/* Reply Composer */}
            <div className="mt-8 pt-8 border-t border-zinc-900">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-400">Response Editor</label>
                <button
                  onClick={() => setIsInternal(!isInternal)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] uppercase font-black tracking-widest transition-colors ${isInternal ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  {isInternal ? <FiLock /> : <FiUnlock />}
                  {isInternal ? 'Internal Note' : 'Public Reply'}
                </button>
              </div>
              <textarea
                value={replyText}
                onChange={handleTyping}
                placeholder={isInternal ? "Add an internal note visible only to agents..." : "Draft a response to the customer..."}
                className={`w-full min-h-[150px] bg-black/50 border rounded-2xl p-4 text-sm focus:outline-none transition-colors resize-y ${isInternal ? 'border-amber-500/30 focus:border-amber-500/60' : 'border-zinc-800 focus:border-cyan-500/50'}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSendReply();
                  }
                  // Quick Macro: /template
                  if (e.key === ' ' && replyText.trim() === '/template') {
                    e.preventDefault();
                    setReplyText('**Hello,**\n\nThank you for reaching out. Upon reviewing your diagnostics...\n\n**Next Steps:**\n- \n- \n\nBest,\nAXiM Support');
                  }
                }}
              />
              <div className="flex justify-between items-center mt-4">
                <span className="text-[10px] text-zinc-600 font-mono uppercase">Cmd/Ctrl + Enter to send</span>
                <div className="flex gap-3">
                  <button
                    onClick={handleResolve}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    <FiCheckCircle /> Resolve
                  </button>
                  <button
                    disabled={isSubmitting || !replyText.trim()}
                    onClick={handleSendReply}
                    className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-black ${isInternal ? 'bg-amber-500 hover:bg-amber-400' : 'bg-cyan-500 hover:bg-cyan-400'}`}
                  >
                    {isSubmitting ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <FiSend />}
                    {isInternal ? 'Save Note' : 'Send Reply'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Customer360 customerId={ticket.customer_id} />
        </div>
      </div>
    </div>
  );
}
