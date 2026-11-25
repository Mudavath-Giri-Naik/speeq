/** Cookie attributes shared by login and logout. */
export function adminCookie(clear = false) {
  const secure = process.env.NODE_ENV === "production";
  return {
    name: secure ? "__Host-speeq_admin" : "speeq_admin",
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: clear ? 0 : 28800,
    secure,
  };
}
