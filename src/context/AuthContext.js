import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);   // includes .role
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error) setProfile(data);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

// Email + password signup. full_name/phone/role are passed as auth
// metadata — a DB trigger (see supabase/schema.sql) reads them and
// creates the matching profiles row server-side. We deliberately do
// NOT insert into profiles from the client here: right after signUp()
// there's often no session yet (email confirmation pending), so a
// client-side insert would fail Row Level Security.
const signUp = async ({ email, password, fullName, role, phone }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, role }, // 'customer' | 'driver' | 'store_owner'
    },
  });
  return { data, error };
};

  const signIn = async ({ email, password }) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = { session, profile, loading, signUp, signIn, signOut, refreshProfile: () => loadProfile(session?.user?.id) };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);   