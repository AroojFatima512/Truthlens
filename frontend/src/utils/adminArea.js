// Admin pages use a dark red theme, reader pages a dark blue one. The page background behind
// everything (html/body, the animated backdrop, the loading spinner) must match the area, or the
// blue reader background flashes for a moment before an admin page appears.
export const isAdminPath = (pathname = '') => pathname.startsWith('/admin');

export const syncAdminArea = (pathname) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('admin-area', isAdminPath(pathname));
};
