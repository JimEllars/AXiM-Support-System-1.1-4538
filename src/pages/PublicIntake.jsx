import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiMail, FiTag, FiFileText, FiPaperclip, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

const workflowCategories = [
  { id: 'General Inquiry', label: 'General Inquiry' },
  { id: 'Technical Support', label: 'Technical Support' },
  { id: 'Billing', label: 'Billing & Financial' },
  { id: 'Legal', label: 'Legal & Compliance' }
];

export default function PublicIntake() {
  const [step, setStep] = useState(1);
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

  const ONYX_WORKER_URL = import.meta.env.VITE_ONYX_WORKER_URL || 'http://localhost:54321/functions/v1/onyx-bridge';

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
      if (selectedFile.size > 5 * 1024 * 1024) {
        setFileError('File size exceeds the 5MB limit.');
        setFile(null);
      } else {
        setFileError('');
        setFile(selectedFile);
      }
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      // Prepare JSON payload
      const payloadObj = {
        customer_name: formData.customer_name,
        customer_email: formData.customer_email,
        workflow_category: formData.workflow_category,
        subject: formData.subject,
        description: formData.description,
        source: 'website'
      };

      // Client-Side AES-256-GCM Encryption
      const secretKey = import.meta.env.VITE_ONYX_SECRET || 'PLACEHOLDER_SECRET_FOR_DEV_IF_NEEDED';
      const secretBuffer = new TextEncoder().encode(secretKey);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', secretBuffer);

      const key = await window.crypto.subtle.importKey(
        "raw",
        hashBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const payloadString = JSON.stringify(payloadObj);
      const dataBuffer = new TextEncoder().encode(payloadString);

      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        dataBuffer
      );

      const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
      const ivBase64 = btoa(String.fromCharCode(...iv));

      let bodyToSend;
      let headersToSend = {};

      if (file && file.size > 0) {
        // If there is an attachment, we must use FormData, but we can send the encrypted payload as fields
        const submitData = new FormData();
        submitData.append('encrypted_payload', encryptedBase64);
        submitData.append('iv', ivBase64);
        submitData.append('attachment', file);
        bodyToSend = submitData;
      } else {
        // If no attachment, send as pure JSON
        bodyToSend = JSON.stringify({
          encrypted_payload: encryptedBase64,
          iv: ivBase64
        });
        headersToSend = {
          'Content-Type': 'application/json'
        };
      }

      const response = await fetch(`${ONYX_WORKER_URL}/api/v1/webhooks/public-ingress`, {
        method: 'POST',
        headers: headersToSend,
        body: bodyToSend
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitResult({ success: true, ticket_id: data.ticket_id });
      } else {
        setSubmitResult({ success: false, error: data.error || 'Submission failed' });
      }
    } catch (error) {
      setSubmitResult({ success: false, error: 'Network error or server unreachable' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitResult?.success) {
    return (
      <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4">
         <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-[2rem] p-8 max-w-md w-full text-center shadow-2xl"
         >
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <FiCheckCircle className="text-4xl text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Request Submitted</h2>
            <p className="text-zinc-400 mb-6">
                Thank you. Onyx AI is currently reviewing your request.
            </p>
            <div className="bg-black/50 rounded-xl p-4 border border-zinc-800 mb-6">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Ticket ID</p>
                <p className="font-mono text-cyan-400 text-sm break-all">{submitResult.ticket_id}</p>
            </div>
         </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-900/20 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-xl w-full z-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white tracking-tight">AXiM Support Portal</h1>
          <p className="text-zinc-400 mt-2 text-sm tracking-wide">Submit a request to our engineering and support teams</p>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
            {[1, 2, 3].map((num) => (
                <div key={num} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${step >= num ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-zinc-800'}`} />
            ))}
        </div>

        <motion.div
            layout
            className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-[2rem] p-6 sm:p-8 shadow-2xl"
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
                                className="w-full bg-black/50 border border-zinc-800 focus:border-cyan-500/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
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
                                className="w-full bg-black/50 border border-zinc-800 focus:border-cyan-500/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
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
                                className="w-full bg-black/50 border border-zinc-800 focus:border-cyan-500/50 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all appearance-none"
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
                        className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl py-3 mt-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                                className="w-full bg-black/50 border border-zinc-800 focus:border-cyan-500/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
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
                                className="w-full bg-black/50 border border-zinc-800 focus:border-cyan-500/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all resize-none"
                                placeholder="Please provide as much detail as possible..."
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">Attachment (Optional, Max 5MB)</label>
                        <div className="relative">
                            <input
                                type="file"
                                id="file-upload"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <label
                                htmlFor="file-upload"
                                className={`flex items-center justify-center gap-2 w-full bg-black/50 border border-dashed rounded-xl py-4 cursor-pointer transition-all ${fileError ? 'border-red-500/50 text-red-400' : 'border-zinc-700 hover:border-cyan-500/50 text-zinc-400 hover:text-cyan-400'}`}
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
                            className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

                    <div className="space-y-4 bg-black/30 rounded-xl p-6 border border-zinc-800">
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
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="flex-1 bg-white hover:bg-zinc-200 text-black font-bold rounded-xl py-3 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                            ) : (
                                'Submit Request'
                            )}
                        </button>
                    </div>
                </motion.div>
            )}
           </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
