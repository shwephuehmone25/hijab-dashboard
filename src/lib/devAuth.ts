// Temporary local preview only; production builds retain normal authentication.
export const skipLogin = import.meta.env.DEV && import.meta.env.VITE_SKIP_LOGIN === 'true';
