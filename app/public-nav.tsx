export default function PublicNav() {
  return (
    <header className="nav">
      <a className="logo" href="/" style={{ textDecoration: "none", color: "inherit" }}>
        <i /><strong>StreamAds</strong>
      </a>
      <nav>
        <span className="muted small">Secure ad booking for streamers</span>
      </nav>
    </header>
  );
}
