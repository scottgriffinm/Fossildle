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
          {playing ? (
            <span className="guesses-left">{guessesLeft} left</span>
          ) : (
            <span className="guesses-left is-done">done</span>
          )}
          <span className="date-key">{dateKey}</span>
        </p>
      )}
      <nav className="nav-links" aria-label="Primary">
        {current !== "play" ? (
          <Link href="/">Play</Link>
        ) : null}
        <Link href="/about" aria-current={current === "about" ? "page" : undefined}>
          About
        </Link>
      </nav>
    </header>
  );
}
