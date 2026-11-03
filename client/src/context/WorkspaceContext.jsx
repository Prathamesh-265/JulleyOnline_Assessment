// Which organization / branch (tenant) / board the user is looking at, plus the
// lists that feed the selectors. Everything comes from the API, nothing is hardcoded.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { RANK } from '../utils/roles';

const WorkspaceContext = createContext(null);
export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceProvider({ children }) {
  const [orgs, setOrgs] = useState(null);
  const [orgId, setOrgId] = useState(() => localStorage.getItem('orgId'));
  const [tenantId, setTenantId] = useState(() => localStorage.getItem('tenantId'));
  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [members, setMembers] = useState([]);

  const reloadOrgs = useCallback(() => api.get('/organizations').then(setOrgs).catch(() => setOrgs([])), []);
  useEffect(() => {
    reloadOrgs();
  }, [reloadOrgs]);

  // stored ids are only hints: fall back to the first thing the user can actually reach
  const org = orgs?.find((o) => o.id === orgId) ?? orgs?.[0] ?? null;
  const tenant = org?.tenants.find((t) => t.id === tenantId) ?? org?.tenants[0] ?? null;
  const tid = tenant?.id ?? null;
  const isAdmin = RANK[tenant?.role] >= RANK.TENANT_ADMIN;

  useEffect(() => {
    if (org) localStorage.setItem('orgId', org.id);
    if (tid) localStorage.setItem('tenantId', tid);
  }, [org?.id, tid]);

  // ignore responses that belong to a branch we've already switched away from
  const activeTenant = useRef(tid);
  activeTenant.current = tid;

  const reloadBoards = useCallback(async () => {
    if (!tid) return;
    const list = await api.get(`/boards?tenantId=${tid}`).catch(() => null);
    if (!list || activeTenant.current !== tid) return;
    setBoards(list);
    setBoardId((cur) => (list.some((b) => b.id === cur) ? cur : (list[0]?.id ?? null)));
  }, [tid]);

  const reloadMembers = useCallback(async () => {
    if (!tid) return;
    const list = await api.get(`/tenants/${tid}/members`).catch(() => null);
    if (list && activeTenant.current === tid) setMembers(list);
  }, [tid]);

  useEffect(() => {
    // switching branch: drop the previous branch's data first so nothing stale shows
    setBoards([]);
    setBoardId(null);
    setMembers([]);
    reloadBoards();
    reloadMembers();
  }, [tid, reloadBoards, reloadMembers]);

  const value = useMemo(
    () => ({
      orgs, org, tenant, isAdmin, boards, boardId, members,
      selectOrg: (id) => {
        setOrgId(id);
        setTenantId(null);
      },
      selectTenant: setTenantId,
      selectBoard: setBoardId,
      reloadOrgs, reloadBoards, reloadMembers,
    }),
    [orgs, org, tenant, isAdmin, boards, boardId, members, reloadOrgs, reloadBoards, reloadMembers],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
