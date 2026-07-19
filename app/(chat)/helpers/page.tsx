import { Suspense } from "react";
import HelpersPage from "@/components/helpers/helpers-page";

export default function Page() {
  return (
    <Suspense>
      <HelpersPage />
    </Suspense>
  );
}
