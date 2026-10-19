import { Suspense } from "react";
import { AppHeader } from "@/components/case/app-header";
import { CaseApp } from "@/components/case/case-app";

export default function Home() {
  return (
    <>
      <AppHeader />
      {/* CaseForm reads the current date (Europe/Warsaw "today"), so Cache Components must defer it
          to request time instead of prerendering it. */}
      <Suspense fallback={null}>
        <CaseApp />
      </Suspense>
    </>
  );
}
