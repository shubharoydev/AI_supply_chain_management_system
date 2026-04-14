import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

const variants = {
  success: {
    bg: 'bg-green-50',
    text: 'text-green-800',
    icon: <CheckCircle className="text-green-600" size={20} />,
    border: 'border-green-400'
  },
  error: {
    bg: 'bg-red-50',
    text: 'text-red-800',
    icon: <XCircle className="text-red-600" size={20} />,
    border: 'border-red-400'
  },
  warning: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    icon: <AlertCircle className="text-yellow-600" size={20} />,
    border: 'border-yellow-400'
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    icon: <Info className="text-blue-600" size={20} />,
    border: 'border-blue-400'
  }
};

export default function Alert({ variant = 'info', children, className = '', onClose }) {
  const style = variants[variant] || variants.info;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-4 relative ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0 mr-3">
          {style.icon}
        </div>
        <div className={`flex-1 ${style.text}`}>
          {children}
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="ml-auto text-gray-500 hover:text-gray-700"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}