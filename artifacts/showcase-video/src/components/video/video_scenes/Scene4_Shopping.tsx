import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene4_Shopping() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500), // show stores map behind
      setTimeout(() => setPhase(3), 6000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center px-[10vw] z-10"
      initial={{ opacity: 0, x: -100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.2, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-1/2 flex justify-center relative perspective-[1000px] h-[680px]">
        {/* Stores Background Phone */}
        <motion.div 
          className="phone-frame w-[300px] h-[640px] absolute left-[-2vw] top-[20px] opacity-60"
          initial={{ x: 0, opacity: 0, rotate: 0 }}
          animate={phase >= 2 ? { x: -60, opacity: 0.4, rotate: -10, z: -100 } : { x: 0, opacity: 0, rotate: 0, z: -100 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="phone-notch"></div>
          <img src={`${import.meta.env.BASE_URL}screens/stores.jpg`} className="w-full h-full object-cover" />
        </motion.div>

        {/* Shopping List Foreground Phone */}
        <motion.div 
          className="phone-frame w-[320px] h-[680px] absolute z-20"
          initial={{ rotateY: -20, rotateX: 10, scale: 0.8, opacity: 0 }}
          animate={{ rotateY: 10, rotateX: 5, scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="phone-notch"></div>
          <img src={`${import.meta.env.BASE_URL}screens/shopping.jpg`} className="w-full h-full object-cover" />
        </motion.div>
      </div>

      <div className="w-1/2 flex flex-col justify-center pl-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <div className="inline-block px-4 py-2 bg-[var(--color-primary-light)]/20 text-[var(--color-primary)] font-bold rounded-full mb-4 text-[1.2vw]">
            Smart Shopping List
          </div>
          <h2 className="text-[4vw] font-black leading-tight text-[var(--color-text-primary)]">
            Know exactly <br/>
            <span className="text-[var(--color-primary)]">where to shop.</span>
          </h2>
          <p className="text-[1.8vw] text-gray-500 mt-6 max-w-md">
            Auto-built from your scans. Shows the lowest price and best store for every item.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}