import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function Scene6_Outro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(closest-side at 50% 50%, rgba(250,248,255,0.95), rgba(250,248,255,0.6) 55%, rgba(250,248,255,0) 75%)',
        }}
      />
      <motion.div
        className="relative z-10 flex flex-col items-center text-center"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <motion.div
          className="w-[140px] h-[140px] rounded-[32px] shadow-2xl overflow-hidden mb-8"
          style={{ boxShadow: '0 25px 50px -12px rgba(124, 58, 237, 0.4)' }}
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.1 }}
        >
          <img
            src={`${import.meta.env.BASE_URL}screens/app-icon.png`}
            className="w-full h-full object-cover"
          />
        </motion.div>

        <h1 className="text-[5.5vw] font-black leading-none text-[var(--color-text-primary)] tracking-tight">
          Receipt Tracker
        </h1>

        <motion.p
          className="text-[2.2vw] font-semibold text-[var(--color-text-secondary)] mt-4"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          Scan smarter. Spend less.
        </motion.p>

        <motion.div
          className="mt-10 flex items-center gap-3 px-10 py-5 rounded-full text-[var(--color-text-inverse)] font-bold text-[2vw]"
          style={{ background: 'var(--color-primary)', boxShadow: '0 20px 40px -10px rgba(124, 58, 237, 0.5)' }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        >
          <span className="text-[2.4vw]">☕</span>
          Support us on Ko-fi
        </motion.div>

        <motion.p
          className="text-[1.6vw] font-medium text-[var(--color-text-secondary)] mt-6"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          Try it free — and help keep it growing.
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
