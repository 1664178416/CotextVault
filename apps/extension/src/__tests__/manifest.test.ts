import { describe, expect, it } from "vitest";
import manifest from "../../public/manifest.json";
import { isMainWorldNetworkCaptureEnabled } from "../main-world/capture-policy";

const SUPPORTED_AI_HOSTS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://gemini.google.com/*",
  "https://claude.ai/*"
];
const collectManifestUrlPatterns = () => {
  const contentScriptMatches = manifest.content_scripts.flatMap((script) => script.matches);
  const webAccessibleMatches = manifest.web_accessible_resources.flatMap((resource) => resource.matches);

  return [...manifest.host_permissions, ...contentScriptMatches, ...webAccessibleMatches];
};

describe("extension manifest", () => {
  it("keeps extension permissions narrow and user initiated", () => {
    expect(manifest.permissions).toEqual(["activeTab", "sidePanel", "storage"]);
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("webRequest");
    expect(manifest.permissions).not.toContain("webRequestBlocking");
    expect(manifest.permissions).not.toContain("declarativeNetRequest");
  });

  it("keeps extension entry points explicit", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({
      service_worker: "background/service-worker.js",
      type: "module"
    });
    expect(manifest.side_panel).toEqual({ default_path: "sidepanel.html" });
    expect(manifest.action).toEqual({ default_title: "ContextVault" });
  });

  it("limits host access and injectable resources to supported AI web apps", () => {
    expect(manifest.host_permissions).toEqual(SUPPORTED_AI_HOSTS);

    expect(manifest.content_scripts).toHaveLength(1);
    const [contentScript] = manifest.content_scripts;
    expect(contentScript?.matches).toEqual(SUPPORTED_AI_HOSTS);
    expect(contentScript?.js).toEqual(["content/content-script.js"]);
    expect(contentScript?.run_at).toBe("document_start");

    expect(manifest.web_accessible_resources).toHaveLength(1);
    const [webAccessibleResource] = manifest.web_accessible_resources;
    expect(webAccessibleResource?.matches).toEqual(SUPPORTED_AI_HOSTS);
    expect(webAccessibleResource?.resources).toEqual(["main-world/interceptor.js"]);
  });

  it("rejects broad URL scopes in all extension match patterns", () => {
    const patterns = collectManifestUrlPatterns();

    expect(patterns).not.toContain("<all_urls>");
    expect(patterns).not.toContain("http://*/*");
    expect(patterns).not.toContain("https://*/*");

    for (const pattern of patterns) {
      expect(pattern).toMatch(/^https:\/\//);
      expect(SUPPORTED_AI_HOSTS).toContain(pattern);
    }
  });

  it("keeps the MAIN world interceptor inert until a non-forgeable opt-in path exists", () => {
    expect(isMainWorldNetworkCaptureEnabled()).toBe(false);
  });
});
