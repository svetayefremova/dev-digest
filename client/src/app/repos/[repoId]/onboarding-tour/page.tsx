/* Onboarding Tour — /repos/:repoId/onboarding-tour. Thin route entry; the view
   and everything it owns lives under _components/OnboardingTourView. */
"use client";

import { OnboardingTourView } from "./_components/OnboardingTourView";

export default function OnboardingTourPage() {
  return <OnboardingTourView />;
}
