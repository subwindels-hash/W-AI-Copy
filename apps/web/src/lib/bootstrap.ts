import { api } from "./api";
import { useAuthStore } from "@/store/auth";

/**
 * Bootstrap: if we have a token in storage, verify it by hitting /me
 * and populate normalized auth state. Runs once at app startup.
 */
export async function bootstrapAuth(): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  try {
    const me = await api<{
      id: string;
      email: string;
      role: "user" | "admin" | "super_admin";
      displayName: string | null;
      organization: { id: string; slug: string; name: string } | null;
      workspace: { id: string; slug: string; name: string } | null;
    }>("/me");
    useAuthStore.setState({
      user: {
        id: me.id,
        email: me.email,
        role: me.role,
        displayName: me.displayName ?? undefined,
        organizationId: me.organization?.id ?? null,
      },
    });
  } catch {
    useAuthStore.getState().clear();
  }
}
