"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Profile {
  id: string;
  email: string;
  name: string | null;
  handle: string | null;
  bio: string | null;
  created_at: string;
}

function AvatarCircle({ name, size = 80 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="rounded-full bg-stone-900 text-white flex items-center justify-center font-semibold select-none flex-shrink-0"
    >
      {initials || "?"}
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // editable fields
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // password section
  const [showPw, setShowPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p: Profile) => {
        setProfile(p);
        setName(p.name ?? "");
        setBio(p.bio ?? "");
      })
      .finally(() => setLoading(false));
  }, [status]);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), bio: bio.trim() }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated: Profile = await res.json();
      setProfile(updated);
      setName(updated.name ?? "");
      setBio(updated.bio ?? "");
      setSaveMsg("Saved");
    } catch {
      setSaveMsg("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2500);
    }
  }

  async function handlePasswordChange() {
    if (newPw !== confirmPw) {
      setPwMsg({ text: "Passwords don't match", ok: false });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ text: "Password must be at least 8 characters", ok: false });
      return;
    }
    setPwSaving(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (res.ok) {
        setPwMsg({ text: "Password updated", ok: true });
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
        setShowPw(false);
      } else {
        const data = await res.json();
        setPwMsg({ text: data.detail ?? "Failed", ok: false });
      }
    } catch {
      setPwMsg({ text: "Failed to update password", ok: false });
    } finally {
      setPwSaving(false);
    }
  }

  const isDirty = profile && (name !== (profile.name ?? "") || bio !== (profile.bio ?? ""));

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-48 text-stone-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!profile) return null;

  const memberSince = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link href="/" className="text-stone-400 hover:text-stone-700 transition-colors text-sm mb-6 inline-block">←</Link>
      {/* Header */}
      <div className="flex items-center gap-5 mb-10">
        <AvatarCircle name={name || profile.email} size={72} />
        <div>
          <h1 className="text-xl font-semibold text-stone-900 leading-tight">
            {name || profile.email}
          </h1>
          {profile.handle && (
            <p className="text-sm text-stone-400 mt-0.5">@{profile.handle}</p>
          )}
          <p className="text-xs text-stone-400 mt-1">Member since {memberSince}</p>
        </div>
      </div>

      {/* Profile fields */}
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1.5">Display name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1.5">Email</label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="w-full px-3 py-2 text-sm border border-stone-100 rounded-lg bg-stone-50 text-stone-400 cursor-not-allowed"
          />
        </div>

        {profile.handle && (
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1.5">Handle</label>
            <div className="flex items-center px-3 py-2 text-sm border border-stone-100 rounded-lg bg-stone-50 text-stone-400">
              <span className="mr-0.5">@</span>
              <span>{profile.handle}</span>
            </div>
            <p className="text-xs text-stone-400 mt-1">Handle can be changed once every 14 days</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short bio…"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 resize-none"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saveMsg && (
            <span className={`text-xs ${saveMsg === "Saved" ? "text-green-600" : "text-red-500"}`}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-stone-100 my-8" />

      {/* Password section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">Password</h2>
          <button
            onClick={() => { setShowPw((s) => !s); setPwMsg(null); }}
            className="text-xs text-stone-500 hover:text-stone-800 transition-colors"
          >
            {showPw ? "Cancel" : "Change password"}
          </button>
        </div>

        {showPw && (
          <div className="space-y-3">
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
            />
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="New password (8+ characters)"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
            />
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white text-stone-900 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handlePasswordChange}
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pwSaving ? "Updating…" : "Update password"}
              </button>
              {pwMsg && (
                <span className={`text-xs ${pwMsg.ok ? "text-green-600" : "text-red-500"}`}>
                  {pwMsg.text}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
