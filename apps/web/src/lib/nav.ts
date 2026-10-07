export interface NavItem { label: string; href: string }

export const MAIN_NAV: (NavItem & { match: string[] })[] = [
  { label: 'Home', href: '/', match: ['/', '/productions', '/health'] },
  { label: 'Write', href: '/write/script', match: ['/write'] },
  { label: 'Produce', href: '/produce/pipeline', match: ['/produce'] },
  { label: 'Money', href: '/money/approvals', match: ['/money'] },
  { label: 'Deliver', href: '/deliver/board', match: ['/deliver'] },
  { label: 'On set', href: '/on-set', match: ['/on-set'] },
];

export const TABS = {
  home: [
    { label: 'Command centre', href: '/' },
    { label: 'Productions', href: '/productions' },
    { label: 'Health', href: '/health' },
  ],
  write: [
    { label: 'New story', href: '/write/new' },
    { label: 'One-liner', href: '/write/one-liner' },
    { label: 'Script', href: '/write/script' },
    { label: 'Characters', href: '/write/characters' },
    { label: 'Storyboards', href: '/write/storyboards' },
  ],
  produce: [
    { label: 'Pipeline', href: '/produce/pipeline' },
    { label: 'Schedule and call sheets', href: '/produce/schedule' },
    { label: 'Cast and crew', href: '/produce/people' },
    { label: 'Milestones', href: '/produce/milestones' },
    { label: 'Documents', href: '/produce/documents' },
  ],
  money: [
    { label: 'Approvals', href: '/money/approvals' },
    { label: 'Daily expenses', href: '/money/daily' },
    { label: 'Budget', href: '/money/budget' },
  ],
  deliver: [
    { label: 'Episode board', href: '/deliver/board' },
    { label: 'Reviews', href: '/deliver/reviews' },
    { label: 'Channel delivery', href: '/deliver/channel' },
  ],
} satisfies Record<string, NavItem[]>;
