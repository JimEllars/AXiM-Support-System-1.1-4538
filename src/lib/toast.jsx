import toast from 'react-hot-toast';
import { FiCheckCircle, FiXCircle, FiAlertCircle, FiInfo } from 'react-icons/fi';
import React from 'react';

const toastStyles = {
  success: { background: '#18181b', color: '#10b981', border: '1px solid #047857' },
  error: { background: '#18181b', color: '#f43f5e', border: '1px solid #9f1239' },
  info: { background: '#18181b', color: '#22d3ee', border: '1px solid #0891b2' },
  warning: { background: '#18181b', color: '#f59e0b', border: '1px solid #d97706' },
};

export const showToast = {
  success: (message) => toast.success(message, { style: toastStyles.success, iconTheme: { primary: '#10b981', secondary: '#18181b' } }),
  error: (message) => toast.error(message, { style: toastStyles.error, iconTheme: { primary: '#f43f5e', secondary: '#18181b' } }),
  info: (message) => toast(message, { style: toastStyles.info, icon: <FiInfo className="text-cyan-400" /> }),
  warning: (message) => toast(message, { style: toastStyles.warning, icon: <FiAlertCircle className="text-amber-500" /> }),
};
