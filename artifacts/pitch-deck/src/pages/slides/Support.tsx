const base = import.meta.env.BASE_URL;

export default function Support() {
  return (
    <div className="relative w-screen h-screen overflow-hidden font-body bg-[linear-gradient(135deg,#5b21b6_0%,#7c3aed_60%,#8b5cf6_100%)]">
      <div className="absolute -top-[20vh] -right-[6vw] w-[42vw] h-[42vw] rounded-full bg-white/10 blur-[120px]" />
      <div className="absolute -bottom-[24vh] -left-[8vw] w-[36vw] h-[36vw] rounded-full bg-white/10 blur-[120px]" />

      <div className="relative z-10 h-full w-full flex items-center">
        <div className="w-[60%] pl-[7vw] pr-[3vw]">
          <div className="inline-flex items-center rounded-full bg-white/15 px-[1.6vw] py-[1.1vh] w-fit">
            <span className="text-[1.5vw] font-bold tracking-[0.24em] uppercase text-white">
              06 — Support the build
            </span>
          </div>

          <h2 className="mt-[3.5vh] font-display font-extrabold text-white text-[5vw] leading-[0.98] tracking-tight text-balance">
            Help keep it growing.
          </h2>

          <p className="mt-[3.5vh] text-white/80 text-[2vw] leading-relaxed max-w-[42vw] text-pretty">
            Receipt Tracker is free to use. If it saves you money at the till,
            support development on Ko-fi — every coffee helps ship the next
            feature.
          </p>

          <div className="mt-[6vh] flex items-center gap-[2vw]">
            <span className="font-display font-bold text-white text-[1.9vw]">
              Support us on Ko-fi
            </span>
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-white/60" />
            <span className="font-display font-bold text-white text-[1.9vw]">
              Try it free
            </span>
          </div>
        </div>

        <div className="w-[40%] h-full flex flex-col items-center justify-center pr-[5vw]">
          <div className="rounded-[3.5vh] overflow-hidden w-[17vw] h-[17vw] shadow-[0_5vh_11vh_-3vh_rgba(0,0,0,0.45)]">
            <img
              src={`${base}screens/app-icon.png`}
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
              alt="Receipt Tracker app icon"
            />
          </div>
          <p className="mt-[3vh] font-display font-extrabold text-white text-[2.6vw] tracking-tight">
            Receipt Tracker
          </p>
          <p className="mt-[1vh] text-white/70 text-[1.5vw] font-bold">
            Scan smarter. Spend less.
          </p>
        </div>
      </div>
    </div>
  );
}
