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
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateTypingStatus } = useTicketStore();
  const typingTimeoutRef = React.useRef(null);

  const handleTyping = (e) => {
    setReplyText(e.target.value);

    // Fire typing indicator presence
    updateTypingStatus(true, { agentId: "dash-user-1", name: "Agent" });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false, { agentId: "dash-user-1", name: "Agent" });
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
      }

      setReplyText('');
      toast.success(isInternal ? 'Internal note added.' : 'Reply sent to customer.');
    } catch (err) {
      toast.error('Failed to send message: ' + err.message);
    } finally {
      setIsSubmitting(false);
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
              <span className={`px-3 py-1 rounded text-[10px] uppercase font-black tracking-widest ${ticket.priority === 'urgent' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'}`}>
                {ticket.priority}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
              <span>ID: {ticket.id}</span>
              <span>Status: <span className="text-zinc-300">{ticket.status}</span></span>
              <span>Customer: <span className="text-zinc-300">{ticket.contacts_ax2024?.email || 'Unknown'}</span></span>
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
