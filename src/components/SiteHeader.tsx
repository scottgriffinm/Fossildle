import Link from "next/link";

export function SiteHeader({ current }: { current: "play" | "about" }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <strong>FOSSILDLE</strong>
        <span>A cabinet of daily genera</span>
      </Link>
      <nav className="nav-links" aria-label="Primary">
        <Link href="/" aria-current={current === "play" ? "page" : undefined}>
          Play
        </Link>
        <Link href="/about" aria-current={current === "about" ? "page" : undefined}>
          About
        </Link>
      </nav>
    </header>
  );
}
