import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import PresenceIndicator from '../collab/PresenceIndicator';
import Avatar from '../ui/Avatar';
import { OrgSelector, TenantSwitcher } from './Selectors';

export default function Navbar({ users, onPanel, onError }) {
  const { user, logout } = useAuth();
  const { orgs, org } = useWorkspace();

  return (
    <header className="navbar">
      <Link to="/" className="logo">
         Syncboard
      </Link>

      {org && (
        <div className="nav-selectors">
          <OrgSelector />
          <TenantSwitcher onError={onError} />
        </div>
      )}

      <div className="nav-right">
        {orgs?.length > 0 && <PresenceIndicator users={users} />}
        {org && (
          <button className="btn ghost small" onClick={() => onPanel('members')}>
            Members
          </button>
        )}
        <Avatar user={user} size={32} />
        <button className="btn ghost small" onClick={logout}>
          Log out
        </button>
      </div>
    </header>
  );
}
