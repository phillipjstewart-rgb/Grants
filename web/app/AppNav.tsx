import Link from "next/link";

const linkClass =
  "rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

export default function AppNav() {
  return (
    <nav
      className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <Link href="/" className="mr-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Grant OS
        </Link>
        <Link href="/" className={linkClass}>
          Desk
        </Link>
        <Link href="/tools/document-analyzer" className={linkClass}>
          Document analyzer
        </Link>
      </div>
    </nav>
  );
}
