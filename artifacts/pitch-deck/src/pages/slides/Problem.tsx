export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg font-body">
      <div className="absolute -top-[18vh] -right-[10vw] w-[40vw] h-[40vw] rounded-full bg-primary/10 blur-[120px]" />

      <div className="relative z-10 h-full w-full px-[7vw] py-[9vh] flex flex-col">
        <div className="inline-flex items-center rounded-full bg-accent-soft px-[1.6vw] py-[1.1vh] w-fit">
          <span className="text-[1.5vw] font-bold tracking-[0.24em] uppercase text-primary-deep">
            01 — The problem
          </span>
        </div>

        <h2 className="mt-[3.5vh] font-display font-extrabold text-ink text-[4.6vw] leading-[1.02] tracking-tight max-w-[72vw] text-balance">
          Prices creep up. Receipts pile up. Nobody's keeping track.
        </h2>

        <div className="mt-[8vh] grid grid-cols-3 gap-[4vw]">
          <div>
            <div className="h-[0.5vh] w-[3.5vw] bg-primary rounded-full" />
            <p className="mt-[2.5vh] font-display font-bold text-ink text-[2vw] leading-tight">
              Prices you can't see
            </p>
            <p className="mt-[1.6vh] text-muted text-[1.6vw] leading-relaxed text-pretty">
              Your usual store quietly raises the price and you'd never notice
              from week to week.
            </p>
          </div>

          <div>
            <div className="h-[0.5vh] w-[3.5vw] bg-primary rounded-full" />
            <p className="mt-[2.5vh] font-display font-bold text-ink text-[2vw] leading-tight">
              Clutter everywhere
            </p>
            <p className="mt-[1.6vh] text-muted text-[1.6vw] leading-relaxed text-pretty">
              Paper receipts get lost and digital ones stay buried deep in your
              inbox.
            </p>
          </div>

          <div>
            <div className="h-[0.5vh] w-[3.5vw] bg-primary rounded-full" />
            <p className="mt-[2.5vh] font-display font-bold text-ink text-[2vw] leading-tight">
              No price memory
            </p>
            <p className="mt-[1.6vh] text-muted text-[1.6vw] leading-relaxed text-pretty">
              You can't recall what you paid last time, or which store had it
              cheapest.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
