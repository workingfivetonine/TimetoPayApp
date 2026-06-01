import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene2_Scan() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000), // swap to review
      setTimeout(() => setPhase(3), 3000), // text reveal
      setTimeout(() => setPhase(4), 6000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-between px-[10vw] z-10"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-1/2 flex flex-col justify-center">
        <motion.h2 
          className="text-[4vw] font-black leading-tight text-[var(--color-text-primary)]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          Point & Scan.
        </motion.h2>
        
        <motion.h2 
          className="text-[4vw] font-black leading-tight text-[var(--color-primary)]"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, type: 'spring' }}
        >
          AI does the rest.
        </motion.h2>
        
        <motion.p
          className="text-[1.8vw] text-gray-500 mt-6 max-w-md"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Instantly extracts every line item, price, and store. No manual entry needed.
        </motion.p>
      </div>

      <div className="w-1/2 flex justify-center relative perspective-[1000px]">
        <motion.div 
          className="phone-frame w-[320px] h-[680px]"
          initial={{ rotateY: 20, rotateX: 10, scale: 0.8, opacity: 0, y: 50 }}
          animate={{ rotateY: -10, rotateX: 5, scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="phone-notch"></div>
          
          <motion.img 
            src={`${import.meta.env.BASE_URL}screens/scan.jpg`}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 1 }}
            animate={phase >= 2 ? { opacity: 0, scale: 1.1 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          />
          
          <motion.img 
            src={`${import.meta.env.BASE_URL}screens/review-receipt.jpg`}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.5 }}
          />
          
          {/* Scanning laser line */}
          {phase < 2 && (
            <motion.div 
              className="absolute left-0 right-0 h-1 bg-green-400 shadow-[0_0_15px_#4ade80]"
              animate={{ top: ['10%', '90%', '10%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}