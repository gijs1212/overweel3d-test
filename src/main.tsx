import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "@fontsource/sora/400.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";

// Overweel3D gebruikt uitsluitend de lichte huisstijl. Verwijder ook een
// eventueel opgeslagen oude donkere voorkeur voordat de app wordt getekend.
document.documentElement.classList.remove("dark");
localStorage.setItem("theme", "light");

createRoot(document.getElementById("root")!).render(<App />);
