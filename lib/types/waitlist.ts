export interface IWaitlistEntry {
  id: string;
  email: string;
  createdAt: string;
}

export const generateWaitlistEntry = (id: string, email: string): IWaitlistEntry => ({
  id,
  email: email.toLowerCase().trim(),
  createdAt: new Date().toISOString(),
});
