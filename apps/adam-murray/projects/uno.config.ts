import { defineConfig, presetUno, presetAttributify, presetTypography } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetTypography(),
  ],
  // Add custom rules or overrides here if needed
  theme: {
    colors: {
      // Define custom colors if necessary
    }
  }
});

