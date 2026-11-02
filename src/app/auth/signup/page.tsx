"use client";

import Image from "next/image";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PLACEHOLDER_BUSINESS_NAME } from "@/lib/onboarding/signup";

export default function SignupPage() {
  const router = useRouter();
  // THREE FIELDS. The business name is collected by onboarding step 3,
  // which shows the owner what the analysis worked out and lets him
  // correct it — asking for it twice made the first answer the one
  // nobody checked. The city is not asked at all: plenty of businesses
  // are not in one place, and `dealerships.city` is nullable, so
  // nothing stands in for it.
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    // Create auth user
    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.fullName },
      },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Create dealership
      const { data: dealership, error: dealershipError } = await supabase
        .from("dealerships")
        .insert({
          // A STAND-IN, BECAUSE THE COLUMN IS not null
          // (001_schema.sql:15) and the name is not asked for here any
          // more. Step 3 overwrites it. It is the same words as the
          // existing "no name" fallbacks, and three chokepoints keep it
          // from leaving the product — see lib/onboarding/signup.ts.
          dealership_name: PLACEHOLDER_BUSINESS_NAME,
          owner_id: data.user.id,
        })
        .select()
        .single();

      if (dealershipError) {
        setError(dealershipError.message);
        setLoading(false);
        return;
      }

      // Update profile with dealership. home_dealership_id (P3 agency
      // multi-business-switching fix) is set once here and never
      // touched again — it's what lets /api/agency/switch safely
      // repoint dealership_id to a client team's business and still
      // know how to get back, without needing its own separate
      // switching flow.
      await supabase
        .from("profiles")
        .update({ dealership_id: dealership.id, home_dealership_id: dealership.id, full_name: form.fullName })
        .eq("id", data.user.id);

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    }

    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-100 rounded-2xl shadow-2xl p-8 text-center max-w-md w-full">
          <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✅</span>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Account created!</h2>
          <p className="text-slate-500 text-sm">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-full.png" alt="Hawlai — AI Marketing. Smarter Growth." width={220} height={220} className="mx-auto rounded-2xl" />
        </div>

        <div className="bg-slate-100 rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">Create account</h2>
          <p className="text-slate-500 text-sm mb-6">Takes a minute — we'll set your business up next</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input name="fullName" type="text" value={form.fullName} onChange={handleChange} placeholder="Rajesh Sharma" required className="input" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="owner@dealership.com" required className="input" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="Min 8 characters" required minLength={8} className="input" />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-700/50 rounded-lg text-sm text-red-400">{error}</div>
            )}

            <Button type="submit" disabled={loading} loading={loading} className="w-full justify-center py-2.5">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-brand-400 font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
