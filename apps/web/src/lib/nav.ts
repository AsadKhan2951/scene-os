export interface NavItem { label: string; href: string }
export interface Section { label: string; href: string; tabs: NavItem[] }

/**
 * Scene OS 2.0 navigation: seven sections, each with its tabs. The screens keep their URLs, so
 * links, bookmarks and the existing flow stay the same; only where they appear in the menu moved.
 */
export const SECTIONS: Section[] = [
  {
    label: 'My Studio', href: '/', tabs: [
      { label: 'Studio', href: '/' },
      { label: 'Projects', href: '/productions' },
      { label: 'AI credits', href: '/credits' },
    ],
  },
  {
    label: 'Script Director', href: '/write/intake', tabs: [
      { label: 'Intake', href: '/write/intake' },
      { label: 'Story wizard', href: '/write/new' },
      { label: 'One-liner', href: '/write/one-liner' },
      { label: 'Script', href: '/write/script' },
      { label: 'Characters', href: '/write/characters' },
      { label: 'Coverage', href: '/write/coverage' },
    ],
  },
  {
    label: 'Production', href: '/produce/breakdown', tabs: [
      { label: 'Breakdown', href: '/produce/breakdown' },
      { label: 'Locations', href: '/produce/locations' },
      { label: 'Shoot plan', href: '/produce/plan' },
      { label: 'Call sheets', href: '/produce/schedule' },
      { label: 'Actors', href: '/produce/actors' },
      { label: 'Cast and crew', href: '/produce/people' },
      { label: 'Documents', href: '/produce/documents' },
      { label: 'On set', href: '/on-set' },
    ],
  },
  {
    label: 'Direction', href: '/direct/storyboard', tabs: [
      { label: 'Storyboard', href: '/direct/storyboard' },
      { label: 'AI Director', href: '/direct/director' },
      { label: 'Shot list', href: '/direct/shots' },
      { label: 'Look book', href: '/direct/lookbook' },
      { label: 'Promos and pitch', href: '/direct/promos' },
      { label: 'Draw scenes', href: '/write/storyboards' },
      { label: 'Scene video', href: '/write/teaser' },
    ],
  },
  {
    label: 'Expense & Budgeting', href: '/money/budget', tabs: [
      { label: 'Budget', href: '/money/budget' },
      { label: 'Daily expenses', href: '/money/daily' },
      { label: 'Approvals', href: '/money/approvals' },
    ],
  },
  {
    label: 'Post', href: '/deliver/board', tabs: [
      { label: 'Episode board', href: '/deliver/board' },
      { label: 'Reviews', href: '/deliver/reviews' },
      { label: 'Deliverables', href: '/deliver/channel' },
    ],
  },
  {
    label: 'Tracking', href: '/health', tabs: [
      { label: 'Flow and health', href: '/health' },
      { label: 'Pipeline', href: '/produce/pipeline' },
      { label: 'Milestones', href: '/produce/milestones' },
      { label: 'Reports', href: '/dreamer' },
    ],
  },
];

/** The section a page belongs to: the one with a tab whose link is the longest match for the path. */
export function sectionFor(path: string): Section | undefined {
  let best: { section: Section; length: number } | undefined;
  for (const section of SECTIONS) {
    for (const tab of section.tabs) {
      const hit = tab.href === '/' ? path === '/' : path === tab.href || path.startsWith(`${tab.href}/`);
      if (hit && (!best || tab.href.length > best.length)) best = { section, length: tab.href.length };
    }
  }
  return best?.section;
}

/** Kept for the pages that still pass their tabs; the tab bar now shows the section's tabs from the path. */
const tabsOf = (label: string) => SECTIONS.find((s) => s.label === label)!.tabs;
export const TABS = {
  home: tabsOf('My Studio'),
  write: tabsOf('Script Director'),
  direct: tabsOf('Direction'),
  produce: tabsOf('Production'),
  money: tabsOf('Expense & Budgeting'),
  deliver: tabsOf('Post'),
} satisfies Record<string, NavItem[]>;
