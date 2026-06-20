import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const BackButton = ({ 
  label, 
  to, 
  onClick, 
  className = '', 
  ...props 
}) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar' || i18n.dir() === 'rtl';

  const handleClick = (e) => {
    if (onClick) {
      onClick(e);
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  const content = (
    <>
      <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors">
        {isRTL ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
      </div>
      <span className="font-semibold tracking-wide text-sm">
        {label || (isRTL ? 'عودة' : 'Back')}
      </span>
    </>
  );

  const baseClassName = `group inline-flex items-center gap-2.5 px-5 py-2.5 bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 mb-6 ${className}`;

  if (to && !onClick) {
    return (
      <Link
        to={to}
        className={baseClassName}
        {...props}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={baseClassName}
      {...props}
    >
      {content}
    </button>
  );
};

export default BackButton;
