export interface IMemory {
  id: string;
  content: string;
  updatedAt: string;
}

export interface IUser {
  uid: string;
  email: string;
  name: string;
  avatar: string;
  createdAt: string;
  updatedAt: string;
  occupation: string;
  userPreferences: string;
  memories: IMemory[];
  memoryEnabled: boolean;
}

export const MAX_USER_MEMORIES = 40;
export const MAX_MEMORY_CONTENT_LENGTH = 500;

export const generateDefaultUser = (uid: string): IUser => ({
  uid,
  email: "",
  name: "",
  avatar: "",
  occupation: "",
  userPreferences: "",
  memories: [],
  memoryEnabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
