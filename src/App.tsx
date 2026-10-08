import { useEffect, useState } from "react";
import Storefront from "./components/Storefront";
import Admin from "./components/Admin";

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const f = () => setHash(window.location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return hash === "#/admin" ? <Admin /> : <Storefront />;
}