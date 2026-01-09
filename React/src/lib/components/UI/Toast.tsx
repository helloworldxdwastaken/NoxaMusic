import React from 'react';
import { useUIStore, type Toast as ToastType } from '../../stores/ui';
import './Toast.css';

const ToastItem: React.FC<{ toast: ToastType }> = ({ toast }) => {
  const { dismissToast } = useUIStore();

  const icons: Record<string, string> = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle',
  };

  return (
    <div className={`toast toast-${toast.type}`} onClick={() => dismissToast(toast.id)}>
      <i className={`fas ${icons[toast.type]}`}></i>
      <span>{toast.message}</span>
      <button className="toast-close" onClick={() => dismissToast(toast.id)}>
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

export default ToastContainer;





