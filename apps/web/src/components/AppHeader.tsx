export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-bg/80 border-b border-border">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-accent text-lg leading-none" aria-hidden>
            ◐
          </span>
          <span className="font-display font-semibold tracking-tight">shadow shopper</span>
        </div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wider">
          azure · gpt-4o
        </div>
      </div>
    </header>
  );
}
