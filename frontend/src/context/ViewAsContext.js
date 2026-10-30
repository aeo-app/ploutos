import { createContext, useContext } from 'react';

/** Set only while an admin is inside a customer's app: who the screens should show as signed in. */
export const ViewAsContext = createContext(null);
export const useViewAs = () => useContext(ViewAsContext);
