import { useState } from "react";

// Only ever rendered from /family — a parent-facing page reached only by
// a signed-in account, never from inside Reading Mode itself. A child
// being able to reach this form at all would defeat the entire point of
// the PIN existing.
export default function ReadingModePinSetup({ accessToken, onCancel, onSuccess }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError("PIN must be exactly 4 digits.");
    if (pin !== confirmPin) return setError("PINs don't match.");
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/family/reading-mode-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save the PIN.");
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 px-6">
      <div className="w-full max-w-xs rounded-cloth bg-white p-6 text-center shadow-lg">
        <h2 className="font-display text-xl">Set a Reading Mode PIN</h2>
        <p className="mt-2 font-body text-sm text-charcoal/60">
          You'll need this to exit Reading Mode once it's started — pick something you'll remember, not something
          your child could guess.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="4-digit PIN"
            autoFocus
            className="mt-4 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 text-center font-body text-lg tracking-widest"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Confirm PIN"
            className="mt-2 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 text-center font-body text-lg tracking-widest"
          />
          {error && <p className="mt-2 font-body text-sm text-coral_ember">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-cloth bg-coral_ember px-4 py-2 font-body font-bold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & continue"}
            </button>
            <button type="button" onClick={onCancel} className="flex-1 rounded-cloth border border-charcoal/15 px-4 py-2 font-body">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
