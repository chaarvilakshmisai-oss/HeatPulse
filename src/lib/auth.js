import { CognitoUser, CognitoUserPool, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { IS_DEMO_MODE, USER_POOL_CLIENT_ID, USER_POOL_ID } from './config.js';

let userPool;

function getUserPool() {
  if (IS_DEMO_MODE) return null;
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: USER_POOL_ID,
      ClientId: USER_POOL_CLIENT_ID,
      Storage: window.sessionStorage,
    });
  }
  return userPool;
}

function isCognitoStorageKey(key) {
  return key.startsWith('CognitoIdentityServiceProvider.') || key.startsWith('aws.cognito.');
}

function clearStorageKeys(storage) {
  if (!storage) return;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && isCognitoStorageKey(key)) storage.removeItem(key);
  }
}

export function clearLegacyCognitoSession() {
  if (typeof window === 'undefined') return;
  clearStorageKeys(window.localStorage);
}

export function clearCognitoSessionStorage() {
  if (typeof window === 'undefined') return;
  clearStorageKeys(window.sessionStorage);
  clearStorageKeys(window.localStorage);
}

if (typeof window !== 'undefined') clearLegacyCognitoSession();

export function isDemoMode() {
  return IS_DEMO_MODE;
}

export function signIn(email, password) {
  if (IS_DEMO_MODE) return Promise.resolve({ email: 'Demo manager', demo: true });
  const pool = getUserPool();
  const user = new CognitoUser({ Username: email, Pool: pool });
  const details = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: () => resolve({ email }),
      onFailure: (error) => reject(error),
      newPasswordRequired: () => reject(new Error('Your account needs a new password. Ask your admin to reset it.')),
    });
  });
}

export function signOut() {
  if (!IS_DEMO_MODE) getUserPool().getCurrentUser()?.signOut();
  clearCognitoSessionStorage();
}

export function getCurrentUser() {
  if (IS_DEMO_MODE) return Promise.resolve({ email: 'Demo manager', demo: true });
  const pool = getUserPool();
  const user = pool.getCurrentUser();
  if (!user) return Promise.resolve(null);

  return new Promise((resolve) => {
    user.getSession((error, session) => {
      if (error || !session?.isValid()) {
        resolve(null);
        return;
      }
      resolve({ email: user.getUsername(), demo: false });
    });
  });
}

export function getIdToken() {
  if (IS_DEMO_MODE) return Promise.resolve(null);
  const pool = getUserPool();
  const user = pool.getCurrentUser();
  if (!user) return Promise.reject(new Error('Your session has expired. Please sign in again.'));

  return new Promise((resolve, reject) => {
    user.getSession((error, session) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}
