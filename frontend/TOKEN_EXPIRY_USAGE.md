# Token Expiry Handling — Usage Guide

## Overview
Every API call now automatically checks for token expiry (401 errors) and redirects to login when the session expires.

## Implementation Details

### 1. **Auth Pages** (SignupPage, LoginPage, SignupVerifyPage)
✅ Already updated to use `withTokenExpiry` wrapper

```javascript
import { authApi, withTokenExpiry } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';

const MyAuthPage = () => {
  const { goScreen } = useAuth();
  
  const handleAction = async () => {
    try {
      // Wrap API call with token expiry handler
      const data = await withTokenExpiry(
        authApi.login({ email, password }),
        { goScreen } // Pass auth context for redirect
      );
      // Handle success...
    } catch (e) {
      // Only show error if NOT TokenExpired
      if (e.code !== 'TokenExpired') {
        setError(e.message);
      }
      // withTokenExpiry already redirected to login for TokenExpired
    }
  };
};
```

### 2. **Data Pages** (DomainAuthorityPage, KeywordsPage, etc.)
Use the updated `runApi` with auth context:

```javascript
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { seoApi } from '../api/seoApi';

const MyDataPage = () => {
  const { runApi } = useApp();
  const authContext = useAuth(); // Get auth context for token expiry handling
  
  const handleAnalyze = async (req) => {
    try {
      // Pass authContext as 4th parameter to runApi
      await runApi('domainAuthority', seoApi.domainAuthority, req, authContext);
    } catch (e) {
      // Errors (except TokenExpired) already shown as toasts
      // TokenExpired automatically redirects to login
    }
  };
};
```

### 3. **Custom API Calls**
For any custom API calls not using `runApi`:

```javascript
import { withTokenExpiry } from '../api/authApi';
import { useAuth } from '../context/AuthContext';

const MyComponent = () => {
  const { goScreen } = useAuth();
  
  const myCustomCall = async () => {
    try {
      // Option 1: Wrap any API promise
      const result = await withTokenExpiry(
        fetch('/api/custom').then(r => r.json()),
        { goScreen }
      );
      
      // Option 2: Import withTokenExpiry from either API file
      // and wrap seoApi calls the same way as authApi
    } catch (e) {
      if (e.code !== 'TokenExpired') {
        // Handle other errors
      }
    }
  };
};
```

## What Happens on Token Expiry

1. ✅ **Tokens are cleared** from localStorage
   - `id_token` removed
   - `access_token` removed  
   - `user_id` removed

2. ✅ **Automatic redirect** to login screen
   - Shows message: "Your session has expired. Please sign in again."
   - User taken to LoginPage after 2-second delay

3. ✅ **No error toast shown**
   - Only non-TokenExpired errors display error messages
   - Clean UX experience

## API Layers

### AuthAPI (`src/api/authApi.js`)
- **Handles**: signup, login, email verification, resend codes
- **Token Expiry Check**: ✅ Built into `fetchClient`
- **Wrapper Export**: ✅ `withTokenExpiry` function available

### SEOAPI (`src/api/seoApi.js`)
- **Handles**: competitors, keywords, profile, domain authority, full report
- **Token Expiry Check**: ✅ Added to `post` helper
- **Error Class**: ✅ Uses ApiError like authApi

### AppContext (`src/context/AppContext.js`)
- **runApi Function**: ✅ Now accepts optional `authContext` parameter
- **Behavior**: Wraps API calls with `withTokenExpiry` when auth context provided
- **Error Handling**: Suppresses TokenExpired errors from toast (already handled by redirect)

## Migration Checklist

For existing data pages using `runApi`:

- [ ] Import `useAuth` hook
- [ ] Get `authContext` from `useAuth()`
- [ ] Pass `authContext` as 4th parameter to `runApi` calls
- [ ] Update error handling to check `e.code !== 'TokenExpired'` if needed

Example update:
```javascript
// Before
await runApi('domainAuthority', seoApi.domainAuthority, req);

// After
const authContext = useAuth();
await runApi('domainAuthority', seoApi.domainAuthority, req, authContext);
```

## Files Modified

✅ `src/api/authApi.js` — Added `withTokenExpiry` wrapper
✅ `src/api/seoApi.js` — Added token expiry checking to `post` helper
✅ `src/pages/auth/SignupVerifyPage.js` — Uses `withTokenExpiry`
✅ `src/pages/auth/SignupPage.js` — Uses `withTokenExpiry`
✅ `src/pages/auth/LoginPage.js` — Uses `withTokenExpiry`
✅ `src/context/AppContext.js` — Enhanced `runApi` with token expiry support
