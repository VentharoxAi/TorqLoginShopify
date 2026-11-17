import Image from "next/image";
import Link from "next/link";
import { AdminLogoutButton } from "@/app/components/admin-logout-button";
import type { StaffIdentity } from "@/lib/staff-auth";

export function AdminHeader({ staff }: { staff: StaffIdentity }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/admin">
        <Image src="/torq-logo.jpg" width={52} height={52} alt="TORQ Bearings logo" unoptimized />
        <span className="brand-name">TORQ BEARINGS<span className="brand-sub">INDUSTRIES</span></span>
      </Link>
      <nav className="topbar-actions admin-header-actions" aria-label="Staff navigation">
        <Link href="/admin">Verification queue</Link>
        {staff.role === "admin" && <Link href="/admin/staff">Staff accounts</Link>}
        <span className="header-note">{staff.username} · {staff.role}</span>
        <AdminLogoutButton />
      </nav>
    </header>
  );
}
