import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAppStore } from "./store";
import { AppLayout } from "./layouts/AppLayout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./features/dashboard";
import { SqlAnalyzer } from "./features/sql-analyzer";
import { QueryOptimizer } from "./features/optimizer";
import { ExecutionPlans } from "./features/execution-plan";
import { SchemaExplorer } from "./features/schema";
import { IndexAdvisor } from "./features/indexes";
import { StoredProcedures, Views, Functions, Triggers } from "./features/procedures";
import { Performance } from "./features/performance";
import { Recommendations } from "./features/recommendations";
import { QueryHistory } from "./features/history";
import { SettingsPage } from "./features/settings";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = useAppStore((state) => state.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Dashboard and Features */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/sql-analyzer" element={<ProtectedRoute><SqlAnalyzer /></ProtectedRoute>} />
        <Route path="/optimizer" element={<ProtectedRoute><QueryOptimizer /></ProtectedRoute>} />
        <Route path="/execution-plans" element={<ProtectedRoute><ExecutionPlans /></ProtectedRoute>} />
        <Route path="/schema-explorer" element={<ProtectedRoute><SchemaExplorer /></ProtectedRoute>} />
        <Route path="/index-advisor" element={<ProtectedRoute><IndexAdvisor /></ProtectedRoute>} />
        <Route path="/procedures" element={<ProtectedRoute><StoredProcedures /></ProtectedRoute>} />
        <Route path="/views" element={<ProtectedRoute><Views /></ProtectedRoute>} />
        <Route path="/functions" element={<ProtectedRoute><Functions /></ProtectedRoute>} />
        <Route path="/triggers" element={<ProtectedRoute><Triggers /></ProtectedRoute>} />
        <Route path="/performance" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
        <Route path="/recommendations" element={<ProtectedRoute><Recommendations /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><QueryHistory /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* Wildcard redirect */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
