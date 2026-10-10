import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  enabled: true,
  exchange: vi.fn(),
  currentUser: vi.fn(),
  createGrant: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock("@/modules/auth/supabase", () => ({
  isSupabase: () => mocks.enabled,
  supabaseServer: async () => ({ auth: { exchangeCodeForSession: mocks.exchange } }),
}));
vi.mock("@/modules/auth/service", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/modules/auth/recovery", () => ({
  createRecoveryGrant: mocks.createGrant,
  setRecoveryCookie: mocks.setCookie,
}));
vi.mock("@/lib/db", () => ({ getDb: async () => ({}) }));
import { GET } from "@/app/auth/callback/route";
const userId = "10f55d44-9354-4d73-9b2e-112951bba60c";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.currentUser.mockResolvedValue({ id: userId });
  mocks.createGrant.mockResolvedValue("private-grant");
  mocks.exchange.mockResolvedValue({
    error: null,
    data: { user: { id: userId }, session: {}, redirectType: null },
  });
});
it("callback yönlendirmesi istek hostundan veya next parametresinden alınmaz", async () => {
  const response = await GET(
    new Request("https://evil.example/auth/callback?code=valid&next=https://evil.example"),
  );
  expect(response.headers.get("location")).toBe(
    `${new URL(process.env.APP_ORIGIN || "http://127.0.0.1:3000").origin}/app`,
  );
  expect(mocks.createGrant).not.toHaveBeenCalled();
});
it("next=/reset-password tek başına kurtarma yetkisi vermez", async () => {
  const response = await GET(
    new Request("http://127.0.0.1:3000/auth/callback?code=valid&next=/reset-password"),
  );
  expect(response.headers.get("location")).toContain("/app");
  expect(mocks.setCookie).not.toHaveBeenCalled();
});
it("yalnız sağlayıcının PKCE kurtarma sonucu kullanıcıya bağlı yetki oluşturur", async () => {
  mocks.exchange.mockResolvedValue({
    error: null,
    data: { user: { id: userId }, session: {}, redirectType: "recovery" },
  });
  const response = await GET(
    new Request("http://127.0.0.1:3000/auth/callback?code=valid&sb_flow_id=flow"),
  );
  expect(mocks.exchange).toHaveBeenCalledWith("valid", { flowId: "flow" });
  expect(mocks.createGrant).toHaveBeenCalledWith(expect.anything(), userId);
  expect(mocks.setCookie).toHaveBeenCalledWith("private-grant");
  expect(response.headers.get("location")).toContain("/reset-password");
});
it("hatalı kod ve uyuşmayan kullanıcıda kurtarma yetkisi çıkmaz", async () => {
  mocks.currentUser.mockResolvedValue({ id: "other" });
  const response = await GET(new Request("http://127.0.0.1:3000/auth/callback?code=invalid"));
  expect(response.headers.get("location")).toContain("/forgot-password?error=callback");
  expect(mocks.createGrant).not.toHaveBeenCalled();
  mocks.enabled = false;
  await GET(new Request("http://127.0.0.1:3000/auth/callback"));
  expect(mocks.setCookie).not.toHaveBeenCalled();
});
