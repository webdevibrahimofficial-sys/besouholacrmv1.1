import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { captureUtmFromUrl, getStoredUtmParams } from '@/lib/utm';

export const useUtmParams = () => {
  const location = useLocation();
  const [utm, setUtm] = useState(getStoredUtmParams);

  useEffect(() => {
    setUtm(captureUtmFromUrl(location.search));
  }, [location.search]);

  return utm;
};
