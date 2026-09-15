import Link from "next/link";
import { useRouter } from "next/router";

// Same reasoning as AppHeader — admin's three pages (books, dashboard,
// print-orders) had each grown their own inconsistent header
// independently (one plain "StoryNest Admin" label with no nav at all,
// one with an ad-hoc two-link row, one with nothing to get back
// anywhere else). One shared component instead of three drifting
// copies. Deliberately separate from AppHeader, not a shared
// component between them — admin's nav (Dashboard/Books/Print orders)
// has nothing to do with a parent's own nav (Family/Library/Story
// Studio), and conflating them would be confusing in both directions.
const ADMIN_NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/books", label: "Books" },
  { href: "/admin/print-orders", label: "Print orders" },
];

export default function AdminHeader() {
  const router = useRouter();
  return (
    <header className="border-b border-charcoal/10 bg-indigo_night">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <span className="font-display text-xl text-ivory_cloth">StoryNest Admin</span>
        <nav className="flex items-center gap-6">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`font-body text-sm ${isActive ? "font-bold text-marigold" : "text-ivory_cloth/60"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
