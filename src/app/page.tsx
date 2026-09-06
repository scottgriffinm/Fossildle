import { FossildleApp } from "@/components/FossildleApp";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <main className="shell">
      <SiteHeader current="play" />
      <FossildleApp />
    </main>
  );
}
