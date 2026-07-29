import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { getUserInfo } from '../api/authApi';

const AuthCtx = createContext(null);

/*
  authScreen: 'landing' | 'signup' | 'signup-verify' | 'login' | null (= authenticated)
*/
const init = {
  authScreen:   'landing',  // start on the marketing landing page
  user:         null,       // { name, email } once authenticated
  pendingEmail: '',         // email waiting for verification
  pendingName:  '',         // name of user being verified
  pendingPassword: '',      // password of user being verified
};

function isTokenExpired(token) {
  if (!token) return true;

  try {
    const payload = token.split('.')[1];
    if (!payload) return false;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized));
    if (typeof decoded.exp !== 'number') return false;
    return Date.now() >= decoded.exp * 1000;
  } catch {
    return false;
  }
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;

  try {
    const value = localStorage.getItem('user');
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getInitialAuthState() {
  if (typeof window === 'undefined') return { ...init };

  const idToken = localStorage.getItem('id_token');
  const accessToken = localStorage.getItem('access_token');
  const userId = localStorage.getItem('user_id');
  const hasValidSession = !!(idToken || accessToken) && !!userId && !isTokenExpired(idToken || accessToken);

  return {
    ...init,
    authScreen: hasValidSession ? null : 'landing',
    user: hasValidSession ? getStoredUser() : null,
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'GO_SCREEN':       return { ...s, authScreen: a.screen };
    case 'SET_PENDING':     return { ...s, pendingEmail: a.email, pendingName: a.name ?? s.pendingName, pendingPassword: a.password ?? s.pendingPassword };
    case 'AUTHENTICATED':   return { ...s, authScreen: null, user: a.user };
    case 'LOGOUT':          return { ...init, authScreen: 'landing' };
    default: return s;
  }
}

export function AuthProvider({ children }) {
  const [auth, dispatch] = useReducer(reducer, undefined, getInitialAuthState);

  const persistUser = useCallback((user) => {
    if (typeof window === 'undefined') return;

    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, []);

  const clearSessionStorage = useCallback(() => {
    if (typeof window === 'undefined') return;

    localStorage.removeItem('id_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user');
  }, []);

  const goScreen     = useCallback(screen => dispatch({ type: 'GO_SCREEN', screen }), []);
  const setPending   = useCallback((email, name, password) => dispatch({ type: 'SET_PENDING', email, name, password }), []);
  const login        = useCallback(user => {
    persistUser(user);
    dispatch({ type: 'AUTHENTICATED', user });
  }, [persistUser]);
  const logout       = useCallback(() => {
    clearSessionStorage();
    persistUser(null);
    dispatch({ type: 'LOGOUT' });
  }, [clearSessionStorage, persistUser]);

  useEffect(() => {
    const restoreSession = async () => {
      if (typeof window === 'undefined') return;

      const idToken = localStorage.getItem('id_token');
      const accessToken = localStorage.getItem('access_token');
      const userId = localStorage.getItem('user_id');

      if (!idToken && !accessToken) return;
      if (!userId || isTokenExpired(idToken || accessToken)) {
        logout();
        return;
      }

      const storedUser = getStoredUser();
      if (storedUser) {
        login(storedUser);
        return;
      }

      try {
        const data = await getUserInfo();
        const userData = data?.email
          ? { email: data.email, name: data.name || data.full_name || data.sub, ...data }
          : null;

        if (userData) {
          login(userData);
        }
      } catch {
        if (storedUser) {
          login(storedUser);
        } else {
          logout();
        }
      }
    };

    restoreSession();
  }, [login, logout]);

  return (
    <AuthCtx.Provider value={{ auth, goScreen, setPending, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth must be inside AuthProvider');
  return c;
};
