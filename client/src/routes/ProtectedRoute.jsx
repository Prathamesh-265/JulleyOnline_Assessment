import { Navigate } from 'react-router-dom';
import Loader from '../components/ui/Loader';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader full label="Signing you in" />;
  return user ? children : <Navigate to="/login" replace />;
}