with open('src/pages/MemoryHub.jsx', 'r') as f:
    content = f.read()

search_str = """  const handlePublishToVectorStore = async (auditId, updatedText) => {
    const previousAudits = [...pendingAudits];

    // Find the specific item before filtering to know its origin table
    const targetAudit = pendingAudits.find(a => a.id === auditId || a.ticket_id === auditId);

    setPendingAudits(prev => prev.filter(item => item.id !== auditId && item.ticket_id !== auditId));

    try {
      const { error: insertError } = await supabase
        .from('memory_banks')
        .insert([{ content: updatedText, is_curated: true, metadata: { source_telemetry_id: auditId } }]);

      if (insertError) throw insertError;

      // CRITICAL FIX: Direct the state resolution to the correct origin table
      if (targetAudit?.is_hitl_log) {
        const { error: hitlError } = await supabase.from('hitl_audit_logs').update({ status: 'executed' }).eq('id', targetAudit.id);
        if (hitlError) throw hitlError;
      } else {
        const { error: teleError } = await supabase.from('ticket_ai_telemetry').update({ is_curated: true }).eq('id', auditId);
        if (teleError) throw teleError;
      }

      showNotification({ type: 'success', message: 'KNOWLEDGE_BASE_VECTOR_INDEXED' });
      setSelectedAuditId(null);
      setSelectedAuditText('');
      fetchEntries();
    } catch (error) {
      console.error('Vector database ingestion failure, triggering safe UI rollback:', error);
      // Hard transactional recovery logic preventing loss of human-curated data strings
      setPendingAudits(previousAudits);
      showNotification({ type: 'error', message: 'DATABASE_TRANSACTION_ABORTED_ROLLBACK_TRIGGERED' });
    }
  };"""

replace_str = """  const handlePublishToVectorStore = async (auditId, updatedText) => {
    const previousAudits = [...pendingAudits];

    // Find the specific item before filtering to know its origin table
    const targetAudit = pendingAudits.find(a => a.id === auditId || a.ticket_id === auditId);

    setPendingAudits(prev => prev.filter(item => item.id !== auditId && item.ticket_id !== auditId));

    try {
      const { error: insertError } = await supabase
        .from('memory_banks')
        .insert([{ content: updatedText, is_curated: true, metadata: { source_telemetry_id: auditId } }]);

      if (insertError) throw insertError;

      // CRITICAL FIX: Direct the state resolution to the correct origin table
      if (targetAudit?.is_hitl_log) {
        const { error: hitlError } = await supabase.from('hitl_audit_logs').update({ status: 'executed' }).eq('id', targetAudit.id);
        if (hitlError) throw hitlError;
      } else {
        const { error: teleError } = await supabase.from('ticket_ai_telemetry').update({ is_curated: true }).eq('id', auditId);
        if (teleError) throw teleError;
      }

      showNotification({ type: 'success', message: 'KNOWLEDGE_BASE_VECTOR_INDEXED' });
      setSelectedAuditId(null);
      setSelectedAuditText('');
    } catch (error) {
      console.error('Vector database ingestion failure:', error);
      setPendingAudits(previousAudits);
      showNotification({ type: 'error', message: 'DATABASE_TRANSACTION_ABORTED_ROLLBACK_TRIGGERED' });
    }
  };"""

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open('src/pages/MemoryHub.jsx', 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Search string not found")
