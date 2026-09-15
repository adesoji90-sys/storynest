import Link from "next/link";
import { useRouter } from "next/router";

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
  { href: "/admin/print-orders", label: "Print orders" },
];

export default function AdminHeader() {
  const router = useRouter();
  return (
    <header className="border-b border-charcoal/10 bg-ivory_cloth">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <span className="font-display text-xl">StoryNest Admin</span>
        <nav className="flex items-center gap-6">
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
        </nav>
      </div>
    </header>
  );
}
