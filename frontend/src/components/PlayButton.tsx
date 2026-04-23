export function PlayButton() {
  return (
    <button
      type="button"
      aria-label="Start"
      className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 shadow-sm transition hover:bg-zinc-200"
    >
      <span className="ml-1 block h-0 w-0 border-y-[10px] border-y-transparent border-l-[16px] border-l-zinc-900" />
    </button>
  );
}
