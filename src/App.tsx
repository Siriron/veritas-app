import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import HomePage from "@/pages/HomePage";
import CreateDisputePage from "@/pages/CreateDisputePage";
import DisputeDetailPage from "@/pages/DisputeDetailPage";
import ProfilePage from "@/pages/ProfilePage";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreateDisputePage />} />
            <Route path="/dispute/:id" element={<DisputeDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </main>
        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 10, color: "var(--fg-subtle)", letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            Veritas · GenLayer StudioNet · Priority-dispute resolution
          </span>
        </footer>
      </div>
    </BrowserRouter>
  );
}
