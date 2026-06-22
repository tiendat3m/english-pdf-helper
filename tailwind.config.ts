import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: "#fffaf0",
        ink: "#25211b",
        sage: "#6c8f7d",
        coral: "#d46a5f",
        skysoft: "#d8edf5"
      },
      boxShadow: {
        paper: "0 18px 45px rgba(45, 38, 28, 0.12)",
        tool: "0 10px 25px rgba(35, 31, 26, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
