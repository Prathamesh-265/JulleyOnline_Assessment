import { useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { api } from "../../services/api";
import ConfirmDialog from "../ui/ConfirmDialog";
import Drawer from "../ui/Drawer";

// Rename / delete the current organization and branch, and start a new organization.
export default function SettingsPanel({ onClose }) {
  const { org, tenant, isAdmin, reloadOrgs, selectOrg } = useWorkspace();
  const [orgName, setOrgName] = useState(org.name);
  const [tenantName, setTenantName] = useState(tenant?.name ?? "");
  const [newOrg, setNewOrg] = useState("");
  const [confirm, setConfirm] = useState(null); // 'org' | 'tenant'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (action) => {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const renameOrg = (e) => {
    e.preventDefault();
    run(async () => {
      await api.put(`/organizations/${org.id}`, { name: orgName });
      await reloadOrgs();
    });
  };
  const renameTenant = (e) => {
    e.preventDefault();
    run(async () => {
      await api.put(`/tenants/${tenant.id}`, { name: tenantName });
      await reloadOrgs();
    });
  };
  const createOrg = (e) => {
    e.preventDefault();
    run(async () => {
      const created = await api.post("/organizations", { name: newOrg });
      await reloadOrgs();
      selectOrg(created.id);
      onClose();
    });
  };
  const remove = () =>
    run(async () => {
      await api.del(
        confirm === "org"
          ? `/organizations/${org.id}`
          : `/tenants/${tenant.id}`,
      );
      await reloadOrgs();
      onClose();
    });

  return (
    <Drawer title="Settings" onClose={onClose}>
      {org.isOrgAdmin && (
        <form className="stack settings-block" onSubmit={renameOrg}>
          <h3>Organization</h3>
          <div className="row-form">
            <input
              value={orgName}
              maxLength={120}
              onChange={(e) => setOrgName(e.target.value)}
              aria-label="Organization name"
            />
            <button
              className="btn small"
              disabled={busy || !orgName.trim() || orgName.trim() === org.name}
            >
              Save
            </button>
          </div>
          <button
            type="button"
            className="btn ghost small danger-text"
            onClick={() => setConfirm("org")}
          >
            Delete organization
          </button>
        </form>
      )}

      {tenant && isAdmin && (
        <form className="stack settings-block" onSubmit={renameTenant}>
          <h3>Branch</h3>
          <div className="row-form">
            <input
              value={tenantName}
              maxLength={120}
              onChange={(e) => setTenantName(e.target.value)}
              aria-label="Branch name"
            />
            <button
              className="btn small"
              disabled={
                busy || !tenantName.trim() || tenantName.trim() === tenant.name
              }
            >
              Save
            </button>
          </div>
          {org.isOrgAdmin && (
            <button
              type="button"
              className="btn ghost small danger-text"
              onClick={() => setConfirm("tenant")}
            >
              Delete branch
            </button>
          )}
        </form>
      )}

      <form className="stack settings-block" onSubmit={createOrg}>
        <h3>New organization</h3>
        <div className="row-form">
          <input
            placeholder="Company name"
            value={newOrg}
            maxLength={120}
            onChange={(e) => setNewOrg(e.target.value)}
            aria-label="New organization name"
          />
          <button className="btn small" disabled={busy || !newOrg.trim()}>
            Create
          </button>
        </div>
        <p className="muted meta">You become its Org Admin.</p>
      </form>

      {error && <p className="error">{error}</p>}

      {confirm && (
        <ConfirmDialog
          title={
            confirm === "org"
              ? "Delete this organization?"
              : "Delete this branch?"
          }
          message={
            confirm === "org"
              ? `"${org.name}" with all of its branches, boards and tasks will be permanently removed.`
              : `"${tenant.name}" with all of its boards and tasks will be permanently removed.`
          }
          confirmLabel={
            confirm === "org" ? "Delete organization" : "Delete branch"
          }
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Drawer>
  );
}
