import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.dataset.theme = "dark";
      localStorage.setItem("kai-theme", "dark");
    } else {
      delete document.documentElement.dataset.theme;
      localStorage.setItem("kai-theme", "light");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "切换亮色" : "切换暗色"}
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontSize: 16
      }}
    >
      {dark ? "☀" : "◑"}
    </button>
  );
}
