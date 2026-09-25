import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import ThemeToggle from "@/components/ThemeToggle";

// Same reasoning as AppHeader — admin's three pages (books, dashboard,
// print-orders) had each grown their own inconsistent header
// independently. One shared component instead of three drifting
// copies. Deliberately a SEPARATE component from AppHeader, not a
// shared one — admin's nav (Dashboard/Books/Print orders) has nothing
// to do with a parent's own nav (Family/Library/Story Studio) — but
// styled identically to it now, not a distinct dark theme: the
// original version used a dark indigo_night background specifically
// to signal "you're in a different area," but that read as
// inconsistent rather than intentional. Every header in the app now
// shares the same visual language; only the nav items themselves
// differ per area.
const ADMIN_NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/books", label: "Books" },
  { href: "/admin/library", label: "Library" },
  { href: "/admin/print-orders", label: "Print orders" },
];

export default function AdminHeader() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);

  return (
    <header className="border-b border-charcoal/10 bg-ivory_cloth">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <span className="font-display text-xl">Derek Admin</span>

        {/* Same reasoning as AppHeader — four nav items at a comfortable
            gap don't reliably fit a narrow phone, so this row is
            desktop-only and replaced by the hamburger + dropdown below
            md, rather than letting it silently overflow. */}
        <nav className="hidden items-center gap-6 md:flex">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`font-body text-sm ${isActive ? "font-bold text-coral_ember" : "text-charcoal/60"}`}
              >
                {item.label}
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="flex flex-col gap-1.5 p-2"
          >
            <span className="h-0.5 w-6 bg-charcoal" />
            <span className="h-0.5 w-6 bg-charcoal" />
            <span className="h-0.5 w-6 bg-charcoal" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col border-t border-charcoal/10 px-6 py-4 md:hidden">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`py-2.5 font-body text-sm ${isActive ? "font-bold text-coral_ember" : "text-charcoal/60"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
