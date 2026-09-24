import type { Config } from "tailwindcss";

// Tokens read directly off designs/Bar App.dc.html (inline styles) — see
// docs/ARCHITECTURE.md "Design reference". The prototype governs the first
// build of a screen; after that this file is the source of truth.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // DEFAULT (#ee5a24) is 5.19:1 for dark text (text-rail, e.g. the
        // "beheerder" role badge) but only 3.42:1 for white/light bold text
        // at small sizes (e.g. a "Klaar" button or an icon-sized checkmark)
        // — fails WCAG AA there (needs 4.5:1). One background shade can't
        // satisfy both a dark-text and a white-text use at once, so: keep
        // DEFAULT for dark-text-on-accent (unchanged, already compliant),
        // and use `active` (4.83:1) instead of DEFAULT for any white/light
        // bold text under ~18px — see BezettingOverlay.tsx for the pattern.
        // Caught by check:a11y once a real CI run could finally reach a
        // rendered button for the first time (docs/ARCHITECTURE.md →
        // "Local/CI device account").
        //
        // `hover` is the hover shade for dark-text-on-accent buttons
        // (`bg-accent text-rail hover:bg-accent-hover`) and is therefore
        // *lighter* than DEFAULT: 6.03:1 with text-rail. It used to be a
        // darker #d94d1a, which fails AA for dark text (4.25:1) and for white
        // text (4.18:1) alike (#66). White-text buttons don't use `hover`;
        // they sit on `active`. test/accentContrast.test.ts guards all of
        // these pairs.
        accent: {
          DEFAULT: "#ee5a24",
          hover: "#f1703f",
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
