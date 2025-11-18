"use client";

// Landing/redirect page: decides where to send the user based on their saved role
// in localStorage. Falls back to /login if not authenticated or data is invalid.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem("user");
    
    if (!userData) {
      // No user logged in, redirect to login
      router.push("/login");
      return;
    }

    try {
      const user = JSON.parse(userData);
      
      // Redirect based on user role
      if (user.role === "student") {
        router.push("/student");
      } else if (user.role === "owner") {
        router.push("/owner");
      } else if (user.role === "admin") {
        router.push("/admin");
      } else {
        // Invalid role, redirect to login
        router.push("/login");
      }
    } catch (error) {
      // Error parsing user data, redirect to login
      console.error("Error parsing user data:", error);
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10">
      <div className="text-center">
        {/* Simple spinner while redirecting */}
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}