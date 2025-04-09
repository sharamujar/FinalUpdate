import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
        serif: ['Merriweather', 'serif'],
      },
      colors: {
        'bg-light-brown': '#BF5906',
        'bg-brown': '#6A422D',
        'bg-yellow': '#E8D56F',
        'bg-white': '#FAFBFC',
        'border-gray': '#9F9F9F',
        'hover-light-brown': '#EE710B',
        'secondary-red': '#db3223',
      },
    },
  },
  plugins: [],
} satisfies Config;
