import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiDatabase, FiPlus, FiTrash2, FiSearch, FiSave, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';

export default function MemoryHub() {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingAudits, setPendingAudits] = useState([]);
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [selectedAuditText, setSelectedAuditText] = useState('');

  const [newRule, setNewRule] = useState({
    title: '',
    content: '',
    category: 'General'
  });

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('memory_banks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching memory banks:', error);
      toast.error('Failed to load system memory.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingAudits = async () => {
    try {
      const { data, error } = await supabase
        .from('ticket_ai_telemetry')
        .select('*, support_tickets(subject, description)')
        .lte('confidence_score', 0.65)
        .eq('is_curated', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingAudits(data || []);
    } catch (error) {
      console.error('Error fetching pending audits:', error);
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchPendingAudits();
  }, []);

  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (!newRule.title || !newRule.content) {
      toast.error('Title and content are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('memory_banks')
        .insert({
          title: newRule.title,
          content: newRule.content,
          metadata: { category: newRule.category, source: 'manual_entry' }
        });

      if (error) throw error;

      toast.success('Rule added to memory banks successfully.');
      setNewRule({ title: '', content: '', category: 'General' });
      fetchEntries();
    } catch (error) {
      console.error('Error creating rule:', error);
      toast.error('Failed to create rule.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;

    try {
      const { error } = await supabase
        .from('memory_banks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Rule deleted.');
      fetchEntries();
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast.error('Failed to delete rule.');
    }
  };

  const handlePublishToVectorStore = async (auditId) => {
    if (!selectedAuditText) {
      toast.error('Curated text is required.');
      return;
    }
    try {
      // 1. Insert into memory_banks
      const auditRecord = pendingAudits.find(a => a.ticket_id === auditId);
      const title = auditRecord?.support_tickets?.subject || `Curated Fix for #${auditId.split('-')[0]}`;

      const { error: insertError } = await supabase
        .from('memory_banks')
        .insert({
          title: title,
          content: selectedAuditText,
          metadata: { source: 'curated_audit', original_ticket_id: auditId }
        });

      if (insertError) throw insertError;

      // 2. Mark as curated in ticket_ai_telemetry
      const { error: updateError } = await supabase
        .from('ticket_ai_telemetry')
        .update({ is_curated: true })
        .eq('ticket_id', auditId);

      if (updateError) throw updateError;

      toast.success('Curated Playbook Published successfully.');
      setSelectedAuditId(null);
      setSelectedAuditText('');
      fetchPendingAudits();
      fetchEntries();
    } catch (error) {
      console.error('Error publishing curated playbook:', error);
      toast.error('Failed to publish curated playbook.');
    }
  };

  const filteredEntries = entries.filter(entry =>
    entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4 border-b border-zinc-800 pb-6">
        <div className="w-12 h-12 bg-fuchsia-500/10 rounded-2xl flex items-center justify-center border border-fuchsia-500/20">
          <FiDatabase className="text-2xl text-fuchsia-400" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">System Memory Hub</h1>
          <p className="text-zinc-400 mt-1">Manage operational rules, RAG knowledge base for Onyx, and curate low-confidence playbooks.</p>
        </div>
      </div>

      {pendingAudits.length > 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-6 shadow-xl mb-8">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <FiCheckCircle className="text-cyan-400" /> Human-in-the-Loop Curation Grid
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Pane: Pending Audits List */}
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {pendingAudits.map(audit => (
                <div
                  key={audit.ticket_id}
                  onClick={() => {
                    setSelectedAuditId(audit.ticket_id);
                    setSelectedAuditText(audit.auto_response_draft || '');
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedAuditId === audit.ticket_id ? 'border-cyan-500 bg-cyan-500/10' : 'border-zinc-800 bg-black/40 hover:border-zinc-600'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono font-bold text-zinc-300 truncate pr-4">
                      {audit.support_tickets?.subject || 'Unknown Subject'}
                    </span>
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[10px] font-black uppercase tracking-wider whitespace-nowrap">
                      Score: {audit.confidence_score}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 font-mono line-clamp-3">
                    {audit.support_tickets?.description || 'No description provided.'}
                  </p>
                </div>
              ))}
            </div>

            {/* Right Pane: Interactive Editing Workspace */}
            {selectedAuditId ? (
              <div className="flex flex-col gap-4 bg-zinc-950/60 border border-zinc-800 p-5 rounded-2xl">
                <label className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">Refine AI Knowledge Base Injection</label>
                <textarea
                  className="w-full min-h-[140px] bg-zinc-900/50 border border-zinc-800 text-zinc-300 font-sans p-3 rounded-xl focus:outline-none focus:border-cyan-500/50 text-sm resize-y"
                  value={selectedAuditText}
                  onChange={(e) => setSelectedAuditText(e.target.value)}
                />
                <button
                  onClick={() => handlePublishToVectorStore(selectedAuditId)}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-black text-xs font-mono font-black tracking-widest rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all uppercase"
                >
                  Publish Curated Playbook
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center bg-zinc-950/40 border border-zinc-800/50 rounded-2xl p-6 text-zinc-600 text-sm font-mono text-center">
                Select a pending audit from the left pane to curate its memory injection.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create Rule Form */}
        <div className="lg:col-span-1">
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-xl sticky top-24">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <FiPlus className="text-fuchsia-400" /> Add New Rule
            </h2>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Title</label>
                <input
                  type="text"
                  value={newRule.title}
                  onChange={(e) => setNewRule({...newRule, title: e.target.value})}
                  className="w-full bg-black/50 border border-zinc-800 focus:border-fuchsia-500/50 rounded-xl py-3 px-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                  placeholder="e.g., Refund Policy"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Category</label>
                <select
                  value={newRule.category}
                  onChange={(e) => setNewRule({...newRule, category: e.target.value})}
                  className="w-full bg-black/50 border border-zinc-800 focus:border-fuchsia-500/50 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 transition-all appearance-none"
                >
                  <option value="General">General</option>
                  <option value="Billing">Billing & Finance</option>
                  <option value="Technical">Technical Support</option>
                  <option value="Legal">Legal & Compliance</option>
                  <option value="Security">Security</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Rule Content (SOP)</label>
                <textarea
                  value={newRule.content}
                  onChange={(e) => setNewRule({...newRule, content: e.target.value})}
                  rows={6}
                  className="w-full bg-black/50 border border-zinc-800 focus:border-fuchsia-500/50 rounded-xl py-3 px-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 transition-all resize-none font-mono text-sm"
                  placeholder="Define the standard operating procedure or rule details here..."
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !newRule.title || !newRule.content}
                className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-bold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <FiSave /> Save to Memory
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Rules List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
              <FiSearch />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/50 border border-zinc-800 focus:border-fuchsia-500/50 rounded-xl py-4 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
              placeholder="Search memory banks..."
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-zinc-800 border-t-fuchsia-500 rounded-full animate-spin" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-12 text-center flex flex-col items-center">
              <FiAlertCircle className="text-4xl text-zinc-600 mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No memory banks found</h3>
              <p className="text-zinc-400 max-w-sm">
                Add your first operational rule or SOP to help Onyx learn how to handle support requests.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredEntries.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />

                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-white">{entry.title}</h3>
                        {entry.metadata?.category && (
                          <span className="px-2.5 py-0.5 rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
                            {entry.metadata.category}
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 text-sm whitespace-pre-wrap font-mono line-clamp-3 group-hover:line-clamp-none transition-all">
                        {entry.content}
                      </p>
                      <div className="mt-4 flex items-center gap-4 text-xs text-zinc-600 font-mono">
                        <span>ID: {entry.id.split('-')[0]}</span>
                        <span>Added: {new Date(entry.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteRule(entry.id)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                      title="Delete Rule"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
