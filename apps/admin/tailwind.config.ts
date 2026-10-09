import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cherry: '#D62839',
        cream: '#FFF4E3',
        rose: '#F2B8C0',
        char: '#26211F',
        butter: '#F6D98B',
        sky: '#A9C9E8',
        line: '#E9D9C0',
      },
    },
  },
  plugins: [],
}

export default config
