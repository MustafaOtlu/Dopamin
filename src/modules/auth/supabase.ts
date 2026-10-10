import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";
export function isSupabase() {
  return process.env.AUTH_PROVIDER === "supabase";
}
export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AppError(503, "Kimlik doğrulama bağlantısı henüz yapılandırılmadı.");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (entries) => {
        for (const { name, value, options } of entries) jar.set(name, value, options);
      },
    },
  });
}
