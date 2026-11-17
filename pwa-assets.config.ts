import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates the PNG/ICO icons in public/ from the vector logo. Run `npm run icons`
// after changing public/favicon.svg; the outputs are committed.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0e6e5c' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0e6e5c' } },
  },
  images: ['public/favicon.svg'],
});
