"use client";

export function AdminLogoutButton() {
  async function logout() {
    await fetch("/admin/api/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }
  return <button className="button button-secondary" type="button" onClick={logout}>Log out</button>;
}
