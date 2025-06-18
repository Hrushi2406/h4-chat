export interface IUser {
  uid: string;
  email: string;
  name: string;
  avatar: string;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
  occupation: string;
  userPreferences: string;
}

export const generateDefaultUser = (uid: string, isAnon: boolean): IUser => ({
  uid,
  email: "",
  name: "",
  avatar: "",
  isAnonymous: isAnon,
  occupation: "",
  userPreferences: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
