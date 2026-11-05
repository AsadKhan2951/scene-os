export const THEME_KEY = 'sceneos.theme';

/** Runs before the page paints (inline in the root layout), so the saved theme shows without a flash. */
export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;
