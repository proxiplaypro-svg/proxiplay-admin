"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./auth";

export const ADMIN_EMAILS = ["proxiplay.pro@gmail.com"];

type UseAdminAuthResult = {
  loading: boolean;
  isAdmin: boolean;
  user: User | null;
};

export function useAdminAuth(): UseAdminAuthResult {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const isAdmin = useMemo(() => {
    const email = user?.email?.toLowerCase();
    if (!email) {
      return false;
    }

    return ADMIN_EMAILS.map((item) => item.toLowerCase()).includes(email);
  }, [user]);

  return { loading, isAdmin, user };
}
