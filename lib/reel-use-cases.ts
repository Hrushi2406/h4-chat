export type ReelUseCase = {
  /** Instagram reel shortcode — the `/reel/<code>/` segment of the URL. */
  code: string;
  title: string;
  description: string;
};

export const getInstagramReelUrl = (code: string) =>
  `https://www.instagram.com/reel/${code}/`;

/**
 * Cover frames live in `public/reels`. Instagram's own embed squashes 9:16
 * media into a 4:5 box and never plays inline anyway, so the cards render the
 * poster directly and link out to the reel.
 */
export const getReelPosterPath = (code: string) => `/reels/${code}.jpg`;

export const REEL_USE_CASES: ReelUseCase[] = [
  {
    code: "DbmTvr2MhUO",
    title: "Kaggle tournament",
    description: "Find the right competition, set up a plan, and start ranking.",
  },
  {
    code: "DbKlRDgsrNE",
    title: "Resume in LaTeX",
    description: "Turn your experience into a clean, recruiter-ready LaTeX CV.",
  },
  {
    code: "DbCmq2UsZ3p",
    title: "Quant developer study plan",
    description: "A week-by-week roadmap built around where you are today.",
  },
  {
    code: "DbAe7-1sMf2",
    title: "DSA help",
    description: "Walk through problems, patterns, and the intuition behind them.",
  },
  {
    code: "Da6zsDfsIfH",
    title: "Daily email digest",
    description: "Wake up to your inbox already read, sorted, and summarized.",
  },
  {
    code: "Da2lBEIssHL",
    title: "Open source contribution",
    description: "Pick a repo, find a good first issue, and ship the PR.",
  },
  {
    code: "DaqelF4sodX",
    title: "Internship prep",
    description: "Track applications, prep rounds, and follow up on time.",
  },
];
