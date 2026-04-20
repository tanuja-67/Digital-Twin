import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout.jsx";
import { Analysis } from "./pages/Dashboard.jsx";
import { MapPage } from "./pages/MapPage.jsx";
import { InterventionPage } from "./pages/InterventionPage.jsx";
import { StationTrendPage } from "./pages/StationTrendPage.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Analysis />} />
        <Route path="/station-trend" element={<StationTrendPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/intervention" element={<InterventionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
