import Link from "next/link";

export function SiteHeader({
  current,
  dateKey,
  guessesLeft,
  playing,
}: {
  current: "play" | "about";
  dateKey?: string;
  guessesLeft?: number;
  playing?: boolean;
}) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <strong>FOSSILDLE</strong>
        <span>Daily fossil</span>
      </Link>
      {dateKey && (
        <p className="game-meta" aria-live="polite">
          <span>{dateKey}</span>
          {playing ? (
            <span>
              {guessesLeft} left
            </span>
          ) : (
            <span>done</span>
          )}
        </p>
      )}
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
