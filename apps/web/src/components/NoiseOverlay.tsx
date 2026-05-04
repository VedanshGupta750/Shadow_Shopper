/**
 * Fixed full-screen film-grain overlay.
 * Inline SVG (feTurbulence) base64-encoded as a CSS background-image.
 * mix-blend-mode: overlay + low opacity = subtle texture without affecting interaction.
 */
const NOISE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
const NOISE_DATA_URL = `url("data:image/svg+xml;base64,${typeof window === "undefined" ? "" : btoa(NOISE_SVG)}")`;

export function NoiseOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 mix-blend-overlay opacity-[0.02]"
      style={{
        backgroundImage: NOISE_DATA_URL,
        backgroundRepeat: "repeat",
        backgroundSize: "240px 240px",
      }}
    />
  );
}
