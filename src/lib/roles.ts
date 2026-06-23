export type AppRole = "admin" | "editor" | "viewer";

/** Primary administrator — role cannot be changed or removed via allowlist. */
export const SUPERUSER_EMAIL = "a.dumke@global-tickets.com";

/** Legacy DB value — treated as viewer everywhere in the app. */
export type DbAppRole = AppRole | "member";

export const INVITE_ROLES: AppRole[] = ["viewer", "editor", "admin"];

export const ROLE_LABELS: Record<AppRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
};

export function normalizeRole(role: string | null | undefined): AppRole {
  if (role === "admin" || role === "editor") return role;
  return "viewer";
}

export function pickPrimaryRole(roles: { role: string }[]): AppRole {
  const normalized = roles.map((r) => normalizeRole(r.role));
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("editor")) return "editor";
  return "viewer";
}

export function isAdminRole(role: AppRole): boolean {
  return role === "admin";
}

export function canEditContent(role: AppRole): boolean {
  return role === "admin" || role === "editor";
}

export function isSuperuserEmail(email: string): boolean {
  return email.trim().toLowerCase() === SUPERUSER_EMAIL;
}
