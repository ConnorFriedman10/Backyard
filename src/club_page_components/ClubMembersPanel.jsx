import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { hexToRgba, roleColorStyle } from '../lib/roleColor';
import borderHorizontalImg from '../assets/border-horizontal.svg';
import dividerLineImg from '../assets/border-horizontal-gray.svg';
import './ClubMembersPanel.css';
import { Skeleton, SkeletonCircle, SkeletonRegion } from '../components/Skeleton';
import Avatar from '../components/Avatar';

const ROLE_LABEL = {
  top_moderator: 'Owner',
  moderator: 'Moderator',
  member: 'Member',
};

// Same palette StatsModule.jsx uses for its stat bars.
const ROLE_COLORS = [
  '#724200ff', '#56758b', '#be2419ff', '#da781cff',
  '#ffcc13', '#628753ff', '#a39a96', '#d3d1c9ff',
];

// ── Sub-components ────────────────────────────────────────────────────────────

function MemberCard({ entry, myRole, currentUserId, customRoles, onAssignCustomRole, onChangeRole, onTransferOwnership, onRemoveMember }) {
  const { user_id, role, profiles, club_custom_roles } = entry;
  const canManage = myRole === 'moderator' || myRole === 'top_moderator';
  const isOwner = myRole === 'top_moderator';
  const isSelf = user_id === currentUserId;
  const isTargetOwner = role === 'top_moderator';

  // Mods only see non-privileged roles in the dropdown; owners see all
  const availableRoles = isOwner
    ? customRoles
    : customRoles.filter((r) => !r.grants_moderator_privileges);

  return (
    <div className="member-card">
      {/* Was a blank grey circle for anyone without a photo, so a roster of members
          without photos was a column of identical placeholders. */}
      <Avatar
        className="member-avatar"
        url={profiles?.avatar_url}
        firstName={profiles?.first_name}
        lastName={profiles?.last_name}
        username={profiles?.username}
      />

      <div className="member-info">
        <span className="member-username">{profiles?.username ?? 'Unknown'}</span>
        <div className="member-badge-row">
          <span className={`role-badge role-badge--${role}`}>{ROLE_LABEL[role]}</span>
          {club_custom_roles?.name && (
            <span
              className="role-badge member-custom-role"
              style={roleColorStyle(club_custom_roles.role_color)}
            >
              {club_custom_roles.name}
            </span>
          )}
        </div>
      </div>

      {canManage && !isSelf && !isTargetOwner && (
        <div className="member-card__controls">
          <select
            className="member-role-select"
            value={entry.custom_role_id ?? ''}
            onChange={(e) => onAssignCustomRole(user_id, e.target.value || null, entry.role)}
          >
            <option value="">No custom role</option>
            {availableRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.grants_moderator_privileges ? ' *' : ''}
              </option>
            ))}
          </select>

          {isOwner && (
            role === 'member' ? (
              <button
                className="member-role-btn member-role-btn--promote"
                onClick={() => onChangeRole(user_id, 'moderator')}
              >
                Make Moderator
              </button>
            ) : (
              <>
                <button
                  className="member-role-btn member-role-btn--demote"
                  onClick={() => onChangeRole(user_id, 'member')}
                >
                  Demote
                </button>
                <button
                  className="member-role-btn member-role-btn--transfer"
                  onClick={() => onTransferOwnership(user_id, profiles?.username)}
                >
                  Transfer Ownership
                </button>
              </>
            )
          )}
          {(role === 'member' || (role === 'moderator' && isOwner)) && (
            <button
              className="member-role-btn member-role-btn--remove"
              onClick={() => onRemoveMember(user_id, profiles?.username)}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ManageRolesPanel({ clubId, customRoles, myRole, onClose, onRolesChange }) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(null);
  const [newPrivileged, setNewPrivileged] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const isOwner = myRole === 'top_moderator';

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      await apiFetch(`/clubs/${clubId}/roles`, {
        method: 'POST',
        body: { name: newName.trim(), grants_moderator_privileges: newPrivileged, role_color: newColor },
      });
      setNewName('');
      setNewColor(null);
      setNewPrivileged(false);
      await onRolesChange();
    } catch (err) {
      setError(err?.message ?? 'Failed to create role.');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(roleId) {
    setError(null);
    try {
      await apiFetch(`/clubs/${clubId}/roles/${roleId}`, { method: 'DELETE' });
      await onRolesChange();
    } catch (err) {
      setError(err?.message ?? 'Failed to delete role.');
    }
  }

  return (
    <div className="manage-roles-panel">
      <div className="manage-roles-panel__header">
        <div className="duo-btn-wrap">
          <div className="duo-btn-pill" aria-hidden="true" />
          <button
            className="manage-roles-panel__close duo-btn"
            style={{ '--duo-shadow': 'rgb(0, 0, 0)' }}
            onClick={onClose}
          >
            Save
          </button>
        </div>
      </div>
      <div className="module-view-divider">
        <div className="divider" style={{ backgroundImage: `url(${borderHorizontalImg})` }} aria-hidden="true" />
      </div>

      {error && <p className="club-members-panel__error">{error}</p>}

      <p className="manage-roles-panel__title">Custom Roles</p>
      <ul className="manage-roles-panel__list">
        {customRoles.length === 0 && (
          <li className="manage-roles-panel__empty">No custom roles yet.</li>
        )}
        {customRoles.map((r) => {
          const canDelete = isOwner || !r.grants_moderator_privileges;
          return (
            <li key={r.id} className="manage-roles-panel__item">
              <div className="manage-roles-panel__item-badge" style={roleColorStyle(r.role_color)}>
                <span className="manage-roles-panel__role-name">{r.name}</span>
                {r.grants_moderator_privileges && (
                  <span
                    className="manage-roles-panel__priv-tag"
                    title="Assigning this role grants moderator access"
                  >
                    mod access
                  </span>
                )}
              </div>
              {canDelete && (
                <button
                  className="manage-roles-panel__delete"
                  onClick={() => handleDelete(r.id)}
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="module-view-divider">
        <div className="divider" style={{ backgroundImage: `url(${dividerLineImg})` }} aria-hidden="true" />
      </div>

      <form className="manage-roles-panel__form" onSubmit={handleAdd}>
        <input
          className="manage-roles-panel__input"
          placeholder="Role name (e.g. Eboard)"
          value={newName}
          maxLength={40}
          onChange={(e) => setNewName(e.target.value)}
          style={{ ...roleColorStyle(newColor), background: newColor ? hexToRgba(newColor, 0.4) : '#fff' }}
        />

        <span className="manage-roles-panel__color-label">Choose Role Color</span>
        <div className="manage-roles-panel__color-row">
          {ROLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`manage-roles-panel__color-swatch${newColor === c ? ' selected' : ''}`}
              style={roleColorStyle(c)}
              aria-label={c}
              aria-pressed={newColor === c}
              onClick={() => setNewColor(newColor === c ? null : c)}
            />
          ))}
        </div>

        <label className="manage-roles-panel__toggle-label manage-roles-panel__color-label">
          <input
            type="checkbox"
            className="manage-roles-panel__checkbox"
            checked={newPrivileged}
            onChange={(e) => setNewPrivileged(e.target.checked)}
            disabled={!isOwner}
          />
          Grants moderator access
        </label>
        <div className="duo-btn-wrap">
          <div className="duo-btn-pill" aria-hidden="true" />
          <button
            type="submit"
            className="manage-roles-panel__add-btn duo-btn"
            style={{ '--duo-shadow': '#1c2a44' }}
            disabled={adding || !newName.trim()}
          >
            {adding ? '...' : 'Add Role'}
          </button>
        </div>
      </form>

      {isOwner && (
        <p className="manage-roles-panel__hint">
          * Roles marked with "mod access" can only be created and assigned by you.
          Assigning one will also grant the member moderator privileges.
        </p>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ClubMembersPanel({ clubId, joinPolicy, myRole, currentUserId, onMembershipChange, onJoinPolicyChange }) {
  const [members, setMembers] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showManageRoles, setShowManageRoles] = useState(false);

  const [joinRequests, setJoinRequests] = useState([]);
  const [signedOut, setSignedOut] = useState(false);

  const canManage = myRole === 'moderator' || myRole === 'top_moderator';

  // These two dropped `auth: false`. The roster is no longer public — it was handing
  // every club's membership list to anonymous callers — so the token has to go with it.
  async function fetchMembers() {
    try {
      const data = await apiFetch(`/clubs/${clubId}/members`);
      setMembers(data || []);
      setSignedOut(false);
    } catch (err) {
      // A signed-out visitor is an expected state now, not a failure, so it gets its
      // own message instead of the red error banner.
      if (err?.status === 401) setSignedOut(true);
      else setError(err?.message ?? 'Failed to load members.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchRoles() {
    try {
      const data = await apiFetch(`/clubs/${clubId}/roles`);
      setCustomRoles(data || []);
    } catch {
      // non-fatal — panel still works without custom roles
    }
  }

  async function fetchJoinRequests() {
    if (!canManage) return;
    try {
      const data = await apiFetch(`/clubs/${clubId}/join-requests`);
      setJoinRequests(data || []);
    } catch {
      // Non-fatal: an open club simply has none, and a failure here must not stop the
      // roster itself from rendering.
    }
  }

  async function decideRequest(userId, decision) {
    setError(null);
    try {
      await apiFetch(`/clubs/${clubId}/join-requests/${userId}/${decision}`, { method: 'POST' });
      setJoinRequests((prev) => prev.filter((r) => r.user_id !== userId));
      if (decision === 'approve') await fetchMembers();
    } catch (err) {
      setError(err?.message ?? `Failed to ${decision} request.`);
    }
  }

  useEffect(() => {
    fetchMembers();
    fetchRoles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  // Separate from the roster fetch above. myRole often resolves a moment after mount, so
  // keying the two together would refetch the whole member list every time the viewer's
  // role landed — twice per club open, for a list that had not changed.
  useEffect(() => {
    fetchJoinRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, canManage]);

  async function handleAssignCustomRole(userId, customRoleId, currentMechanicalRole) {
    setError(null);
    // Warn before silently granting moderator access
    if (customRoleId) {
      const role = customRoles.find((r) => r.id === customRoleId);
      if (role?.grants_moderator_privileges && currentMechanicalRole === 'member') {
        const confirmed = window.confirm(
          `Assigning "${role.name}" will also grant this member moderator access. Continue?`
        );
        if (!confirmed) return;
      }
    }
    try {
      await apiFetch(`/clubs/${clubId}/members/${userId}`, {
        method: 'PATCH',
        body: { customRoleId: customRoleId ?? null },
      });
      await fetchMembers();
    } catch (err) {
      setError(err?.message ?? 'Failed to assign role.');
    }
  }

  async function handleChangeRole(userId, newRole) {
    setError(null);
    try {
      await apiFetch(`/clubs/${clubId}/members/${userId}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      await fetchMembers();
    } catch (err) {
      setError(err?.message ?? 'Failed to change role.');
    }
  }

  async function handleRemoveMember(userId, username) {
    const confirmed = window.confirm(
      `Remove ${username ?? 'this member'} from the club?`
    );
    if (!confirmed) return;
    setError(null);
    try {
      await apiFetch(`/clubs/${clubId}/members/${userId}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setError(err?.message ?? 'Failed to remove member.');
    }
  }

  async function handleTransferOwnership(userId, username) {
    const confirmed = window.confirm(
      `Transfer ownership to ${username ?? 'this member'}? You will become a moderator.`
    );
    if (!confirmed) return;
    setError(null);
    try {
      await apiFetch(`/clubs/${clubId}/members/transfer-ownership`, {
        method: 'POST',
        body: { newTopModeratorId: userId },
      });
      if (onMembershipChange) onMembershipChange('moderator');
      await fetchMembers();
    } catch (err) {
      setError(err?.message ?? 'Failed to transfer ownership.');
    }
  }

  if (showManageRoles) {
    return (
      <ManageRolesPanel
        clubId={clubId}
        customRoles={customRoles}
        myRole={myRole}
        onClose={() => setShowManageRoles(false)}
        onRolesChange={async () => {
          await fetchRoles();
          await fetchMembers();
        }}
      />
    );
  }

  return (
    <div className="club-members-panel">
      <div className="club-members-panel__header">
        <span className="club-members-panel__count">
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </span>
        <div className="club-members-panel__header-actions">
          {canManage && (
            <>
              <div className="duo-btn-wrap">
                <div className="duo-btn-pill" aria-hidden="true" />
                <button
                  className="manage-roles-btn duo-btn"
                  style={{ '--duo-shadow': '#1c2a44' }}
                  onClick={() => setShowManageRoles(true)}
                >
                  Manage Roles
                </button>
              </div>
              <div className="duo-btn-wrap">
                <div className="duo-btn-pill" aria-hidden="true" />
                <button
                  className="manage-roles-btn duo-btn"
                  style={{ '--duo-shadow': '#1c2a44' }}
                  onClick={onJoinPolicyChange}
                >
                  Change Join Policy to {joinPolicy === 'open' ? 'Request' : 'Open'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="module-view-divider">
        <div className="divider" style={{ backgroundImage: `url(${borderHorizontalImg})` }} aria-hidden="true" />
      </div>

      {error && <p className="club-members-panel__error">{error}</p>}

      {signedOut && (
        <p className="club-members-panel__signed-out">
          Sign in to see who&apos;s in this club.
        </p>
      )}

      {canManage && joinRequests.length > 0 && (
        <div className="join-requests">
          <h3 className="join-requests__heading">
            Pending {joinRequests.length === 1 ? 'request' : 'requests'} ({joinRequests.length})
          </h3>
          {joinRequests.map((request) => (
            <div key={request.user_id} className="join-request-row">
              <img
                className="join-request-row__avatar"
                src={request.avatar_url || '/raccoon_pfp.png'}
                alt=""
              />
              <span className="join-request-row__name">{request.username ?? 'Unknown user'}</span>
              <div className="join-request-row__actions">
                <button
                  type="button"
                  className="join-request-btn approve"
                  onClick={() => decideRequest(request.user_id, 'approve')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="join-request-btn deny"
                  onClick={() => decideRequest(request.user_id, 'deny')}
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonRegion label="Loading members">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
              <SkeletonCircle size={36} />
              <Skeleton width="45%" height="1rem" />
            </div>
          ))}
        </SkeletonRegion>
      ) : members.length === 0 ? (
        <p className="club-members-panel__empty">No members yet.</p>
      ) : (
        <div className="club-members-panel__list">
          {members.map((entry) => (
            <MemberCard
              key={entry.user_id}
              entry={entry}
              myRole={myRole}
              currentUserId={currentUserId}
              customRoles={customRoles}
              onAssignCustomRole={handleAssignCustomRole}
              onChangeRole={handleChangeRole}
              onTransferOwnership={handleTransferOwnership}
              onRemoveMember={handleRemoveMember}
            />
          ))}
        </div>
      )}
    </div>
  );
}
