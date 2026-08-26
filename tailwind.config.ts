import type { Config } from "tailwindcss";

// Tokens read directly off designs/Bar App.dc.html (inline styles) — see
// docs/ARCHITECTURE.md "Design reference". The prototype governs the first
// build of a screen; after that this file is the source of truth.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#ee5a24",
          hover: "#d94d1a",
          active: "#c9451a",
        },
        ink: "#1b1e23",
        canvas: "#faf7f3",
        border: {
          DEFAULT: "#ede7df",
          subtle: "#f4efe8",
        },
        muted: {
          // Prototype's exact value (#8c867f) is 3.37:1 on `canvas` at
          // 14px/normal — fails WCAG AA (needs 4.5:1), caught by the
          // check:a11y gate (e2e/a11y.spec.ts). Darkened just enough to
          // clear it (4.79:1); same hue, normal design-system evolution
          // per CLAUDE.md → Designbestanden, not a defect.
          DEFAULT: "#736d66",
          light: "#aca69e",
        },
        rail: "#16181c",
        success: "#157f4a",
        warning: {
          bg: "#fdf2d6",
          fg: "#8a5a10",
        },
        danger: {
          DEFAULT: "#c2410c",
          bg: "#fff2ec",
        },
      },
      fontFamily: {
        sans: [
          "Manrope",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "16px",
        control: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
