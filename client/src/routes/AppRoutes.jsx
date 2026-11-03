import { Navigate, Route, Routes } from 'react-router-dom';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import Auth from '../pages/Auth';
import Landing from '../pages/Landing';
import Workspace from '../pages/Workspace';
import ProtectedRoute from './ProtectedRoute';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <WorkspaceProvider>
              <Workspace />
            </WorkspaceProvider>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
