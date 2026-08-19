import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const AdminApp = lazy(() => import("./admin/AdminApp"));
const isAdminRoute = window.location.hash.startsWith("#admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#100d0c] text-white/60">Carregando…</div>}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
);
