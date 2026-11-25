"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";
import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { DataTable, type Column } from "@/components/data-table";

interface ClientRow {
  tutor_client_id: string;
  profile_id: string;
  full_name: string;
  role: string;
  phone: string | null;
  member_since: string;
  total_lessons: number;
  status: string;
  notes: string | null;
  tutor_name?: string;
  tutor_profile_id?: string;
}

interface TutorOption {
  id: string;
  name: string;
}

export default function ClientsPage() {
  const router = useRouter();
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit dialog
  const [editClient, setEditClient] = useState<ClientRow | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Bulk selection & delete
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Superadmin state
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [allTutors, setAllTutors] = useState<TutorOption[]>([]);
  const [tutorFilter, setTutorFilter] = useState("all");

  const loadClients = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();
    if (!profile) return;

    const superadmin = profile.role === "superadmin";
    setIsSuperadmin(superadmin);

    // For superadmin, load tutor list for filter (once)
    if (superadmin && allTutors.length === 0) {
      const { data: tutorsData } = await supabase
        .from("tutors")
        .select("id, profile_id, profiles(full_name)");
      if (tutorsData) {
        const mapped = tutorsData
          .filter((t) => t.profile_id !== profile.id)
          .map((t) => ({
            id: t.id,
            name: (t.profiles as unknown as { full_name: string })?.full_name ?? "Unknown",
          }));
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        setAllTutors(mapped);
      }
    }

    let effectiveTutorId: string | null = null;
    if (!superadmin) {
      const { data: tutor } = await supabase
        .from("tutors")
        .select("id")
        .eq("profile_id", profile.id)
        .single();
      if (!tutor) return;
      effectiveTutorId = tutor.id;
      setTutorId(tutor.id);
    } else if (tutorFilter !== "all") {
      effectiveTutorId = tutorFilter;
      setTutorId(tutorFilter);
    }

    let tcQuery = supabase
      .from("tutor_clients")
      .select(`
        id, tutor_id, status, notes, created_at,
        profiles:account_holder_id(id, full_name, role, phone),
        tutors(profile_id, profiles(full_name))
      `)
      .neq("status", "blocked")
      .order("created_at", { ascending: false });

    if (effectiveTutorId) {
      tcQuery = tcQuery.eq("tutor_id", effectiveTutorId);
    }

    const { data: tcData } = await tcQuery;

    const rows: ClientRow[] = await Promise.all(
      (tcData ?? []).map(async (tc) => {
        const p = tc.profiles as unknown as { id: string; full_name: string; role: string; phone: string | null };
        const tutorData = tc.tutors as unknown as { profile_id: string; profiles: { full_name: string } } | null;
        const tutorProfile = tutorData?.profiles;

        let lessonQuery = supabase
          .from("lessons")
          .select("id", { count: "exact", head: true })
          .eq("booked_by", p.id)
          .in("status", ["confirmed", "completed"]);

        if (effectiveTutorId) {
          lessonQuery = lessonQuery.eq("tutor_id", effectiveTutorId);
        } else {
          lessonQuery = lessonQuery.eq("tutor_id", tc.tutor_id);
        }

        const { count } = await lessonQuery;

        return {
          tutor_client_id: tc.id,
          profile_id: p.id,
          full_name: p.full_name,
          role: p.role,
          phone: p.phone,
          member_since: tc.created_at,
          total_lessons: count ?? 0,
          status: tc.status,
          notes: tc.notes,
          tutor_name: tutorProfile?.full_name ?? "Unknown",
          tutor_profile_id: tutorData?.profile_id,
        };
      })
    );

    setClients(rows);
    setSelected(new Set());
    setLoading(false);
  }, [router, tutorFilter, allTutors.length]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  function openEdit(client: ClientRow) {
    setEditClient(client);
    setEditNotes(client.notes ?? "");
  }

  async function handleSave() {
    if (!editClient) return;
    setSaving(true);
    const supabase = createClient();

    await supabase
      .from("tutor_clients")
      .update({ notes: editNotes.trim() || null })
      .eq("id", editClient.tutor_client_id);

    setClients((prev) =>
      prev.map((c) =>
        c.tutor_client_id === editClient.tutor_client_id
          ? { ...c, notes: editNotes.trim() || null }
          : c
      )
    );
    setSaving(false);
    setEditClient(null);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === clients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(clients.map((c) => c.tutor_client_id)));
    }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0 || !tutorId) return;
    setDeleting(true);

    const toRemove = clients.filter((c) => selected.has(c.tutor_client_id));
    const profileIds = toRemove.map((c) => c.profile_id);

    // Fully delete client accounts via API (removes auth user, profile, lessons, etc.)
    const res = await fetch("/api/clients/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_ids: profileIds }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error("Failed to delete clients:", data.errors || data.error);
      alert(`Delete failed: ${JSON.stringify(data.errors || data.error)}`);
    }

    setClients((prev) => prev.filter((c) => !selected.has(c.tutor_client_id)));
    setSelected(new Set());
    setDeleting(false);
    setShowDeleteDialog(false);
  }

  const columns = useMemo<Column<ClientRow>[]>(() => {
    const cols: Column<ClientRow>[] = [
      {
        key: "checkbox",
        label: "",
        header: (
          <input
            type="checkbox"
            checked={selected.size === clients.length && clients.length > 0}
            onChange={toggleAll}
            className="size-4 rounded border-gray-300"
          />
        ),
        render: (row) => (
          <span onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected.has(row.tutor_client_id)}
              onChange={() => toggleSelect(row.tutor_client_id)}
              className="size-4 rounded border-gray-300"
            />
          </span>
        ),
      },
      {
        key: "full_name",
        label: "Client Name",
        sortable: true,
        sortValue: (row) => row.full_name.toLowerCase(),
        render: (row) => (
          <div>
            {isSuperadmin ? (
              <Link href={`/admin/users/${row.profile_id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                {row.full_name}
              </Link>
            ) : (
              <Link href={`/clients/${row.profile_id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                {row.full_name}
              </Link>
            )}
            {row.phone && (
              <p className="text-xs text-muted-foreground">{formatPhone(row.phone)}</p>
            )}
          </div>
        ),
      },
    ];

    if (isSuperadmin) {
      cols.push({
        key: "tutor_name",
        label: "Tutor",
        sortable: true,
        sortValue: (row) => (row.tutor_name ?? "").toLowerCase(),
        render: (row) =>
          row.tutor_profile_id ? (
            <Link href={`/admin/users/${row.tutor_profile_id}`} className="text-primary underline-offset-2 hover:underline">
              {row.tutor_name}
            </Link>
          ) : (
            (row.tutor_name ?? "—")
          ),
      });
    }

    cols.push(
      {
        key: "total_lessons",
        label: "Lessons",
        sortable: true,
        sortValue: (row) => row.total_lessons,
        render: (row) => `${row.total_lessons} ${row.total_lessons === 1 ? "lesson" : "lessons"}`,
      },
      {
        key: "member_since",
        label: "Member Since",
        sortable: true,
        sortValue: (row) => new Date(row.member_since).getTime(),
        cellClassName: "text-muted-foreground",
        render: (row) =>
          new Date(row.member_since).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
      },
      {
        key: "role",
        label: "Type",
        sortable: true,
        sortValue: (row) => row.role.toLowerCase(),
        render: (row) => (
          <Badge variant="outline" className="capitalize text-xs">
            {row.role}
          </Badge>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        align: "right",
        render: (row) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(row);
              }}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        ),
      },
    );

    return cols;
  }, [isSuperadmin, selected, clients.length]);

  if (loading) {
    return <LoadingPlaceholder />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Clients</h1>
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-1 size-4" />
              Delete {selected.size} {selected.size === 1 ? "client" : "clients"}
            </Button>
          )}
        </div>
        {isSuperadmin && allTutors.length > 0 && (
          <Select value={tutorFilter} onValueChange={(val) => setTutorFilter(val ?? "all")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All tutors">
                {tutorFilter === "all"
                  ? "All tutors"
                  : allTutors.find((t) => t.id === tutorFilter)?.name ?? "All tutors"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tutors</SelectItem>
              {allTutors.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <DataTable<ClientRow>
        columns={columns}
        data={clients}
        rowKey={(row) => row.tutor_client_id}
        rowClassName={(row) =>
          selected.has(row.tutor_client_id) ? "bg-yellow-50" : ""
        }
        emptyMessage="No clients yet. They'll appear here after booking their first lesson."
      />

      {/* Edit Dialog */}
      <Dialog open={!!editClient} onOpenChange={(open) => { if (!open) setEditClient(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit Client —{" "}
              {editClient && (
                <Link href={isSuperadmin ? `/admin/users/${editClient.profile_id}` : `/clients/${editClient.profile_id}`} className="text-primary underline-offset-2 hover:underline">
                  {editClient.full_name}
                </Link>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm">Client Notes</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Private notes about this client..."
                rows={3}
                className="min-h-[80px] resize-y"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Type</span>
                <p className="font-medium capitalize">{editClient?.role}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Total Lessons</span>
                <p className="font-medium">{editClient?.total_lessons}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Member Since</span>
                <p className="font-medium">
                  {editClient && new Date(editClient.member_since).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p className="font-medium">{editClient?.phone ? formatPhone(editClient.phone) : "—"}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) setShowDeleteDialog(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} {selected.size === 1 ? "Client" : "Clients"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete {selected.size === 1 ? "this client's account" : `these ${selected.size} client accounts`}? This will remove their login, profile, lessons, messages, and all associated data. This cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
