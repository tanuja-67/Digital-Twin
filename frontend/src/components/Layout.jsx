import { NavLink } from "react-router-dom";

const SDG_LOGO_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTHB8sDriPtzTFPNsiMPSlFXapZdqc_MZEBUA&s";
const COLLEGE_LOGO_URL = "https://media.licdn.com/dms/image/v2/D560BAQFPgYBnm3XUZg/company-logo_200_200/B56ZtGiy67K4AI-/0/1766415085896/vnrvjiethyd_logo?e=2147483647&v=beta&t=yqsl41tWptE6pYcE-z3At5gIaufdfTa3EuEw7uyenc0";

export function Layout({ children }) {
  return (
    <div className="app-shell">
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
            className="brand-logo"
          />
        </div>

        <div style={{ width: "100%", minWidth: 0 }}>
          <header className="header-shell fade-up">
            <h1 className="hero-title">
              Digital Twin For Hyderabad Air Quality
            </h1>
            <p className="hero-subtitle">
              Live readings and twin projections from the API
            </p>
            <nav className="nav-row">
              <NavLink className={navLinkClass} to="/" end>Live Data</NavLink>
              <NavLink className={navLinkClass} to="/station-trend">Trends</NavLink>
              <NavLink className={navLinkClass} to="/map">Map</NavLink>
              <NavLink className={navLinkClass} to="/intervention">Intervention</NavLink>
            </nav>
          </header>
        </div>

        <div style={{ display: "flex", alignItems: "stretch", justifyContent: "flex-end" }}>
          <img
            src={SDG_LOGO_URL}
            alt="SDG logo"
            className="brand-logo"
          />
        </div>
      </section>

      <main style={{ maxWidth: 1240, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

function navLinkClass({ isActive }) {
  return `nav-chip ${isActive ? "nav-chip--active" : ""}`;
}
