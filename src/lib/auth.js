import { CognitoUser, CognitoUserPool, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { IS_DEMO_MODE, USER_POOL_CLIENT_ID, USER_POOL_ID } from './config.js';

let userPool;

function getUserPool() {
  if (IS_DEMO_MODE) return null;
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: USER_POOL_ID,
      ClientId: USER_POOL_CLIENT_ID,
    });
  }
  return userPool;
}

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
  if (IS_DEMO_MODE) return;
  const pool = getUserPool();
  pool.getCurrentUser()?.signOut();
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
