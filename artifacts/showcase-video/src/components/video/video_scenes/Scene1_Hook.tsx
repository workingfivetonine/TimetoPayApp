import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene1_Hook() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-[80%] max-w-5xl flex flex-col items-center">
        
        <motion.div
          className="text-center"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <motion.h1 
            className="text-[6vw] font-black leading-tight text-[var(--color-text-primary)] tracking-tight"
          >
            Messy receipts?
          </motion.h1>
        </motion.div>

        <motion.div
          className="text-center mt-4"
          initial={{ y: 30, opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { y: 0, opacity: 1, scale: 1 } : { y: 30, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <h1 className="text-[6vw] font-black leading-tight text-[var(--color-primary)] tracking-tight">
            Overpaying?
          </h1>
        </motion.div>
        
        <motion.div
          className="text-center mt-8 bg-white px-8 py-4 rounded-3xl shadow-xl border border-gray-100"
          initial={{ y: 40, opacity: 0, rotateX: 30 }}
          animate={phase >= 2 ? { y: 0, opacity: 1, rotateX: 0 } : { y: 40, opacity: 0, rotateX: 30 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          <p className="text-[2.5vw] font-semibold text-gray-600">
            You have no idea if prices went up.
          </p>
        </motion.div>

      </div>
    </motion.div>
  );
}