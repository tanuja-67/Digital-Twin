import { Link } from "react-router-dom";

const SDG_LOGO_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTHB8sDriPtzTFPNsiMPSlFXapZdqc_MZEBUA&s";
const COLLEGE_LOGO_URL = "https://media.licdn.com/dms/image/v2/D560BAQFPgYBnm3XUZg/company-logo_200_200/B56ZtGiy67K4AI-/0/1766415085896/vnrvjiethyd_logo?e=2147483647&v=beta&t=yqsl41tWptE6pYcE-z3At5gIaufdfTa3EuEw7uyenc0";

export function Layout({ children }) {
  return (
    <div style={{ maxWidth: 1620, margin: "0 auto", padding: "1.25rem 1.4rem 2rem" }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(100px, 130px) minmax(0, 1240px) minmax(100px, 130px)",
          alignItems: "stretch",
          justifyContent: "center",
          columnGap: "1rem",
          marginBottom: "1.2rem",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", justifyContent: "flex-start" }}>
          <img
            src={COLLEGE_LOGO_URL}
            alt="College logo"
            style={{
              width: "auto",
              height: "100%",
              maxWidth: 130,
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        <div style={{ width: "100%", minWidth: 0 }}>
          <header
            style={{
              background: "#132f4c",
              border: "1px solid #204768",
              borderRadius: 14,
              padding: "0.95rem 1rem",
              boxShadow: "0 10px 22px rgba(2, 8, 20, 0.35)",
              minWidth: 300,
            }}
          >
            <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600, color: "#f1f5ff" }}>
              Digital Twin For Hyderabad Air Quality
            </h1>
            <p style={{ margin: "0.35rem 0 0", color: "#b7c9df", fontSize: "0.95rem" }}>
              Live readings and twin projections from the API
            </p>
            <nav style={{ marginTop: "0.8rem", display: "flex", gap: "0.65rem", fontSize: "0.9rem", flexWrap: "wrap" }}>
              <Link style={navLinkStyle} to="/">Live Data</Link>
              <Link style={navLinkStyle} to="/station-trend">Trends</Link>
              <Link style={navLinkStyle} to="/map">Map</Link>
              <Link style={navLinkStyle} to="/intervention">Intervention</Link>
            </nav>
          </header>
        </div>

        <div style={{ display: "flex", alignItems: "stretch", justifyContent: "flex-end" }}>
          <img
            src={SDG_LOGO_URL}
            alt="SDG logo"
            style={{
              width: "auto",
              height: "100%",
              maxWidth: 130,
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
      </section>

      <main style={{ maxWidth: 1240, margin: "0 auto" }}>{children}</main>
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
