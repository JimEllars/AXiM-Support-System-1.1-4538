import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiLock, FiMail, FiZap } from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';
import { useAuthStore } from '../store/useAuthStore';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    const { error } = await login(email, password);
    setIsLoading(false);

    if (!error) {
      toast.success('Access Granted');
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4">
      {/* Background elements for AXiM aesthetic */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fuchsia-900/20 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-cyan-400 mx-auto mb-6 shadow-[0_0_30px_rgba(34,211,238,0.15)] relative overflow-hidden group">
            <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <SafeIcon icon={FiZap} className="text-3xl" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">AXiM Support System</h1>
          <p className="text-zinc-400 mt-2 text-sm tracking-wide">ZERO-TRUST LOCKDOWN MODE ACTIVE</p>
        </div>

        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
          {/* Top border highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

          <form onSubmit={handleLogin} className="space-y-5 relative z-10">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">
                Operator Identity
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-cyan-400 transition-colors">
                  <SafeIcon icon={FiMail} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/50 border border-zinc-800 focus:border-cyan-500/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm"
                  placeholder="operator@axim.us.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 ml-1">
                Authorization Key
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-cyan-400 transition-colors">
                  <SafeIcon icon={FiLock} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/50 border border-zinc-800 focus:border-cyan-500/50 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm"
                  placeholder="••••••••••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-zinc-100 hover:bg-white text-black font-semibold rounded-xl py-3 mt-4 transition-all flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  Authenticate <SafeIcon icon={FiZap} className="text-sm" />
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
