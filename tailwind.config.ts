import type { Config } from "tailwindcss";

// Tokens read directly off designs/Bar App.dc.html (inline styles) — see
// docs/ARCHITECTURE.md "Design reference". The prototype governs the first
// build of a screen; after that this file is the source of truth.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Prototype's exact DEFAULT (#ee5a24) is 3.42:1 for white text at
        // 14px/bold (e.g. BezettingOverlay's "Klaar" button) — fails WCAG
        // AA (needs 4.5:1), caught by the check:a11y gate once a real CI
        // run could finally reach this button (docs/ARCHITECTURE.md →
        // "Local/CI device account"). Same fix pattern as `muted` below:
        // darken, same hue, until compliant — normal design-system
        // evolution per CLAUDE.md → Designbestanden, not a defect. Old
        // `active` (#c9451a, 4.83:1) becomes the new DEFAULT; hover/active
        // shift darker in step to keep the same lightest→darkest ordering.
        accent: {
          DEFAULT: "#c9451a",
          hover: "#b23d17",
          active: "#a03a15",
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
        // The dark login screen (dienst starten, issue #6) — prototype's
        // "noLogin" screen background family, distinct from the light
        // canvas/ink pair the rest of the app uses.
        rail: {
          DEFAULT: "#16181c",
          card: "#1e2127",
          border: "#2b2f37",
          // #7d838c (prototype) is only 4.65:1 on rail — fine at larger
          // sizes but no margin for error at 12-13px body text. Used
          // #8c8f96 instead (5.49:1) for actual body/label text.
          muted: "#8c8f96",
          error: "#ff7c4a",
        },
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
