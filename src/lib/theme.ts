import { useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem("lh-theme") === "dark";
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
  }, []);
  const toggle = () => {
    const v = !dark;
    setDark(v);
    localStorage.setItem("lh-theme", v ? "dark" : "light");
    document.documentElement.classList.toggle("dark", v);
  };
  return { dark, toggle };
}
