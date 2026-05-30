"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { isAllowedAdminEmail } from "./adminAccess";
import { auth } from "./auth";

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
    return isAllowedAdminEmail(user?.email);
  }, [user]);

  return { loading, isAdmin, user };
}
