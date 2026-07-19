"use client";

import { ClerkProvider, SignInButton, SignOutButton, UserButton, useUser } from "@clerk/nextjs";
import { createContext, useContext, type ReactNode } from "react";

interface AppAuthState {
  isAuthEnabled: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  userLabel: string;
}

const isClerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

const guestAuthState: AppAuthState = {
  isAuthEnabled: false,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  userLabel: "Guest"
};

const AppAuthContext = createContext<AppAuthState>(guestAuthState);

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const userLabel =
    user?.primaryEmailAddress?.emailAddress ??
    user?.username ??
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ??
    "Account";

  return (
    <AppAuthContext.Provider
      value={{
        isAuthEnabled: true,
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
        userId: user?.id ?? null,
        userLabel
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkEnabled) {
    return <AppAuthContext.Provider value={guestAuthState}>{children}</AppAuthContext.Provider>;
  }

  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

function ClerkAccountControls() {
  const auth = useAppAuth();

  if (!auth.isLoaded) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
        Account
      </div>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button
          type="button"
          className="rounded-lg border border-sage/40 bg-skysoft px-3 py-2 text-xs font-black text-stone-800 shadow-sm transition hover:border-sage dark:border-sage/50 dark:bg-sage/20 dark:text-stone-100"
        >
          Sign in
        </button>
      </SignInButton>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2 py-1.5 shadow-sm dark:border-stone-700 dark:bg-stone-900">
      <UserButton />
      <span className="hidden max-w-36 truncate text-xs font-black text-stone-600 dark:text-stone-200 sm:inline">{auth.userLabel}</span>
      <SignOutButton>
        <button type="button" className="rounded-md px-2 py-1.5 text-xs font-black text-stone-500 transition hover:bg-stone-100 hover:text-sage dark:text-stone-300 dark:hover:bg-stone-800">
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}

export function AccountControls() {
  if (!isClerkEnabled) {
    return (
      <div
        title="Add Clerk environment variables to enable account cloud sync"
        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
      >
        Guest
      </div>
    );
  }

  return <ClerkAccountControls />;
}

export function useAppAuth() {
  return useContext(AppAuthContext);
}
