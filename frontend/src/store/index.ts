import { create } from "zustand";

interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  isActive: boolean;
}

interface AppState {
  token: string | null;
  user: { id: string; email: string } | null;
  activeConnection: Connection | null;
  connections: Connection[];
  theme: "dark" | "light";
  isDemoMode: boolean;
  searchOpen: boolean;

  setAuth: (token: string | null, user: { id: string; email: string } | null) => void;
  setActiveConnection: (conn: Connection | null) => void;
  setConnections: (conns: Connection[]) => void;
  toggleTheme: () => void;
  setDemoMode: (val: boolean) => void;
  setSearchOpen: (val: boolean) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  token: localStorage.getItem("token"),
  user: localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user")!) : null,
  activeConnection: null,
  connections: [],
  theme: "dark",
  isDemoMode: true,
  searchOpen: false,

  setAuth: (token, user) => {
    if (token) {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    set({ token, user });
  },

  setActiveConnection: (conn) => set({ activeConnection: conn }),
  setConnections: (connections) => set({ connections }),
  toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
  setDemoMode: (isDemoMode) => set({ isDemoMode }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null, activeConnection: null });
  }
}));
