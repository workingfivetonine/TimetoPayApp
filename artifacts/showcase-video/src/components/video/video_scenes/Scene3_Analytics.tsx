import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene3_Analytics() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600), // phone 1 floats up
      setTimeout(() => setPhase(2), 1200), // phone 2 floats up
      setTimeout(() => setPhase(3), 2000), // phone 3 + text
      setTimeout(() => setPhase(4), 7000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center pt-[10vh] z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-center mb-12">
        <motion.h2 
          className="text-[4vw] font-black leading-tight text-[var(--color-text-primary)]"
          initial={{ opacity: 0, y: -30 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: -30 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          Track Prices <span className="text-[var(--color-primary)]">Over Time</span>
        </motion.h2>
        <motion.p
          className="text-[1.8vw] text-gray-500 mt-2"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.2 }}
        >
          See your weekly spend and item price history
        </motion.p>
      </div>

      <div className="flex items-center justify-center gap-8 relative w-full h-[600px] perspective-[1200px]">
        {/* Left Phone: Receipts */}
        <motion.div 
          className="phone-frame w-[280px] h-[600px] absolute left-[15vw]"
          initial={{ y: 200, opacity: 0, rotateY: 20, z: -100 }}
          animate={phase >= 1 ? { y: 0, opacity: 1, rotateY: 25, z: -50 } : { y: 200, opacity: 0, rotateY: 20, z: -100 }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
        >
          <div className="phone-notch"></div>
          <img src={`${import.meta.env.BASE_URL}screens/receipts.jpg`} className="w-full h-full object-cover" />
        </motion.div>
        
        {/* Right Phone: Analytics */}
        <motion.div 
          className="phone-frame w-[280px] h-[600px] absolute right-[15vw]"
          initial={{ y: 200, opacity: 0, rotateY: -20, z: -100 }}
          animate={phase >= 2 ? { y: 0, opacity: 1, rotateY: -25, z: -50 } : { y: 200, opacity: 0, rotateY: -20, z: -100 }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
        >
          <div className="phone-notch"></div>
          <img src={`${import.meta.env.BASE_URL}screens/analytics.jpg`} className="w-full h-full object-cover" />
        </motion.div>

        {/* Center Phone: Receipt Detail */}
        <motion.div 
          className="phone-frame w-[320px] h-[680px] absolute z-20"
          initial={{ y: 300, opacity: 0, scale: 0.9 }}
          animate={phase >= 3 ? { y: -20, opacity: 1, scale: 1 } : { y: 300, opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
        >
          <div className="phone-notch"></div>
          <img src={`${import.meta.env.BASE_URL}screens/receipt-detail.jpg`} className="w-full h-full object-cover" />
        </motion.div>
      </div>
    </motion.div>
  );
}