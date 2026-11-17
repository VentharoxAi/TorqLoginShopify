"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CustomerHeaderCustomer } from "@/lib/customer-header";

type Props = {
  customer: CustomerHeaderCustomer;
  cartCount?: number;
  onCartClick?: () => void;
};

type MenuItem = {
  label: string;
  href?: string;
  external?: boolean;
  action?: "signout";
  icon: "login" | "signup" | "details" | "products" | "support" | "logout";
};

function MenuItemIcon({ icon }: { icon: MenuItem["icon"] }) {
  const paths: Record<MenuItem["icon"], React.ReactNode> = {
    login: <><path d="M10 5H5v14h5" /><path d="M13 8l4 4-4 4M8 12h9" /></>,
    signup: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3 2.3-4.5 5.5-4.5 1.2 0 2.2.2 3 .7M18 11v7M14.5 14.5h7" /></>,
    details: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.6-3.5 2.8-5.3 6.5-5.3 1.3 0 2.5.3 3.4.8M18 14v6M15 17h6" /></>,
    products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.4 7.5-4.4M12 12v8.5" /></>,
    support: <><path d="M4 13v-2a8 8 0 0 1 16 0v2" /><path d="M4 12H3v5h4v-5H4ZM20 12h1v5h-4v-5h3ZM17 19c-.8 1.1-2.2 1.7-4 1.7" /></>,
    logout: <><path d="M10 5H5v14h5" /><path d="M13 8l4 4-4 4M8 12h9" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[icon]}</svg>;
}

function ProfileMenu({ customer }: { customer: CustomerHeaderCustomer }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: MenuItem[] = customer.status === "guest"
    ? [
        { label: "Sign in", href: "/login", icon: "login" },
        { label: "Create account", href: "/signup", icon: "signup" },
      ]
    : customer.status === "no-details"
      ? [
          { label: "Complete shop details", href: "/account/details", icon: "details" },
          { label: "Sign out", action: "signout", icon: "logout" },
        ]
      : customer.status === "pending"
        ? [
            { label: "Edit shop details", href: "/account/details", icon: "details" },
            { label: "Sign out", action: "signout", icon: "logout" },
          ]
        : customer.status === "approved"
          ? [
              { label: "Products", href: "/store", icon: "products" },
              { label: "Shop details", href: "/account/details", icon: "details" },
              { label: "Sign out", action: "signout", icon: "logout" },
            ]
          : [
              { label: "WhatsApp support", href: "https://wa.me/923214073811", external: true, icon: "support" },
              { label: "Sign out", action: "signout", icon: "logout" },
            ];

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const menuItems = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (!menuItems?.length) return;
      event.preventDefault();
      const currentIndex = Array.from(menuItems).indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? menuItems.length - 1
          : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length;
      menuItems[nextIndex].focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out right now. Please try again.");
      window.location.assign("/");
    } catch (caught) {
      setSigningOut(false);
      setError(caught instanceof Error ? caught.message : "Unable to sign out right now.");
      setOpen(true);
    }
  }

  function closeMenu() {
    setOpen(false);
    setError("");
  }

  return (
    <div className="customer-profile" ref={rootRef}>
      <button
        className="customer-profile-trigger"
        type="button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="customer-profile-menu"
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
          }
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c.6-3.5 2.8-5.3 6.5-5.3s5.9 1.8 6.5 5.3" />
        </svg>
      </button>
      {open && (
        <div className="customer-profile-menu" id="customer-profile-menu" role="menu" ref={menuRef}>
          {customer.status === "pending" && (
            <div className="customer-profile-summary">
              <strong>{customer.name}</strong>
              <span className="customer-pending-badge">Pending verification</span>
            </div>
          )}
          {customer.status === "approved" && (
            <div className="customer-profile-summary">
              <strong>{customer.name}</strong>
            </div>
          )}
          {customer.status === "blocked" && (
            <div className="customer-profile-summary">
              <strong>Account blocked</strong>
            </div>
          )}
          {error && <p className="customer-profile-error" role="alert">{error}</p>}
          {items.map((item) => item.action === "signout" ? (
            <button
              className="customer-profile-item"
              type="button"
              role="menuitem"
              key={item.action}
              disabled={signingOut}
              onClick={() => {
                closeMenu();
                void signOut();
              }}
            >
              <MenuItemIcon icon={item.icon} />
              <span>{signingOut ? "Signing out…" : item.label}</span>
            </button>
          ) : (
            <Link
              className="customer-profile-item"
              href={item.href ?? "/"}
              role="menuitem"
              key={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              onClick={closeMenu}
            >
              <MenuItemIcon icon={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerHeader({
  customer,
  cartCount = 0,
  onCartClick,
}: Props) {
  const hasAccountDetails = customer.status === "no-details" ||
    customer.status === "pending" ||
    customer.status === "approved";

  return (
    <header className="customer-site-header">
      <div className="customer-site-header-inner">
        <Link className="customer-site-brand" href="/" aria-label="TORQ Bearings home">
          <Image src="/torq-logo.jpg" width={30} height={30} alt="" unoptimized />
          <span>torqbearingsStore</span>
        </Link>
        <nav className="customer-site-nav" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="customer-site-actions">
          {hasAccountDetails && (
            <Link className="customer-header-edit" href="/account/details">Edit details</Link>
          )}
          <ProfileMenu customer={customer} />
          {customer.status === "approved" && (
            onCartClick ? (
              <button
                className="customer-header-cart"
                type="button"
                aria-label={`View cart, ${cartCount} cartons`}
                onClick={onCartClick}
              >
                <CartIcon count={cartCount} />
              </button>
            ) : (
              <Link className="customer-header-cart" href="/store" aria-label={`View cart, ${cartCount} cartons`}>
                <CartIcon count={cartCount} />
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}

function CartIcon({ count }: { count: number }) {
  return (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 4.5h2l2.2 11.2h10.8l2-8H6.3" />
        <circle cx="9.5" cy="19.5" r="1.2" />
        <circle cx="17.5" cy="19.5" r="1.2" />
      </svg>
      <span className="customer-cart-count">{count}</span>
    </>
  );
}
