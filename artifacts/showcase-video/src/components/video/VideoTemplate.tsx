import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { Scene1_Hook } from './video_scenes/Scene1_Hook';
import { Scene2_Scan } from './video_scenes/Scene2_Scan';
import { Scene3_Analytics } from './video_scenes/Scene3_Analytics';
import { Scene4_Shopping } from './video_scenes/Scene4_Shopping';
import { Scene5_Catalog } from './video_scenes/Scene5_Catalog';
import { Scene6_Outro } from './video_scenes/Scene6_Outro';

export const SCENE_DURATIONS = {
  hook: 5000,
  scan: 7000,
  analytics: 8000,
  shopping: 7000,
  catalog: 6000,
  outro: 7000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: Scene1_Hook,
  scan: Scene2_Scan,
  analytics: Scene3_Analytics,
  shopping: Scene4_Shopping,
  catalog: Scene5_Catalog,
  outro: Scene6_Outro,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

// Persistent midground elements mapped by scene index
const bgShapes = [
  { x: '10vw', y: '20vh', scale: 1, rotate: 0, opacity: 0.8 }, // hook
  { x: '60vw', y: '10vh', scale: 1.5, rotate: 45, opacity: 0.5 }, // scan
  { x: '-10vw', y: '60vh', scale: 2, rotate: 90, opacity: 0.6 }, // analytics
  { x: '70vw', y: '70vh', scale: 1.2, rotate: 135, opacity: 0.7 }, // shopping
  { x: '20vw', y: '80vh', scale: 1.8, rotate: 180, opacity: 0.4 }, // catalog
  { x: '50vw', y: '50vh', scale: 3, rotate: 225, opacity: 0.9 }, // outro
];

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: 'var(--color-bg-light)' }}
    >
      {/* Persistent Background */}
      <div className="absolute inset-0 z-0">
        <motion.div
          className="absolute w-[800px] h-[800px] rounded-full blur-[100px] opacity-40 mix-blend-multiply"
          style={{ background: 'var(--color-primary)' }}
          animate={{
            x: ['-20%', '50%', '-10%'],
            y: ['0%', '30%', '10%'],
            scale: [1, 1.2, 0.9],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full blur-[80px] opacity-30 mix-blend-multiply right-0 bottom-0"
          style={{ background: 'var(--color-accent)' }}
          animate={{
            x: ['20%', '-40%', '0%'],
            y: ['10%', '-20%', '20%'],
            scale: [0.8, 1.4, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Persistent grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        ></div>
      </div>

      {/* Persistent Midground Objects */}
      <motion.div
        className="absolute w-64 h-64 rounded-full border-4 border-[var(--color-primary-light)] opacity-20 z-0"
        animate={bgShapes[sceneIndex]}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute w-96 h-96 bg-[var(--color-primary)] rounded-[40px] opacity-5 z-0"
        animate={{
          x: ['80vw', '10vw', '50vw', '-20vw', '80vw', '50vw'][sceneIndex],
          y: ['-10vh', '50vh', '80vh', '20vh', '40vh', '50vh'][sceneIndex],
          rotate: [10, -20, 45, 90, 15, 45][sceneIndex],
          scale: [1, 1.2, 0.8, 1.5, 0.9, 2][sceneIndex],
        }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      />

      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
