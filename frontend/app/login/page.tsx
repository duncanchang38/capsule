"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  function reset(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setInfo("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (res.ok) {
          setInfo("If that email is registered, a reset link is on its way.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }

      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Registration failed");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f5f0]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-stone-800">Capsule</h1>
          <p className="text-sm text-stone-500 mt-1">your personal AI intake layer</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
          {mode !== "forgot" && (
            <div className="flex rounded-lg bg-stone-100 p-1 mb-6">
              <button
                type="button"
                onClick={() => reset("login")}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === "login"
                    ? "bg-white shadow-sm text-stone-800"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => reset("register")}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === "register"
                    ? "bg-white shadow-sm text-stone-800"
                    : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Create account
              </button>
            </div>
          )}

          {mode === "forgot" && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => reset("login")}
                className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
              >
                ← Back to sign in
              </button>
              <h2 className="text-base font-semibold text-stone-800 mt-2">Reset your password</h2>
              <p className="text-xs text-stone-500 mt-1">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your name"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-stone-50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-stone-50"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-stone-600">Password</label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => reset("forgot")}
                      className="text-xs text-stone-400 hover:text-stone-600"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder={mode === "register" ? "At least 8 characters" : ""}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-stone-50"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {info && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-stone-800 text-white text-sm font-medium rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "..."
                : mode === "login"
                ? "Sign in"
                : mode === "register"
                ? "Create account"
                : "Send reset link"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
