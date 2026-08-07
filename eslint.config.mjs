import { defineConfig } from "eslint/config";
import v3xlint from "eslint-plugin-v3xlabs";

export default defineConfig([
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      ".changeset/**",
      "**/*.js",
      "**/.wxt/**",
      "**/.expo/**",
      "**/*.gen.*",
      "examples/react-native/**",
    ],
  },
  ...v3xlint.configs.recommended,
  // ...v3xlint.configs.react,
  {
    rules: {
      "unicorn/no-useless-undefined": "off",
      // "@stylistic/indent": ["error", 4],
      "@stylistic/type-named-tuple-spacing": "off",
      "import/no-default-export": "off",
      "unicorn/no-null": "off",
      "unicorn/consistent-function-scoping": "off",
    },
  },
]);
