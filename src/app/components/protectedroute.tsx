"use client"; // Required for client-side hooks

import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../firebase-config";
import { useRouter } from "next/navigation";
import { useEffect, ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/"); // Redirect to home if not authenticated
    }
  }, [user, loading, router]);

  if (loading) return <p>Loading...</p>;
  return user ? <>{children}</> : null; // Render children only if authenticated
}

//protected route is used to protect the dashboard page from unauthorized access.
//It checks if the user is authenticated using the useAuthState hook from react-firebase-hooks.