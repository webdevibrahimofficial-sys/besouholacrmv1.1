import React, { useEffect, useState } from 'react';
import useMousePosition from '@/hooks/useMousePosition';
import { motion } from 'framer-motion';

const CustomCursor = () => {
  const { x, y } = useMousePosition();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isFormField, setIsFormField] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const media = window.matchMedia('(pointer: fine)');
    const updateState = () => setIsEnabled(media.matches);
    updateState();

    media.addEventListener?.('change', updateState);

    const handlePointerMove = (event) => {
      const target = event.target;
      const isInteractiveField =
        target instanceof Element &&
        Boolean(target.closest('input, textarea, select, option, [contenteditable="true"]'));

      setIsFormField(isInteractiveField);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      media.removeEventListener?.('change', updateState);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  if (!isEnabled) {
    return null;
  }

  const variants = {
    default: {
      x: x - (isFormField ? 5 : 8),
      y: y - (isFormField ? 5 : 8),
      height: isFormField ? 10 : 16,
      width: isFormField ? 10 : 16,
      opacity: isFormField ? 0.38 : 0.78,
      backgroundColor: '#9372FF',
      mixBlendMode: isFormField ? 'normal' : 'difference',
    },
  };

  return (
    <motion.div
      variants={variants}
      animate="default"
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className="pointer-events-none fixed left-0 top-0 z-[9999] rounded-full"
      aria-hidden="true"
    />
  );
};

export default CustomCursor;
