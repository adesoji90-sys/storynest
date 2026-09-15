import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

// Shared header for every logged-in page — previously each page
// (family.js, library.js, story-studio/index.js) built its own copy of
// this independently, which is how they drifted: one linked "My
// Library" to /account, a pre-rewrite page tied to the old per-book
// pricing model that no longer reflects how the app actually works,
// and none of them had a working logout at all. One shared component
// means a fix here reaches every page instead of needing to be
// re-applied three times and inevitably missing a fourth.
const NAV_ITEMS = [
  { href: "/family", label: "Family" },
  { href: "/library", label: "Library" },
  { href: "/story-studio", label: "Story Studio" },
];

export default function AppHeader() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  // An admin previously had no way to reach /admin/books or
  // /admin/dashboard from their normal logged-in view at all — they
  // had to already know and type the URL. This checks once, quietly,
  // and only ever ADDS a link; a non-admin sees no difference at all,
  // and a failed/slow check just means the link doesn't appear yet,
  // never a broken header.
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      fetch("/api/admin/whoami", { headers: { Authorization: `Bearer ${data.session.access_token}` } })
        .then((res) => res.json())
        .then((json) => setIsAdmin(!!json.isAdmin))
        .catch(() => {});
    });
  }, []);

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="border-b border-charcoal/10 bg-ivory_cloth">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/family" className="font-display text-xl">
          StoryNest
        </Link>
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
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
          <Link href="/upgrade" className="font-body text-sm text-charcoal/60">
            Upgrade
          </Link>
          {isAdmin && (
            <Link href="/admin/dashboard" className="font-body text-sm text-charcoal/60">
              Admin
            </Link>
          )}
          <button onClick={handleLogout} className="font-body text-sm text-charcoal/40">
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
