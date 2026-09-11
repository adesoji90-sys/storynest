import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";
import { getPageTier, SUBSCRIPTION_MAX_BOOKS_PER_MONTH } from "@/lib/pricing";

export default function Account() {
  const router = useRouter();
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [profile, setProfile] = useState(null);
  const [stories, setStories] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    let active = true;

    async function init() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!active) return;
      if (!data.session) {
        router.replace("/login?redirect=/account");
        return;
      }
      setSession(data.session);
    }
    init();

    const { data: listener } = supabaseBrowser.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        router.replace("/login?redirect=/account");
      } else {
        setSession(newSession);
      }
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!session) return;
    async function loadData() {
      const [{ data: profileData, error: profileError }, { data: storyData, error: storyError }] =
        await Promise.all([
          supabaseBrowser.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
          supabaseBrowser
            .from("stories")
            .select("id, title, tier, pdf_path, created_at")
            .eq("user_id", session.user.id)
            .order("created_at", { ascending: false }),
        ]);
      if (profileError || storyError) {
        setLoadError("Couldn't load your account. Try refreshing.");
        return;
      }
      setProfile(profileData);
      setStories(storyData || []);
    }
    loadData();
  }, [session]);

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    router.push("/");
  }

  async function handleDownload(story) {
    if (!story.pdf_path) return;
    setDownloadingId(story.id);
    try {
      const {
        data: { session: currentSession },
      } = await supabaseBrowser.auth.getSession();
      const res = await fetch("/api/story-pdf-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession?.access_token}`,
        },
        body: JSON.stringify({ storyId: story.id }),
      });
      if (!res.ok) throw new Error("Couldn't get a download link.");
      const data = await res.json();
      window.open(data.url, "_blank", "noopener");
    } catch (err) {
      alert(err.message || "Something went wrong.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (session === undefined) return null; // still checking auth
  const isSubscribed = profile?.subscription_status === "active";

  return (
    <>
      <Head>
        <title>My Library — StoryNest</title>
      </Head>
      <main className="min-h-screen bg-ivory_cloth text-charcoal">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <Link href="/" className="font-display text-xl">StoryNest</Link>
          <div className="flex items-center gap-5">
            <Link href="/family" className="font-body text-sm text-charcoal/60">Your family</Link>
            <button onClick={handleLogout} className="font-body text-sm text-charcoal/60">Log out</button>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-6 pb-24">
          <h1 className="font-display text-3xl">My Library</h1>
          <p className="mt-1 font-body text-sm text-charcoal/60">{session.user.email}</p>

          <div className="mt-6 rounded-cloth bg-white p-6 shadow-sm">
            {isSubscribed ? (
              <>
                <p className="font-body font-bold text-leaf">
                  Subscription active — {getPageTier(profile.subscription_page_tier)?.label || profile.subscription_page_tier} books
                </p>
                <p className="font-body text-sm text-charcoal/60">
                  {SUBSCRIPTION_MAX_BOOKS_PER_MONTH - (profile.subscription_books_used_this_period || 0)} of{" "}
                  {SUBSCRIPTION_MAX_BOOKS_PER_MONTH} books remaining this period
                </p>
                {profile.subscription_renews_at && (
                  <p className="font-body text-sm text-charcoal/60">
                    Renews {new Date(profile.subscription_renews_at).toLocaleDateString()}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-body">No active subscription — each Basic story is billed individually.</p>
                <Link
                  href="/subscribe"
                  className="mt-3 inline-block rounded-cloth bg-coral_ember px-5 py-2 font-body font-bold text-white"
                >
                  See subscription plans
                </Link>
              </>
            )}
          </div>

          <h2 className="mt-10 font-display text-2xl">Saved stories</h2>
          {loadError && <p className="mt-2 font-body text-sm text-coral_ember">{loadError}</p>}
          {stories.length === 0 && !loadError && (
            <p className="mt-2 font-body text-sm text-charcoal/60">
              Nothing here yet — stories you buy while logged in will show up here.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {stories.map((story) => (
              <div key={story.id} className="flex items-center justify-between rounded-cloth bg-white p-4 shadow-sm">
                <div>
                  <p className="font-body font-bold">{story.title}</p>
                  <p className="font-body text-xs text-charcoal/50">
                    {story.tier === "premium" ? "Premium" : "Basic"} ·{" "}
                    {new Date(story.created_at).toLocaleDateString()}
                  </p>
                </div>
                {story.pdf_path ? (
                  <button
                    onClick={() => handleDownload(story)}
                    disabled={downloadingId === story.id}
                    className="rounded-cloth border border-charcoal/20 px-4 py-2 font-body text-sm disabled:opacity-50"
                  >
                    {downloadingId === story.id ? "Preparing…" : "Download"}
                  </button>
                ) : (
                  <span className="font-body text-xs text-charcoal/40">No PDF saved</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
