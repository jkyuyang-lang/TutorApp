"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { roleColors } from "@/lib/status-colors";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TimeZonePicker } from "@/components/timezone-picker";
import { TabBar } from "@/components/tab-bar";
import { DataTable, type Column } from "@/components/data-table";

interface UserRecord {
  id: string;
  user_id: string;
  role: string;
  full_name: string;
  email: string;
  phone: string | null;
  time_zone: string;
  created_at: string;
  updated_at: string;
  lesson_count: number;
  clv_cents: number;
}

const ROLES = ["client", "tutor", "admin", "superadmin"] as const;

type RoleTab = "" | "client" | "tutor" | "admin" | "superadmin";

export default function AdminUsersPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<RoleTab>("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    first_name: "",
    last_name: "",
    role: "client",
    phone: "",
    time_zone: "America/New_York",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Role counts for tabs
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Check authorization
  useEffect(() => {
    async function check() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (profile?.role !== "superadmin") { router.push("/dashboard"); return; }
      setAuthorized(true);
    }
    check();
  }, [router]);

  const loadRoleCounts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("role");
    if (!data) return;
    const counts: Record<string, number> = {};
    for (const p of data) {
      counts[p.role] = (counts[p.role] || 0) + 1;
    }
    setRoleCounts(counts);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      sort: sortBy,
      order: sortOrder,
    });
    if (search) params.set("search", search);
    // Map the "tutor" tab to include both tutor and admin roles
    if (activeTab === "tutor") {
      params.set("role", "tutor");
    } else if (activeTab) {
      params.set("role", activeTab);
    }

    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    if (res.ok) {
      let fetched: UserRecord[] = data.users;
      // If tutor tab, also fetch admins and merge
      if (activeTab === "tutor") {
        const params2 = new URLSearchParams({
          page: "1",
          sort: sortBy,
          order: sortOrder,
        });
        if (search) params2.set("search", search);
        params2.set("role", "admin");
        const res2 = await fetch(`/api/admin/users?${params2}`);
        const data2 = await res2.json();
        if (res2.ok) {
          fetched = [...fetched, ...data2.users];
        }
      }
      setUsers(fetched);
      setTotal(activeTab === "tutor" ? fetched.length : data.total);
    }
    setLoading(false);
  }, [page, search, activeTab, sortBy, sortOrder]);

  useEffect(() => {
    if (authorized) {
      loadUsers();
      loadRoleCounts();
    }
  }, [authorized, loadUsers, loadRoleCounts]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function openCreate() {
    setForm({
      email: "",
      password: "",
      confirmPassword: "",
      first_name: "",
      last_name: "",
      role: activeTab || "client",
      phone: "",
      time_zone: "America/New_York",
    });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(user: UserRecord) {
    router.push(`/admin/users/${user.id}?tab=settings`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
    if (!full_name) { setFormError("Name is required"); setSubmitting(false); return; }

    if (!form.password) { setFormError("Password is required"); setSubmitting(false); return; }
    if (form.password !== form.confirmPassword) { setFormError("Passwords do not match"); setSubmitting(false); return; }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        full_name,
        role: form.role,
        phone: form.phone,
        time_zone: form.time_zone,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error); setSubmitting(false); return; }

    setShowModal(false);
    setSubmitting(false);
    loadUsers();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: deleteTarget.id }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Delete failed");
    }

    setDeleteTarget(null);
    setDeleting(false);
    loadUsers();
  }

  const showClientCols = activeTab === "" || activeTab === "client";
  const totalPages = Math.ceil(total / 25);

  const allCount = Object.values(roleCounts).reduce((s, c) => s + c, 0);
  const tutorAdminCount = (roleCounts["tutor"] || 0) + (roleCounts["admin"] || 0);

  const tabs = useMemo(() => [
    { key: "", label: "All Users", count: allCount },
    { key: "client", label: "Clients", count: roleCounts["client"] || 0 },
    { key: "tutor", label: "Tutors / Admins", count: tutorAdminCount },
    { key: "superadmin", label: "Superadmins", count: roleCounts["superadmin"] || 0 },
  ], [roleCounts, allCount, tutorAdminCount]);

  const columns = useMemo<Column<UserRecord>[]>(() => {
    const cols: Column<UserRecord>[] = [
      {
        key: "full_name",
        label: "Name",
        sortable: true,
        render: (user) => (
          <Link href={`/admin/users/${user.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
            {user.full_name}
          </Link>
        ),
        sortValue: (user) => user.full_name,
      },
      {
        key: "email",
        label: "Email",
        sortable: true,
        render: (user) => <span className="text-muted-foreground">{user.email}</span>,
        sortValue: (user) => user.email,
      },
    ];

    if (activeTab === "" || activeTab === "tutor") {
      cols.push({
        key: "role",
        label: "Role",
        sortable: true,
        render: (user) => (
          <Badge variant="secondary" className={`text-xs ${roleColors[user.role] || ""}`}>
            {user.role}
          </Badge>
        ),
        sortValue: (user) => user.role,
      });
    }

    cols.push({
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (user) => <span className="text-muted-foreground">{user.phone ? formatPhone(user.phone) : "—"}</span>,
      sortValue: (user) => user.phone || "",
    });

    if (showClientCols) {
      cols.push(
        {
          key: "lesson_count",
          label: "Lessons",
          sortable: true,
          align: "right",
          render: (user) => <>{user.lesson_count}</>,
          sortValue: (user) => user.lesson_count,
        },
        {
          key: "clv_cents",
          label: "Total CLV",
          sortable: true,
          align: "right",
          render: (user) => (
            <span className="font-bold">
              {user.clv_cents > 0 ? `$${(user.clv_cents / 100).toFixed(2)}` : "—"}
            </span>
          ),
          sortValue: (user) => user.clv_cents,
        },
      );
    }

    cols.push(
      {
        key: "created_at",
        label: "Joined",
        sortable: true,
        render: (user) => (
          <span className="text-muted-foreground">
            {new Date(user.created_at).toLocaleDateString(undefined, {
              month: "short", day: "numeric", year: "numeric",
            })}
          </span>
        ),
        sortValue: (user) => user.created_at,
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        align: "right",
        render: (user) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(user);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(user);
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    );

    return cols;
  }, [activeTab, showClientCols]);

  if (!authorized) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <Button onClick={openCreate}>Add User</Button>
      </div>

      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onChange={(key) => { setActiveTab(key as RoleTab); setPage(1); }}
      />

      {/* Search */}
      <Input
        placeholder="Search by name or phone..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="max-w-xs"
      />

      {/* Table */}
      <DataTable
        columns={columns}
        data={loading ? [] : users}
        rowKey={(user) => user.id}
        onRowClick={(user) => router.push(`/admin/users/${user.id}`)}
        emptyMessage={loading ? "Loading..." : "No users found."}
        sortKey={sortBy}
        sortDirection={sortOrder}
        onSort={(key, dir) => { setSortBy(key); setSortOrder(dir); }}
      />
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} users)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>Add User</CardTitle>
                <CardDescription>Create a new user account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {formError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="m-email" required>Email</Label>
                  <Input
                    id="m-email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="m-fname" required>First name</Label>
                    <Input
                      id="m-fname"
                      required
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="m-lname" required>Last name</Label>
                    <Input
                      id="m-lname"
                      required
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-role" required>Role</Label>
                  <Select value={form.role} onValueChange={(val) => { if (val) setForm({ ...form, role: val }); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-phone">Phone (optional)</Label>
                  <Input
                    id="m-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-tz">Time zone</Label>
                  <TimeZonePicker value={form.time_zone} onChange={(val) => setForm({ ...form, time_zone: val })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-pw" required>Password</Label>
                  <PasswordInput
                    id="m-pw"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 6 characters"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="m-cpw" required>Confirm Password</Label>
                  <PasswordInput
                    id="m-cpw"
                    required
                    minLength={6}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Confirm password"
                  />
                </div>
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating..." : "Create User"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Delete User</CardTitle>
              <CardDescription>
                Are you sure you want to delete <strong>{deleteTarget.full_name}</strong>? This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
