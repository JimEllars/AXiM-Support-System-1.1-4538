import React, { useState, useEffect, useRef } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiMail, FiTag, FiFileText, FiPaperclip, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { getEdgeWorkerUrl } from '../lib/edgeWorkerUrl';
import toast from 'react-hot-toast';
import { trackEvent } from '../lib/telemetry';

import { sanitizePayload } from '../lib/sanitize';


const workflowCategories = [
  { id: 'General Inquiry', label: 'General Inquiry' },
  { id: 'Technical Support', label: 'Technical Support' },
  { id: 'Billing', label: 'Billing & Financial' },
  { id: 'Legal', label: 'Legal & Compliance' }
];

export default function PublicIntake() {
  useEffect(() => {
    window.setTurnstileToken = (token) => setTurnstileToken(token);
    return () => { delete window.setTurnstileToken; };
  }, []);


  const turnstileRef = useRef(null);
  const [step, setStep] = useState(1);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    workflow_category: 'General Inquiry',
    subject: '',
    description: '',
  });
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [ticketIdReceipt, setTicketIdReceipt] = useState(null);

  const handleNext = () => {
    if (step === 1 && (!formData.customer_name || !formData.customer_email)) {
      return; // Basic validation
    }
    if (step === 2 && (!formData.subject || !formData.description || fileError)) {
      return; // Basic validation
    }
    setStep(s => Math.min(s + 1, 3));
  };

  const handleBack = () => {
    setStep(s => Math.max(s - 1, 1));
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.log'];
      const extension = '.' + selectedFile.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        setFileError('Invalid file type. Allowed: .pdf, .png, .jpg, .txt, .log');
        setFile(null);
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setFileError('File size exceeds the 10MB limit.');
        setFile(null);
      } else {
        setFileError('');
        setFile(selectedFile);
      }
    }
  };

  const handleSubmit = async (e) => {
       if (e && e.preventDefault) e.preventDefault();
       if (!turnstileToken) {
         setSubmitResult({ error: 'Please complete the security check.' });
         return;
       }

       setIsSubmitting(true);
       setSubmitResult(null);

       try {
         const rawPayload = {
           subject: formData.subject,
           description: formData.description,
           customer_name: formData.customer_name,
           customer_email: formData.customer_email,
           workflow_category: formData.workflow_category,
           customer_id: formData.customer_email,
           source: 'website_support_form',
           urgency_flag: 'standard',
           cf_turnstile_response: turnstileToken
         };

         const sanitizedPayload = sanitizePayload(rawPayload);
         const workerUrl = getEdgeWorkerUrl();

         const response = await fetch(`${workerUrl}/api/v1/webhooks/public-ingress`, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'X-Onyx-Trace-ID': crypto.randomUUID(),
             'X-Axim-Client': 'web-intake'
           },
           body: JSON.stringify(sanitizedPayload)
         });

         if (!response.ok) {
           const errData = await response.json().catch(() => ({}));
           throw new Error(errData.error || `Server responded with HTTP ${response.status}`);
         }

         const resData = await response.json();
         setSubmitResult({
           success: true,
           ticketId: resData.ticket_id || resData.id,
           trackingCode: resData.tracking_code || resData.ticket_id?.slice(0, 8)
         });
         setStep(4);
       } catch (err) {
         console.error('Submission fault:', err);
         setSubmitResult({ error: err.message || 'Failed to submit support request.' });
         if (err.message.includes('TURNSTILE') || err.message.includes('verification failed')) {
           turnstileRef.current?.reset();
           setTurnstileToken('');
         }
       } finally {
         setIsSubmitting(false);
       }
     };

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-axim-slate flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel bg-axim-slate/80 border-emerald-500/30 p-8 rounded-3xl text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 text-2xl mb-4">
            ✓
          </div>
          <h2 className="text-2xl font-black text-emerald-400 tracking-tight">Request Ingested</h2>
          <p className="text-zinc-400 text-sm">Your support diagnostics have been securely routed to the active resolution swarm.</p>
          <div className="bg-axim-slate/50 border border-axim-border p-4 rounded-xl font-mono text-xs text-zinc-500">
            TRACE_ID: <span className="text-cyan-400">{ticketIdReceipt || 'PENDING_CONFIRMATION'}</span>
          </div>
          <button onClick={() => window.location.reload()} className="mt-6 w-full py-3 bg-axim-surface hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors">
            Submit Another Trace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-axim-slate flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-yellow-900/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-xl w-full z-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">AXiM Support Portal</h1>
          <p className="text-zinc-400 mt-2 text-sm tracking-wide">Submit a request to our engineering and support teams</p>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
            {[1, 2, 3].map((num) => (
                <div key={num} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${step >= num ? 'bg-axim-yellow text-black shadow-[0_0_10px_rgba(253,208,35,0.5)]' : 'bg-zinc-800'}`} />
            ))}
        </div>

        <motion.div
            layout
            className="bg-axim-surface/50 backdrop-blur-xl border border-axim-border rounded-[2rem] p-6 sm:p-8 shadow-2xl"
        >
           <AnimatePresence mode="wait">
            {step === 1 && (
                <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                >
                    <h2 className="text-xl font-semibold text-white mb-6">1. Identity & Category</h2>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Your Name</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                                <FiUser />
                            </div>
                            <input
                                type="text"
                                value={formData.customer_name}
                                onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                                className="w-full bg-axim-slate/50 border border-axim-border focus:border-axim-yellow/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-axim-yellow/50 transition-all"
                                placeholder="Jane Doe"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Your Email</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                                <FiMail />
                            </div>
                            <input
                                type="email"
                                value={formData.customer_email}
                                onChange={e => setFormData({ ...formData, customer_email: e.target.value })}
                                className="w-full bg-axim-slate/50 border border-axim-border focus:border-axim-yellow/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-axim-yellow/50 transition-all"
                                placeholder="jane@example.com"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Request Category</label>
                        <div className="relative">
                             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                                <FiTag />
                            </div>
                            <select
                                value={formData.workflow_category}
                                onChange={e => setFormData({ ...formData, workflow_category: e.target.value })}
                                className="w-full bg-axim-slate/50 border border-axim-border focus:border-axim-yellow/50 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-axim-yellow/50 transition-all appearance-none"
                            >
                                {workflowCategories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={handleNext}
                        disabled={!formData.customer_name || !formData.customer_email}
                        className="w-full bg-axim-yellow text-black hover:bg-yellow-400 text-black font-semibold rounded-xl py-3 mt-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Continue to Details
                    </button>
                </motion.div>
            )}

            {step === 2 && (
                <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                >
                    <h2 className="text-xl font-semibold text-white mb-6">2. Issue Details</h2>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Subject</label>
                        <div className="relative">
                             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                                <FiTag />
                            </div>
                            <input
                                type="text"
                                value={formData.subject}
                                onChange={e => setFormData({ ...formData, subject: e.target.value })}
                                className="w-full bg-axim-slate/50 border border-axim-border focus:border-axim-yellow/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-axim-yellow/50 transition-all"
                                placeholder="Brief summary of the issue"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Description</label>
                        <div className="relative">
                            <div className="absolute top-3 left-0 pl-4 flex items-center pointer-events-none text-zinc-500">
                                <FiFileText />
                            </div>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                rows={4}
                                className="w-full bg-axim-slate/50 border border-axim-border focus:border-axim-yellow/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-axim-yellow/50 transition-all resize-none"
                                placeholder="Please provide as much detail as possible..."
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Attachment (Optional, Max 10MB)</label>
                        <div className="relative">
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <label
                                htmlFor="file-upload"
                                className={`flex items-center justify-center gap-2 w-full bg-axim-slate/50 border border-dashed rounded-xl py-4 cursor-pointer transition-all ${fileError ? 'border-red-500/50 text-red-400' : 'border-zinc-700 hover:border-cyan-500/50 text-zinc-400 hover:text-cyan-400'}`}
                            >
                                <FiPaperclip />
                                <span className="text-sm">
                                    {file ? file.name : 'Click to select a file'}
                                </span>
                            </label>
                            {fileError && (
                                <p className="text-red-400 text-xs mt-2 ml-1 flex items-center gap-1">
                                    <FiAlertCircle /> {fileError}
                                </p>
                            )}
                            {file && !fileError && (
                              <div className="mt-3 px-4 py-2 bg-axim-yellow text-black/5 border border-cyan-500/20 rounded-xl flex items-center justify-between font-mono text-[10px] text-cyan-400">
                                <span className="uppercase tracking-wider">File Staged for Handshake Ingestion</span>
                                <span>{parseFloat(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                              </div>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleBack}
                            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl py-3 transition-all"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!formData.subject || !formData.description || fileError}
                            className="flex-1 bg-axim-yellow text-black hover:bg-yellow-400 text-black font-semibold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Review
                        </button>
                    </div>
                </motion.div>
            )}

            {step === 3 && (
                <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                >
                    <h2 className="text-xl font-semibold text-white mb-6">3. Review & Submit</h2>

                    {submitResult?.error && (
                         <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm flex items-start gap-3">
                            <FiAlertCircle className="mt-0.5 shrink-0" />
                            <p>{submitResult.error}</p>
                        </div>
                    )}

                    <div className="space-y-4 bg-axim-slate/30 rounded-xl p-6 border border-axim-border">
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">From</p>
                            <p className="text-white text-sm">{formData.customer_name} ({formData.customer_email})</p>
                        </div>
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Category</p>
                            <p className="text-cyan-400 text-sm font-medium">{formData.workflow_category}</p>
                        </div>
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Subject</p>
                            <p className="text-white text-sm">{formData.subject}</p>
                        </div>
                        {file && (
                            <div>
                                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Attachment</p>
                                <p className="text-zinc-300 text-sm flex items-center gap-1"><FiPaperclip /> {file.name}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleBack}
                            disabled={isSubmitting}
                            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl py-3 transition-all disabled:opacity-50"
                        >
                            Edit
                        </button>
                        <div className="flex-1 flex flex-col gap-4">
              <div className="mb-6 flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                  onSuccess={(token) => setTurnstileToken(token)}
                  options={{ theme: 'dark' }}
                />
              </div>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={isSubmitting || !turnstileToken}
                className="w-full flex items-center justify-center gap-2 bg-white hover:bg-zinc-200 text-black font-bold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  ) : (
                      'Submit Request'
                  )}
              </button>
            </div>
                    </div>
                </motion.div>
            )}
           </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
