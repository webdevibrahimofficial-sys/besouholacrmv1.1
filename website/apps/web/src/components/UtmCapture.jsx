import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureUtmFromUrl } from '@/lib/utm';

const UtmCapture = () => {
  const location = useLocation();

  useEffect(() => {
    captureUtmFromUrl(location.search);
  }, [location.search]);

  return null;
};

export default UtmCapture;
