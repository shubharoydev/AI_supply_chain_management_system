export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-5 w-5',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <div className={`${sizes[size]} animate-spin rounded-full border-4 border-t-indigo-600 border-gray-200`}></div>
    </div>
  );
}