// Where a logged-in person belongs: admins go to the admin dashboard, readers to the page
// they chose in Settings ("Default landing page"), News Feed by default.
export const homePathFor = (user, settings) => {
  if (!user) return '/';
  if (user.role === 'admin') return '/admin/dashboard';
  const page = settings?.defaultLandingPage;
  if (page === 'Dashboard') return '/dashboard';
  if (page === 'Trending Topics') return '/dashboard?tab=Trending Topics';
  return '/feed';
};
