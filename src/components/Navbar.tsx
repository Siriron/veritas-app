import { Link, useLocation } from "react-router-dom";
import { WalletButton } from "./WalletButton";
import { Shield } from "lucide-react";

const NAV_LINKS = [
  { to: "/", label: "Disputes" },
  { to: "/create", label: "File a Dispute" },
  { to: "/profile", label: "My Activity" },
];

export function Navbar() {
  const { pathname } = useLocation();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        borderBottom: "1px solid var(--border)",
        background: "rgba(7,9,15,0.92)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 24px",
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        {/* Logo */}
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Shield size={14} color="var(--accent)" />
          </div>
          <span
            style={{
              fontFamily: "Space Grotesk, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.12em",
              color: "var(--fg)",
              textTransform: "uppercase",
            }}
          >
            Veritas
          </span>
        </Link>

        {/* Nav links */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              style={{
                padding: "6px 12px",
                borderRadius: 4,
                fontSize: 13,
                fontFamily: "DM Sans, sans-serif",
                textDecoration: "none",
                color: pathname === to ? "var(--accent)" : "var(--fg-muted)",
                background: pathname === to ? "var(--accent-dim)" : "transparent",
                transition: "color 0.15s, background 0.15s",
                fontWeight: pathname === to ? 600 : 400,
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <WalletButton />
      </div>
    </header>
  );
}
