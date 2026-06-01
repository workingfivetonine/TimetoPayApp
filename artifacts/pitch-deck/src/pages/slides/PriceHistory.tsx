const base = import.meta.env.BASE_URL;

export default function PriceHistory() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg font-body">
      <div className="absolute -bottom-[22vh] -right-[8vw] w-[40vw] h-[40vw] rounded-full bg-primary/12 blur-[120px]" />

      <div className="relative z-10 h-full w-full flex items-center">
        <div className="w-[46%] h-full flex items-center justify-center pl-[4vw]">
          <div className="rounded-[4vh] bg-ink p-[0.9vh] shadow-[0_5vh_11vh_-3vh_rgba(124,58,237,0.5)] rotate-[3deg]">
            <img
              src={`${base}screens/analytics.jpg`}
              crossOrigin="anonymous"
              className="rounded-[3.3vh] h-[78vh] w-auto block"
              alt="Spend analytics screen"
            />
          </div>
        </div>

        <div className="w-[54%] pr-[7vw] pl-[3vw]">
          <div className="inline-flex items-center rounded-full bg-accent-soft px-[1.6vw] py-[1.1vh] w-fit">
            <span className="text-[1.5vw] font-bold tracking-[0.24em] uppercase text-primary-deep">
              03 — Price history
            </span>
          </div>

          <h2 className="mt-[3.5vh] font-display font-extrabold text-ink text-[4.4vw] leading-[1.0] tracking-tight text-balance">
            Track every price over time.
          </h2>

          <p className="mt-[3vh] text-muted text-[2vw] leading-relaxed max-w-[40vw] text-pretty">
            Every scan feeds an analytics view that turns raw receipts into a
            clear picture of where your money goes.
          </p>

          <div className="mt-[5vh] flex flex-col gap-[3vh]">
            <div className="flex items-start gap-[1.4vw]">
              <span className="mt-[0.6vh] w-[0.8vw] h-[0.8vw] rounded-full bg-primary shrink-0" />
              <p className="text-ink text-[2vw] leading-snug">
                Weekly spend at a glance, with high and low weeks flagged
                automatically.
              </p>
            </div>
            <div className="flex items-start gap-[1.4vw]">
              <span className="mt-[0.6vh] w-[0.8vw] h-[0.8vw] rounded-full bg-primary shrink-0" />
              <p className="text-ink text-[2vw] leading-snug">
                Per-item price history — the lowest, average, and highest you've
                paid.
              </p>
            </div>
            <div className="flex items-start gap-[1.4vw]">
              <span className="mt-[0.6vh] w-[0.8vw] h-[0.8vw] rounded-full bg-primary shrink-0" />
              <p className="text-ink text-[2vw] leading-snug">
                Spot a rising trend before it quietly costs you more.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
