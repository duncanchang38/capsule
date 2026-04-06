"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register" | "forgot";

interface FieldState {
  error: string | null;    // null = pristine or valid, string = error message
  checking?: boolean;      // true while async uniqueness check is in flight
  ok?: boolean;            // true = passed uniqueness check
}

const EMPTY_FIELDS: Record<string, FieldState> = {
  name: { error: null },
  handle: { error: null },
  email: { error: null },
  password: { error: null },
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function isValidHandle(v: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(v);
}

function validatePassword(v: string): string | null {
  if (v.length < 8) return "At least 8 characters required.";
  if (!/[a-zA-Z]/.test(v)) return "Must contain at least one letter.";
  if (!/[0-9]/.test(v)) return "Must contain at least one number.";
  return null;
}

async function checkAvailability(
  field: "email" | "handle",
  value: string,
): Promise<{ available: boolean; reason?: string }> {
  const res = await fetch(`/api/auth/check?${field}=${encodeURIComponent(value)}`);
  return res.json();
}

function FieldError({ msg }: { msg: string }) {
  return <p className="text-[11px] text-red-500 mt-1">{msg}</p>;
}

function FieldOk({ msg }: { msg: string }) {
  return <p className="text-[11px] text-emerald-600 mt-1">{msg}</p>;
}

function inputClass(state: FieldState): string {
  const base =
    "w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-stone-50 transition-colors";
  if (state.error) return `${base} border-red-300 focus:ring-red-200`;
  if (state.ok) return `${base} border-emerald-300 focus:ring-emerald-100`;
  return `${base} border-stone-200 focus:ring-stone-300`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [fields, setFields] = useState<Record<string, FieldState>>(EMPTY_FIELDS);
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // Debounce timers and in-flight promises for async checks.
  // Promises resolve to true (available) or false (taken/error).
  const emailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailCheckPromise = useRef<Promise<boolean> | null>(null);
  const handleCheckPromise = useRef<Promise<boolean> | null>(null);

  function setField(key: string, state: FieldState) {
    setFields((prev) => ({ ...prev, [key]: state }));
  }

  function reset(nextMode: Mode) {
    setMode(nextMode);
    setFormError("");
    setInfo("");
    setFields(EMPTY_FIELDS);
  }

  // Clear async checks when switching modes
  useEffect(() => {
    if (emailTimer.current) clearTimeout(emailTimer.current);
    if (handleTimer.current) clearTimeout(handleTimer.current);
  }, [mode]);

  const scheduleEmailCheck = useCallback((value: string) => {
    if (emailTimer.current) clearTimeout(emailTimer.current);
    if (!isValidEmail(value)) { emailCheckPromise.current = null; return; }
    setField("email", { error: null, checking: true });
    emailCheckPromise.current = new Promise<boolean>((resolve) => {
      emailTimer.current = setTimeout(async () => {
        const result = await checkAvailability("email", value);
        setField("email", {
          error: result.available ? null : (result.reason ?? "Email already registered."),
          ok: result.available,
        });
        resolve(result.available);
      }, 500);
    });
  }, []);

  const scheduleHandleCheck = useCallback((value: string) => {
    if (handleTimer.current) clearTimeout(handleTimer.current);
    if (!isValidHandle(value)) { handleCheckPromise.current = null; return; }
    setField("handle", { error: null, checking: true });
    handleCheckPromise.current = new Promise<boolean>((resolve) => {
      handleTimer.current = setTimeout(async () => {
        const result = await checkAvailability("handle", value);
        setField("handle", {
          error: result.available ? null : (result.reason ?? "Handle already taken."),
          ok: result.available,
        });
        resolve(result.available);
      }, 500);
    });
  }, []);

  function validateName(): boolean {
    if (!name.trim()) {
      setField("name", { error: "Name is required." });
      return false;
    }
    setField("name", { error: null });
    return true;
  }

  function validateEmail(): boolean {
    if (!email.trim()) {
      setField("email", { error: "Email is required." });
      return false;
    }
    if (!isValidEmail(email)) {
      setField("email", { error: "Enter a valid email address." });
      return false;
    }
    return true;
  }

  function validateHandle(): boolean {
    if (!handle.trim()) {
      setField("handle", { error: "Handle is required." });
      return false;
    }
    if (!isValidHandle(handle)) {
      setField("handle", {
        error: "3–20 characters. Letters, numbers, and underscores only.",
      });
      return false;
    }
    return true;
  }

  function validatePasswordField(): boolean {
    const err = validatePassword(password);
    setField("password", { error: err });
    return err === null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setInfo("");

    if (mode === "forgot") {
      if (!validateEmail()) return;
      setLoading(true);
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (res.ok) {
          setInfo("If that email is registered, a reset link is on its way.");
        } else {
          setFormError("Something went wrong. Please try again.");
        }
      } catch {
        setFormError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === "login") {
      const loginEmailOk = validateEmail();
      const loginPwOk = validatePasswordField();
      if (!loginEmailOk || !loginPwOk) return;
      setLoading(true);
      try {
        const result = await signIn("credentials", { email, password, redirect: false });
        if (result?.error) {
          setFormError("Invalid email or password.");
        } else {
          router.push("/");
          router.refresh();
        }
      } catch {
        setFormError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Register
    const nameOk = validateName();
    const handleOk = validateHandle();
    const emailOk = validateEmail();
    const pwOk = validatePasswordField();
    if (!nameOk || !handleOk || !emailOk || !pwOk) return;

    setLoading(true);

    // Await any in-flight uniqueness checks — button shows loading while we wait.
    // Promises resolve to true (available) so we can check results directly,
    // avoiding stale closure state.
    const [emailOkAsync, handleOkAsync] = await Promise.all([
      emailCheckPromise.current ?? Promise.resolve(true),
      handleCheckPromise.current ?? Promise.resolve(true),
    ]);

    if (!emailOkAsync || !handleOkAsync) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, handle }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Map server errors back to field-level messages where possible
        const msg: string = data.detail || "Registration failed.";
        if (msg.toLowerCase().includes("handle")) {
          setField("handle", { error: msg });
        } else if (msg.toLowerCase().includes("email")) {
          setField("email", { error: msg });
        } else {
          setFormError(msg);
        }
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setFormError("Account created but sign-in failed. Try signing in manually.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
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
                  mode === "login" ? "bg-white shadow-sm text-stone-800" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => reset("register")}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === "register" ? "bg-white shadow-sm text-stone-800" : "text-stone-500 hover:text-stone-700"
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

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === "register" && (
              <>
                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={validateName}
                    placeholder="Your name"
                    className={inputClass(fields.name)}
                  />
                  {fields.name.error && <FieldError msg={fields.name.error} />}
                </div>

                {/* Handle */}
                <div>
                  <label className="block text-xs font-medium text-stone-600 mb-1">Handle</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400 select-none">
                      @
                    </span>
                    {fields.handle.checking && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <span className="w-3 h-3 border border-stone-300 border-t-transparent rounded-full animate-spin inline-block" />
                      </span>
                    )}
                    <input
                      type="text"
                      value={handle}
                      onChange={(e) => {
                        const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                        setHandle(v);
                        setField("handle", { error: null, ok: false });
                        scheduleHandleCheck(v);
                      }}
                      onBlur={() => { if (!validateHandle()) return; scheduleHandleCheck(handle); }}
                      placeholder="your_handle"
                      maxLength={20}
                      className={`${inputClass(fields.handle)} pl-7`}
                    />
                  </div>
                  {fields.handle.error ? (
                    <FieldError msg={fields.handle.error} />
                  ) : fields.handle.ok ? (
                    <FieldOk msg={`@${handle} is available`} />
                  ) : (
                    <p className="text-[11px] text-stone-400 mt-1">
                      3–20 characters. Letters, numbers, underscores.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Email</label>
              <div className="relative">
                {fields.email.checking && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="w-3 h-3 border border-stone-300 border-t-transparent rounded-full animate-spin inline-block" />
                  </span>
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setField("email", { error: null, ok: false });
                    if (mode === "register") scheduleEmailCheck(e.target.value);
                  }}
                  onBlur={() => {
                    if (!validateEmail()) return;
                    if (mode === "register") scheduleEmailCheck(email);
                  }}
                  placeholder="you@example.com"
                  className={inputClass(fields.email)}
                />
              </div>
              {fields.email.error ? (
                <FieldError msg={fields.email.error} />
              ) : fields.email.ok && mode === "register" ? (
                <FieldOk msg="Email available" />
              ) : null}
            </div>

            {/* Password */}
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
                  onChange={(e) => {
                    setPassword(e.target.value);
                    // Clear error as user types to avoid nagging before they're done
                    if (fields.password.error) setField("password", { error: null });
                  }}
                  onBlur={validatePasswordField}
                  placeholder={mode === "register" ? "At least 8 characters, includes a number" : ""}
                  className={inputClass(fields.password)}
                />
                {fields.password.error && <FieldError msg={fields.password.error} />}
              </div>
            )}

            {formError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {formError}
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
