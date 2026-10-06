import type { Config } from "tailwindcss";

// Tokens read directly off designs/Bar App.dc.html (inline styles) — see
// docs/ARCHITECTURE.md "Design reference". The prototype governs the first
// build of a screen; after that this file is the source of truth.
const ACCENT = "#ee5a24";
const INK = "#1b1e23";
const alpha = (hex: string, opacity: number) =>
  `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},${opacity})`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Regel (T12, #132): witte tekst staat op `active` (rust, 4.83:1) en
        // `pressed` (hover en ingedrukt, 5.61:1) — de hover wordt dus
        // donkerder. Donkere tekst (`text-rail`) staat op DEFAULT en `hover`
        // (5.19 en 6.03:1; `hover` is bewust lichter). DEFAULT (#ee5a24)
        // haalt met wit maar 3.42:1 en `hover` 2.95:1: wit nooit op die twee,
        // ook niet als hoverkleur. De gedeelde klassen staan in
        // src/components/knopStijlen.ts (KNOP_ACCENT_WIT, KNOP_ACCENT_DONKER).
        // test/accentContrast.test.ts rekent rust-, hover-, active- en
        // focus-paren door over alle klasse-literals in src/. Het oude
        // #d94d1a-testje blijft als negatieve bewaking.
        accent: {
          DEFAULT: ACCENT,
          hover: "#f1703f",
          active: "#c9451a",
          // Hover en ingedrukt voor witte-tekst-knoppen: 5.61:1 met wit.
          pressed: "#b93d15",
          // Zachte accent-ondergrond ("+"-knoppen, aantal-pillen, gekozen
          // rij) — altijd met `text-danger`/`text-accent-active` erop, nooit
          // met accent.DEFAULT als tekstkleur (te weinig contrast).
          soft: "#fff2ec",
        },
        ink: INK,
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
          // Donkerder secundair grijs uit het prototype (chips, pil-labels):
          // 6.6:1 op wit.
          strong: "#5c5952",
        },
        // Ondergrond van gesegmenteerde knoppen (galerij/lijst e.d.) en
        // uitgeschakelde primaire knoppen in het prototype.
        track: "#f2ece4",
        // The dark login screen (dienst starten, issue #6) — prototype's
        // "noLogin" screen background family, distinct from the light
        // canvas/ink pair the rest of the app uses.
        rail: {
          DEFAULT: "#16181c",
          card: "#1e2127",
          hover: "#23262d",
          "key-hover": "#262a31",
          bright: "#e8eaed",
          border: "#2b2f37",
          // #7d838c (prototype) is only 4.65:1 on rail — fine at larger
          // sizes but no margin for error at 12-13px body text. Used
          // #8c8f96 instead (5.49:1) for actual body/label text.
          muted: "#8c8f96",
          // Lichtgrijs uit het prototype (#cfd3d8): namen onder een avatar,
          // hover-tekst, de bardienst-rolbadge — 8:1 op rail-border.
          light: "#cfd3d8",
          error: "#ff7c4a",
        },
        // Prototype's #157f4a haalt 5.04:1 op wit maar maar 4.29:1 op
        // `track` (de SALDO-badge in het Logboek, #88) — donkerder gezet tot
        // 4.96:1 op track, zelfde tint. Zie test/accentContrast.test.ts.
        success: "#127443",
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
          "var(--font-manrope)",
          "-apple-system",
          "BlinkMacSystemFont",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "16px",
        control: "12px",
      },
      fontSize: {
        "screen-title": "25px",
        "dialog-title": "19px",
        "section-title": "17px",
        "metadata": "12.5px",
        "detail": "13.5px",
      },
      backgroundImage: {
        "rail-glow": `radial-gradient(circle at 50% 0%,${alpha(ACCENT, 0.16)},transparent 60%)`,
      },
      boxShadow: {
        "brand": `0 10px 26px -6px ${alpha(ACCENT, 0.7)}`,
        "brand-compact": `0 6px 16px -4px ${alpha(ACCENT, 0.7)}`,
        "accent-chip": `0 6px 16px -8px ${alpha(ACCENT, 0.9)}`,
        "checkout": `0 12px 26px -12px ${alpha(ACCENT, 1)}`,
        "surface": `0 1px 2px ${alpha(INK, 0.03)}`,
        "surface-hover": `0 10px 24px -14px ${alpha(INK, 0.35)}`,
        "segment": `0 1px 2px ${alpha(INK, 0.10)},0 4px 12px -6px ${alpha(INK, 0.28)}`,
        "dropdown": `0 18px 40px -12px ${alpha(INK, 0.28)}`,
        "rail-dropdown": `0 22px 48px -16px rgba(0,0,0,0.7)`,
        "dialog": `0 30px 70px -20px rgba(0,0,0,0.55)`,
        "shift": `0 14px 34px -22px rgba(22,24,28,0.9)`,
        "menu": `0 16px 40px ${alpha(INK, 0.14)}`,
      },
      // Inschuiven van de portal-sheet (Overlay.tsx, `overlay: "sheet"`),
      // prototype designs/Lid App.dc.html → `abasSheet`. Alleen via
      // `motion-safe:`; globals.css zet animaties bij reduced motion
      // daarnaast op 0s.
      keyframes: {
        "sheet-in": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "sheet-in": "sheet-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
