import Image from "next/image";
import type { ReactNode } from "react";
import { pl } from "@/lib/i18n/pl";

type AppHeaderProps = {
  /** Optional controls shown at the right edge (e.g. "Nowe zgłoszenie"). */
  actions?: ReactNode;
};

// Logo asset is 221x62; rendered about 128px wide (design-guidelines: Header).
const LOGO_WIDTH = 128;
const LOGO_HEIGHT = 36;

export function AppHeader({ actions }: AppHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <Image
          src="/logo.png"
          alt="Code10"
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          preload
          className="h-auto w-[128px] shrink-0"
        />
        <h1 className="min-w-0 flex-1 text-lg leading-tight font-semibold text-foreground sm:text-xl">
          {pl.form.title}
        </h1>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
