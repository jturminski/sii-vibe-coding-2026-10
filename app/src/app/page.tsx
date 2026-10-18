import { AppHeader } from "@/components/case/app-header";

export default function Home() {
  return (
    <>
      <AppHeader />
      {/* Placeholder container; replaced by CaseApp in T4.2. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6" />
    </>
  );
}
