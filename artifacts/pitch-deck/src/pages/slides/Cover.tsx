const base = import.meta.env.BASE_URL;

export default function Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg font-body">
      <div className="absolute -top-[22vh] -right-[8vw] w-[46vw] h-[46vw] rounded-full bg-primary/15 blur-[120px]" />
      <div className="absolute -bottom-[26vh] -left-[10vw] w-[36vw] h-[36vw] rounded-full bg-accent/30 blur-[120px]" />

      <div className="relative z-10 h-full w-full flex items-center">
        <div className="w-[56%] pl-[7vw] pr-[3vw]">
          <div className="inline-flex items-center gap-[0.9vw] rounded-full bg-accent-soft px-[1.6vw] py-[1.1vh] w-fit">
            <span className="w-[0.7vw] h-[0.7vw] rounded-full bg-primary" />
            <span className="text-[1.5vw] font-bold tracking-[0.24em] uppercase text-primary-deep">
              Mobile · Consumer finance
            </span>
          </div>

          <h1 className="mt-[3.5vh] font-display font-extrabold text-ink text-[7vw] leading-[0.92] tracking-tight text-balance">
            TimetoPay
          </h1>

          <p className="mt-[3vh] font-display font-bold text-primary text-[2.9vw] leading-tight">
            Scan smarter. Spend less.
          </p>

          <p className="mt-[3vh] text-muted text-[2vw] leading-relaxed max-w-[35vw] text-pretty">
            The mobile app that scans your receipts with AI, tracks prices over
            time, and turns every shop into a smarter one.
          </p>
        </div>

        <div className="w-[44%] h-full flex items-center justify-center pr-[4vw]">
          <div className="rounded-[4vh] bg-ink p-[0.9vh] shadow-[0_5vh_11vh_-3vh_rgba(124,58,237,0.55)] rotate-[3deg]">
            <img
              src={`${base}screens/scan.jpg`}
              crossOrigin="anonymous"
              className="rounded-[3.3vh] h-[78vh] w-auto block"
              alt="TimetoPay scan screen"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
