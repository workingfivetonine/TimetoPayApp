import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene5_Catalog() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 5000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[10vw] z-10"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.2, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-1/2 flex flex-col justify-center pr-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <div className="inline-block px-4 py-2 bg-[var(--color-primary-light)]/20 text-[var(--color-primary)] font-bold rounded-full mb-4 text-[1.2vw]">
            Shared Price Catalog
          </div>
          <h2 className="text-[4vw] font-black leading-tight text-[var(--color-text-primary)]">
            See what <br />
            <span className="text-[var(--color-primary)]">others paid.</span>
          </h2>
          <motion.p
            className="text-[1.8vw] text-gray-500 mt-6 max-w-md"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            Browse real prices from shoppers near you — privacy-preserving, never who.
          </motion.p>
        </motion.div>
      </div>

      <div className="w-1/2 flex justify-center relative perspective-[1000px] h-[700px] items-center">
        <motion.div
          className="phone-frame w-[320px] h-[680px] z-20"
          initial={{ rotateY: 20, rotateX: 10, scale: 0.8, opacity: 0, y: 60 }}
          animate={{ rotateY: -10, rotateX: 5, scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
          <div className="phone-notch"></div>
          <img
            src={`${import.meta.env.BASE_URL}screens/catalog.jpg`}
            className="w-full h-full object-cover"
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
