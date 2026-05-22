export const WAITLIST_JOINED_KEY = "waitlist-joined";

export const markWaitlistJoined = () =>
  sessionStorage.setItem(WAITLIST_JOINED_KEY, "1");

export const hasJoinedWaitlist = () =>
  sessionStorage.getItem(WAITLIST_JOINED_KEY) === "1";

export const clearWaitlistJoined = () =>
  sessionStorage.removeItem(WAITLIST_JOINED_KEY);
