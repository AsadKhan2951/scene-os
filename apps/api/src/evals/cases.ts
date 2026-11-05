/**
 * Fixed inputs for the live evals. Small on purpose: a run costs a few cents and finishes in
 * about a minute. Add a case whenever a real output goes wrong, so it never comes back.
 */

export const SCENES = [
  {
    number: 1,
    text: `INT. HAVELI COURTYARD, LAHORE - NIGHT
Lanterns hang from the neem tree. MANNAT (24) folds her dupatta, eyes on the gate.
NANI (70) sits on a charpai with a tasbih.
NANI
Itni raat ko kis ka intezar hai, beta?
MANNAT
Kisi ka nahi, Nani. Bas neend nahi aa rahi.
A motorbike stops outside. Headlight through the jali.`,
  },
  {
    number: 2,
    text: `EXT. GWADAR FISH HARBOUR - DAWN
Thirty DOCK HANDS haul nets onto the jetty. RAZA (30) jumps from a boat, a sealed packet under his kameez.
A police jeep idles at the far end. Raza turns his back to it and walks fast.`,
  },
] as const;

/** Places and moments for the art direction check: the picture prompt must stay Pakistani. */
export const LOOK_PROMPTS = [
  'A wedding mehndi night in a middle-class Karachi home, the bride\'s cousins dancing.',
  'A morning market in old Lahore near Delhi Gate, a mother buying vegetables with her son.',
  'A family dinner in Islamabad on Eid, three generations at one table.',
];

export const RATE_CARD_PROJECT = { format: 'drama_serial', country: 'Pakistan', currency: 'PKR', episodes: 24, title: 'Eval serial' };

/** Saved good and bad outputs, graded offline in unit tests so the graders themselves are checked. */
export const GOLDEN = {
  goodUrdu: 'Itni raat ko kis ka intezar hai, beta? Shukriya, Nani.',
  badUrdu: 'Dhanyavaad, pita ji. Aapka aashirwad chahiye.',
  goodLook: 'A courtyard in Lahore at night, lanterns, women in shalwar kameez and dupattas, a charpai.',
  badLook: 'A bride with sindoor and a mangalsutra at a Diwali party in Mumbai.',
};
