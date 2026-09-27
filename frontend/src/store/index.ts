import { create } from "zustand";

export interface DatabaseConnection {
  id: string;
  name: string;
  databaseType: string;
  host: string;
  port: number;
  database: string;
  schema?: string;
  username: string;
  ssl: boolean;
  readOnly: boolean;
  isActive: boolean;
  status: string;
  lastCheckedAt?: string;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AppState {
  token: string | null;
  user: { id: string; email: string } | null;
  activeConnection: DatabaseConnection | null;
  connections: DatabaseConnection[];
  theme: "dark" | "light";
  searchOpen: boolean;

  setAuth: (token: string | null, user: { id: string; email: string } | null) => void;
  setActiveConnection: (conn: DatabaseConnection | null) => void;
  setConnections: (conns: DatabaseConnection[]) => void;
  toggleTheme: () => void;
  setSearchOpen: (val: boolean) => void;
  logout: () => void;
}

const getInitialToken = () => {
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem("token") || "sqlsense_local_session_token";
  }
  return "sqlsense_local_session_token";
};

const getInitialUser = () => {
  if (typeof localStorage !== "undefined") {
    const u = localStorage.getItem("user");
    if (u) {
      try {
        return JSON.parse(u);
      } catch (e) {
        // fallback
      }
    }
  }
  return { id: "admin-user", email: "admin@sqlsense.local" };
};

export const useAppStore = create<AppState>((set) => ({
  token: getInitialToken(),
  user: getInitialUser(),
  activeConnection: null,
  connections: [],
  theme: "dark",
  searchOpen: false,

  setAuth: (token, user) => {
    if (typeof localStorage !== "undefined") {
      if (token) {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }
    set({ token, user });
  },

  setActiveConnection: (conn) => set({ activeConnection: conn }),
  setConnections: (connections) => set({ connections }),
  toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  logout: () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    set({ token: null, user: null, activeConnection: null });
  },
}));
