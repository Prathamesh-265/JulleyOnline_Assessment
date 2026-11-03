import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../services/api';
import InlineAdd from '../ui/InlineAdd';

// Shown when the user has no organization yet, or their organization has no branch.
export default function EmptyWorkspace({ onError }) {
  const { org, reloadOrgs } = useWorkspace();

  const create = (path, body) => async (name) => {
    try {
      await api.post(path, { ...body, name });
      await reloadOrgs();
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <div className="empty glass">
      {!org ? (
        <>
          <h2>Start your organization</h2>
          <p className="muted">You are not part of any organization yet. Create one (you become its Org Admin), or ask an admin to add you to theirs.</p>
          <InlineAdd label="Create organization" placeholder="Company name" onSubmit={create('/organizations', {})} />
        </>
      ) : (
        <>
          <h2>No branches yet</h2>
          <p className="muted">{org.name} has no branch you can access.</p>
          {org.isOrgAdmin && <InlineAdd label="Add the first branch" placeholder="e.g. Hyderabad" onSubmit={create('/tenants', { organizationId: org.id })} />}
        </>
      )}
    </div>
  );
}
