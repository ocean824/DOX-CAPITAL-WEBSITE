import { useEffect } from "react";

// Approximate local sunset / sunrise by month (continental-US average).
// Dark theme runs from sunset until the next sunrise; light during the day.
const SUNSET = [17.3, 17.8, 19.2, 19.8, 20.3, 20.6, 20.5, 20.0, 19.2, 18.3, 16.8, 16.7];
const SUNRISE = [7.3, 6.8, 7.4, 6.5, 5.9, 5.6, 5.8, 6.3, 6.9, 7.4, 6.9, 7.2];

/** Automatically switches the brand between light (day) and dark (after sunset). */
export default function ThemeController() {
  useEffect(() => {
    const apply = () => {
      const d = new Date();
      const hour = d.getHours() + d.getMinutes() / 60;
      const m = d.getMonth();
      const isDark = hour >= SUNSET[m] || hour < SUNRISE[m];
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
    };
    apply();
    const id = setInterval(apply, 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
