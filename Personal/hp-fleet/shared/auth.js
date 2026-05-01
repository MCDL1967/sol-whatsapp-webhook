/**
 * HP Fleet — Shared Auth Module
 * Embedded JSON user store (replace with API call in production)
 * Roles: ADMIN | OPERATOR | REVIEWER | READONLY
 */

const HPFLEET_AUTH = (() => {

  // ── USER STORE ─────────────────────────────────────────
  // Edit this array directly to manage users until backend is ready.
  // WARNING: Never commit real passwords to a public repo.
  // Use environment variables or a backend auth service in production.
  const USERS = [
    {
      id: "u001",
      name: "Marcelo C.",
      email: "marcelo@hp-fleet.com",
      pwd: "admin1234",
      role: "ADMIN",
      status: "active",
      created: "2025-01-15",
      lastLogin: null
    },
    {
      id: "u002",
      name: "Asistente FM",
      email: "asistente@flymax.com",
      pwd: "fm2025",
      role: "OPERATOR",
      status: "active",
      created: "2025-02-01",
      lastLogin: null
    },
    {
      id: "u003",
      name: "Revisor Facturación",
      email: "revisor@hp-fleet.com",
      pwd: "rev2025",
      role: "REVIEWER",
      status: "active",
      created: "2025-02-10",
      lastLogin: null
    },
    {
      id: "u004",
      name: "Vista MAG",
      email: "vista@mag.com",
      pwd: "mag2025",
      role: "READONLY",
      status: "inactive",
      created: "2025-03-01",
      lastLogin: null
    }
  ];

  // ── ROLE PERMISSIONS ───────────────────────────────────
  const PERMISSIONS = {
    ADMIN:    ["view","edit","submit","approve","admin","export"],
    OPERATOR: ["view","edit","submit","export"],
    REVIEWER: ["view","approve","export"],
    READONLY: ["view"]
  };

  // ── SESSION (in-memory only, cleared on refresh) ───────
  let _session = null;

  // ── PUBLIC API ─────────────────────────────────────────
  return {

    /** Attempt login. Returns user object or null. */
    login(email, pwd) {
      const user = USERS.find(u =>
        u.email === email &&
        u.pwd === pwd &&
        u.status === "active"
      );
      if (!user) return null;
      user.lastLogin = new Date().toISOString();
      _session = { ...user };
      return _session;
    },

    logout() { _session = null; },

    getSession() { return _session; },

    isLoggedIn() { return _session !== null; },

    /** Check if current user has a specific permission */
    can(permission) {
      if (!_session) return false;
      return (PERMISSIONS[_session.role] || []).includes(permission);
    },

    /** Check role directly */
    hasRole(role) {
      return _session?.role === role;
    },

    /** Get all users (ADMIN only) */
    getUsers() {
      if (!this.can("admin")) return [];
      return USERS;
    },

    /** Create user (ADMIN only) */
    createUser(data) {
      if (!this.can("admin")) return { ok: false, error: "Unauthorized" };
      const dup = USERS.find(u => u.email === data.email);
      if (dup) return { ok: false, error: "Email already exists" };
      const newUser = {
        id: "u" + Date.now(),
        name: data.name,
        email: data.email,
        pwd: data.pwd,
        role: data.role,
        status: data.status || "active",
        created: new Date().toISOString().slice(0, 10),
        lastLogin: null
      };
      USERS.push(newUser);
      return { ok: true, user: newUser };
    },

    /** Update user (ADMIN only) */
    updateUser(id, data) {
      if (!this.can("admin")) return { ok: false, error: "Unauthorized" };
      const user = USERS.find(u => u.id === id);
      if (!user) return { ok: false, error: "User not found" };
      Object.assign(user, data);
      return { ok: true, user };
    },

    /** Delete user (ADMIN only, cannot delete self) */
    deleteUser(id) {
      if (!this.can("admin")) return { ok: false, error: "Unauthorized" };
      if (_session?.id === id) return { ok: false, error: "Cannot delete yourself" };
      const idx = USERS.findIndex(u => u.id === id);
      if (idx === -1) return { ok: false, error: "User not found" };
      USERS.splice(idx, 1);
      return { ok: true };
    },

    /** Toggle user active/inactive */
    toggleStatus(id) {
      if (!this.can("admin")) return { ok: false, error: "Unauthorized" };
      if (_session?.id === id) return { ok: false, error: "Cannot deactivate yourself" };
      const user = USERS.find(u => u.id === id);
      if (!user) return { ok: false, error: "User not found" };
      user.status = user.status === "active" ? "inactive" : "active";
      return { ok: true, user };
    },

    PERMISSIONS,

    getRoleLabel(role, lang = "en") {
      const labels = {
        en: { ADMIN: "Administrator", OPERATOR: "Operator", REVIEWER: "Reviewer", READONLY: "Read Only" },
        es: { ADMIN: "Administrador", OPERATOR: "Operador", REVIEWER: "Revisor", READONLY: "Solo Lectura" }
      };
      return labels[lang]?.[role] || role;
    }
  };
})();
