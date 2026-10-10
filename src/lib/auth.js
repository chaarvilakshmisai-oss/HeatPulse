import { CognitoUser, CognitoUserPool, AuthenticationDetails } from 'amazon-cognito-identity-js';

const userPoolId = import.meta.env.VITE_USER_POOL_ID;
const clientId = import.meta.env.VITE_USER_POOL_CLIENT_ID;
const demoMode = !userPoolId;
let userPool;

function getUserPool() {
  if (demoMode) return null;
  if (!clientId) throw new Error('VITE_USER_POOL_CLIENT_ID must be configured with VITE_USER_POOL_ID.');
  if (!userPool) userPool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId });
  return userPool;
}

export function isDemoMode() {
  return demoMode;
}

export function signIn(email, password) {
  if (demoMode) return Promise.resolve({ email: 'Demo manager', demo: true });
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
  if (demoMode) return;
  const pool = getUserPool();
  pool.getCurrentUser()?.signOut();
}

export function getCurrentUser() {
  if (demoMode) return Promise.resolve({ email: 'Demo manager', demo: true });
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
  if (demoMode) return Promise.resolve(null);
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
