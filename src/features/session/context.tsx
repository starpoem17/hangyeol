import type { Session } from "@supabase/supabase-js";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (error) {
          setSession(null);
        } else {
          setSession(data.session);
        }

        setIsLoading(false);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setSession(null);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
    }),
    [isLoading, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionContext() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error("SessionProvider is required");
  }

  return value;
}
