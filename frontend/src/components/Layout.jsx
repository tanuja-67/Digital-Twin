import { Link } from "react-router-dom";

export function Layout({ children }) {
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "1.25rem 1.4rem 2rem" }}>
      <header
        style={{
          marginBottom: "1.2rem",
          background: "#132f4c",
          border: "1px solid #204768",
          borderRadius: 14,
          padding: "0.95rem 1rem",
          boxShadow: "0 10px 22px rgba(2, 8, 20, 0.35)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600, color: "#f1f5ff" }}>
          Digital Twin — Air Quality
        </h1>
        <p style={{ margin: "0.35rem 0 0", color: "#b7c9df", fontSize: "0.95rem" }}>
          Live readings and twin projections from the API
        </p>
        <nav style={{ marginTop: "0.8rem", display: "flex", gap: "0.65rem", fontSize: "0.9rem" }}>
          <Link style={navLinkStyle} to="/">Dashboard</Link>
          <Link style={navLinkStyle} to="/map">Map</Link>
          <Link style={navLinkStyle} to="/intervention">Intervention</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

const navLinkStyle = {
  background: "#0f2942",
  border: "1px solid #2f5d84",
  padding: "0.35rem 0.6rem",
  borderRadius: 999,
  color: "#d8e8ff",
};
