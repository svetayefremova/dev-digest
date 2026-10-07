/* /showcase — renders every src/vendor/ui component (both themes), per the
   contract documented in src/vendor/ui/README.md's "Showcase" section. The
   smoke test (src/test/smoke.test.tsx) mounts the same <Gallery/>, so a
   broken export/render fails CI independent of this route; this page is what
   makes that gallery something a human can actually browse. */
import { Gallery } from "../../components/showcase";

export default function ShowcasePage() {
  return <Gallery />;
}
