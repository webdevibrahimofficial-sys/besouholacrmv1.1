import React from 'react';
import { motion } from 'framer-motion';

const imageUrl = 'https://horizons-cdn.hostinger.com/e141138d-8b42-408c-96c1-7c817f53871e/71f6723b117af5fb7e36d829dfcd6b7f.jpg';

const layers = [
  {
    initial: { x: '-5%', y: '-5%', scale: 1.1 },
    animate: { x: '5%', y: '5%' },
    transition: { duration: 20, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
    opacity: 0.8,
  },
  {
    initial: { x: '5%', y: '5%', scale: 1.2 },
    animate: { x: '-5%', y: '-5%' },
    transition: { duration: 25, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
    opacity: 0.6,
  },
  {
    initial: { x: '0%', y: '10%', scale: 1.05 },
    animate: { x: '0%', y: '-10%' },
    transition: { duration: 30, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
    opacity: 1,
  },
];

const AnimatedHeroBackground = () => {
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      {layers.map((layer, index) => (
        <motion.div
          key={index}
          className="absolute inset-[-10%] w-[120%] h-[120%]"
          initial={layer.initial}
          animate={layer.animate}
          transition={layer.transition}
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: layer.opacity,
          }}
        />
      ))}
    </div>
  );
};

export default AnimatedHeroBackground;