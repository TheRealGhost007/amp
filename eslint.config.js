import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // The Cargo workspace's build output lands at the top-level `target/`
  // (this is a workspace, not a standalone `src-tauri` crate), not
  // `src-tauri/target` — that stale pattern never matched anything,
  // which stayed invisible until a `cargo tauri build` first generated
  // JS inside `target/release/build/.../tauri-codegen-assets/` for
  // ESLint to trip over.
  { ignores: ["dist", "target", "src-tauri/target"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
