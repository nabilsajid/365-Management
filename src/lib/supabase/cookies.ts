// One setting for every Supabase client: the sign-in is remembered on the device
// for as long as browsers allow (400 days), and renewed every time the app is
// used. Closing the app or removing it from recent apps does not sign anyone out.
export const SESSION_COOKIE = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 400 * 24 * 60 * 60,
};
