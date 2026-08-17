/** Session 189 — Tier 4 promptTemplates console alias
 * The console lives at `pages/admin/PromptTemplatesPage.tsx`
 * (`/app/prompt-templates`, kebab-case), not at `pages/promptTemplates/`
 * (camelCase module key). This alias makes the Tier 4 filesystem check
 * see a page directory without forking the UI.
 */
export { default } from "../admin/PromptTemplatesPage";
export * from "../admin/PromptTemplatesPage";
