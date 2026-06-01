const base = import.meta.env.BASE_URL;

export default function ShoppingList() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg font-body">
      <div className="absolute -top-[20vh] -left-[8vw] w-[40vw] h-[40vw] rounded-full bg-primary/12 blur-[120px]" />

      <div className="relative z-10 h-full w-full flex items-center">
        <div className="w-[54%] pl-[7vw] pr-[3vw]">
          <div className="inline-flex items-center rounded-full bg-accent-soft px-[1.6vw] py-[1.1vh] w-fit">
            <span className="text-[1.5vw] font-bold tracking-[0.24em] uppercase text-primary-deep">
              04 — Smart shopping list
            </span>
          </div>

          <h2 className="mt-[3.5vh] font-display font-extrabold text-ink text-[4.4vw] leading-[1.0] tracking-tight text-balance">
            A shopping list that builds itself.
          </h2>

          <p className="mt-[3vh] text-muted text-[2vw] leading-relaxed max-w-[40vw] text-pretty">
            No more starting from a blank page. The list comes straight from what
            you actually buy.
          </p>

          <div className="mt-[5vh] flex flex-col gap-[3vh]">
            <div className="flex items-start gap-[1.4vw]">
              <span className="mt-[0.6vh] w-[0.8vw] h-[0.8vw] rounded-full bg-primary shrink-0" />
              <p className="text-ink text-[2vw] leading-snug">
                Auto-populated from your scans, split into Regulars and one-offs.
              </p>
            </div>
            <div className="flex items-start gap-[1.4vw]">
              <span className="mt-[0.6vh] w-[0.8vw] h-[0.8vw] rounded-full bg-primary shrink-0" />
              <p className="text-ink text-[2vw] leading-snug">
                Shows the lowest price and best store for every item, with savings
                in <span className="text-save font-bold">green</span>.
              </p>
            </div>
            <div className="flex items-start gap-[1.4vw]">
              <span className="mt-[0.6vh] w-[0.8vw] h-[0.8vw] rounded-full bg-primary shrink-0" />
              <p className="text-ink text-[2vw] leading-snug">
                Export a clean, store-by-store PDF for the trip.
              </p>
            </div>
          </div>
        </div>

        <div className="w-[46%] h-full flex items-center justify-center pr-[4vw]">
          <div className="rounded-[4vh] bg-ink p-[0.9vh] shadow-[0_5vh_11vh_-3vh_rgba(124,58,237,0.5)] -rotate-[3deg]">
            <img
              src={`${base}screens/shopping.jpg`}
              crossOrigin="anonymous"
              className="rounded-[3.3vh] h-[78vh] w-auto block"
              alt="Smart shopping list screen"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
