import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../services/api';
import { RANK, ROLE_LABEL } from '../../utils/roles';
import Avatar from '../ui/Avatar';
import Drawer from '../ui/Drawer';

// Who is in this branch. Tenant admins can add/remove members; only org admins can touch admins.
export default function MembersPanel({ onClose }) {
  const { user } = useAuth();
  const { org, tenant, members, isAdmin, reloadMembers } = useWorkspace();
  const [adminEmail, setAdminEmail] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [error, setError] = useState('');
  const isOrgAdmin = tenant.role === 'ORG_ADMIN';

  const run = async (action) => {
    setError('');
    try {
      await action();
      await reloadMembers();
    } catch (e) {
      setError(e.message);
    }
  };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/tenants/${tenant.id}/members`, { email, role });
      setEmail('');
    });
  };

  const addOrgAdmin = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/organizations/${org.id}/admins`, { email: adminEmail });
      setAdminEmail('');
    });
  };

  const canRemove = (m) =>
    m.role === 'ORG_ADMIN' ? isOrgAdmin && m.id !== user.id : isAdmin && (isOrgAdmin || RANK[m.role] < RANK.TENANT_ADMIN);
  const remove = (m) =>
    run(() => (m.role === 'ORG_ADMIN' ? api.del(`/organizations/${org.id}/admins/${m.id}`) : api.del(`/tenants/${tenant.id}/members/${m.id}`)));

  return (
    <Drawer title={`${tenant.name} members`} onClose={onClose}>
      <ul className="members">
        {members.map((m) => (
          <li key={m.id}>
            <Avatar user={m} size={32} />
            <div>
              <strong>{m.name}</strong>
              <span className="muted">{m.email}</span>
            </div>
            <span className="chip">{ROLE_LABEL[m.role]}</span>
            {canRemove(m) && (
              <button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {isAdmin && (
        <form className="stack" onSubmit={add}>
          <h3>Add a member</h3>
          <input type="email" required placeholder="Email of a registered user" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="MEMBER">Member</option>
            {isOrgAdmin && <option value="TENANT_ADMIN">Tenant Admin</option>}
          </select>
          {error && <p className="error">{error}</p>}
          <button className="btn">Add to {tenant.name}</button>
        </form>
      )}
      {isOrgAdmin && (
        <form className="stack" onSubmit={addOrgAdmin}>
          <h3>Add an organization admin</h3>
          <input type="email" required placeholder="Email of a registered user" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          <button className="btn ghost">Make Org Admin of {org.name}</button>
        </form>
      )}
      {!isAdmin && error && <p className="error">{error}</p>}
    </Drawer>
  );
}