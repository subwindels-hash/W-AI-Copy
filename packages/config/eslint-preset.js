/**
 * Shared ESLint preset placeholder. Session 1 keeps lint permissive;
 * Sessions 8/23 will tighten rules.
 */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  extends: ["eslint:recommended"],
  env: { node: true, es2022: true },
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "off",
  },
};
