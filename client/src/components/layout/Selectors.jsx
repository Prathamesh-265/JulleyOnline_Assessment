import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../services/api';
import { ROLE_LABEL } from '../../utils/roles';
import InlineAdd from '../ui/InlineAdd';

export function OrgSelector() {
  const { orgs, org, selectOrg } = useWorkspace();
  return (
    <label className="select">
      <span>Organization</span>
      <select value={org?.id ?? ''} onChange={(e) => selectOrg(e.target.value)}>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

export function TenantSwitcher({ onError }) {
  const { org, tenant, selectTenant, reloadOrgs } = useWorkspace();

  const addBranch = async (name) => {
    try {
      await api.post('/tenants', { organizationId: org.id, name });
      await reloadOrgs();
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <div className="switcher">
      <label className="select">
        <span>Branch</span>
        <select value={tenant?.id ?? ''} onChange={(e) => selectTenant(e.target.value)}>
          {org.tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      {tenant && <span className="chip">{ROLE_LABEL[tenant.role]}</span>}
      {org.isOrgAdmin && <InlineAdd label="Branch" placeholder="Branch name" onSubmit={addBranch} className="compact" />}
    </div>
  );
}
