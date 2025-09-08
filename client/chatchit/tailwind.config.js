// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          300: "#9ab5ff",
          400: "#7ea0ff",
          500: "#4f7cff",
          600: "#3e67e6",
        },
      },
      boxShadow: {
        'brand-glow': '0 8px 20px rgba(79,124,255,0.35)',
      },
    },
  },
  plugins: [],
};
