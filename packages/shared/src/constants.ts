export const PHASES = ['pre_production', 'production', 'post_production'] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABELS: Record<Phase, string> = {
  pre_production: 'Pre-production',
  production: 'Production',
  post_production: 'Post-production',
};

/** The 15-stage pipeline every new production starts with. */
export const PIPELINE_STAGES: { order: number; name: string; phase: Phase }[] = [
  { order: 1, name: 'Content / Concept', phase: 'pre_production' },
  { order: 2, name: 'One Liner', phase: 'pre_production' },
  { order: 3, name: '4 Episodes Lock', phase: 'pre_production' },
  { order: 4, name: 'Writer Contract Finalization', phase: 'pre_production' },
  { order: 5, name: 'Characterization', phase: 'pre_production' },
  { order: 6, name: '15 Episodes Lock', phase: 'pre_production' },
  { order: 7, name: 'Casting & Cast Brief', phase: 'pre_production' },
  { order: 8, name: 'Going on Floor', phase: 'pre_production' },
  { order: 9, name: 'Production / On Floor', phase: 'production' },
  { order: 10, name: 'Offline Edit', phase: 'post_production' },
  { order: 11, name: 'Online Edit / Colour Grade', phase: 'post_production' },
  { order: 12, name: 'Sound Mix & Music', phase: 'post_production' },
  { order: 13, name: 'Episode QC', phase: 'post_production' },
  { order: 14, name: 'Delivery to Channel', phase: 'post_production' },
  { order: 15, name: 'TX / On-Air', phase: 'post_production' },
];
export const STAGE_STATUSES = ['pending', 'in_progress', 'completed'] as const;

export const ROLES = ['admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

/** The first four are the original serial formats; the rest come with Scene OS 2.0. */
export const PRODUCTION_FORMATS = ['long_serial', 'short_serial', 'telefilm', 'web_series', 'feature_film', 'series', 'micro_drama', 'short_film', 'documentary', 'commercial'] as const;

/** Each project picks how its pictures and plans look. The Pakistani serial preset is the original rules. */
export const STYLE_PRESETS = ['pakistani_serial', 'realistic_drama', 'neo_noir_thriller', 'korean_melodrama', 'nordic_minimal', 'documentary_handheld'] as const;
export type StylePreset = (typeof STYLE_PRESETS)[number];
export const STYLE_PRESET_LABELS: Record<StylePreset, string> = {
  pakistani_serial: 'Pakistani serial',
  realistic_drama: 'Realistic drama',
  neo_noir_thriller: 'Neo-noir thriller',
  korean_melodrama: 'Korean melodrama',
  nordic_minimal: 'Nordic minimal',
  documentary_handheld: 'Documentary handheld',
};

/** Which stage flow a project tracks: the original 15 Pakistani serial stages, or the international flow. */
export const STAGE_FLOWS = ['pakistani_15', 'international'] as const;
export const INTERNATIONAL_STAGES: { order: number; name: string; phase: Phase }[] = [
  { order: 1, name: 'Development', phase: 'pre_production' },
  { order: 2, name: 'Pre-production', phase: 'pre_production' },
  { order: 3, name: 'Production', phase: 'production' },
  { order: 4, name: 'Post-production', phase: 'post_production' },
  { order: 5, name: 'Delivery', phase: 'post_production' },
  { order: 6, name: 'Distribution', phase: 'post_production' },
];
export const PRODUCTION_STATUSES = ['active', 'on_hold', 'completed', 'cancelled'] as const;

export const WRITING_FORMATS = ['drama_serial', 'telefilm', 'pilot', 'web_series', 'feature_film', 'series', 'micro_drama', 'short_film', 'documentary', 'commercial'] as const;
/** Script files Scene OS can read. InPage and Celtx scripts come in as PDF (or FDX from Celtx). */
export const SCRIPT_FILE_TYPES = ['.fdx', '.fountain', '.pdf', '.docx', '.txt'] as const;
export const CHARACTER_ROLES = ['lead', 'supporting', 'antagonist', 'minor'] as const;
export const LANGUAGES = ['english', 'roman_urdu', 'urdu'] as const;
export const SCRIPT_EPISODE_STATUSES = ['planned', 'drafting', 'written'] as const;
export const FRAME_STATUSES = ['queued', 'drawing', 'needs_image', 'needs_review', 'approved', 'failed'] as const;

export const MILESTONE_CATEGORIES = ['pre_production', 'production', 'post_production', 'delivery', 'other'] as const;
export const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed', 'delayed'] as const;

export const DEPARTMENTS = ['cast', 'direction', 'production', 'camera', 'sound', 'art', 'costume', 'makeup', 'post_production', 'other'] as const;
export const AVAILABILITY = ['available', 'on_set', 'unavailable'] as const;
export const CONTRACT_STATUSES = ['pending', 'signed', 'expired'] as const;

export const DOCUMENT_TYPES = ['script', 'contract', 'character_brief', 'storyboard', 'budget', 'schedule', 'other'] as const;

export const EXPENSE_CATEGORIES = ['location', 'lunch_catering', 'fuel_transport', 'props', 'makeup_hair', 'crew_wages', 'art_direction', 'wardrobe', 'equipment_rental', 'miscellaneous'] as const;
export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;

export const CALL_SHEET_STATUSES = ['draft', 'published'] as const;
export const CALL_ENTRY_TYPES = ['cast', 'crew', 'scene'] as const;

/** Per-episode status board columns, in delivery order. */
export const BOARD_STEPS = ['script', 'shoot', 'offlineEdit', 'onlineEdit', 'sound', 'qc', 'delivery'] as const;
export type BoardStep = (typeof BOARD_STEPS)[number];
export const BOARD_STEP_LABELS: Record<BoardStep, string> = {
  script: 'Script', shoot: 'Shoot', offlineEdit: 'Offline edit', onlineEdit: 'Online and grade',
  sound: 'Sound', qc: 'QC', delivery: 'Delivery',
};
export const STEP_STATUSES = ['pending', 'in_progress', 'done'] as const;

export const REVIEW_FIELDS = ['storyProgress', 'acting', 'cameraWork', 'dopLighting', 'wardrobe', 'colourCombinations', 'music', 'pacing', 'episodeEdit', 'adherenceToScript', 'episodeInterest', 'overall'] as const;
export const REVIEW_FIELD_LABELS: Record<(typeof REVIEW_FIELDS)[number], string> = {
  storyProgress: 'Story progress', acting: 'Acting', cameraWork: 'Camera work', dopLighting: 'DOP and lighting',
  wardrobe: 'Clothes and wardrobe', colourCombinations: 'Colour combinations', music: 'Music', pacing: 'Pacing',
  episodeEdit: 'Episode edit', adherenceToScript: 'Adherence to script', episodeInterest: 'Episode interest', overall: 'Overall rating',
};
export const SIGN_OFF_ROLES = ['producer', 'channelHead', 'ceo'] as const;

/** Turns a stored key like `fuel_transport` into "Fuel transport" for display. */
export function label(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
