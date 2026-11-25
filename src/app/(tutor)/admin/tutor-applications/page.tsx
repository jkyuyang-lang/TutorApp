"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface Application {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  college: string;
  degree_level: string;
  resume_url: string;
  linkedin_url: string | null;
  why_good_fit: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

function statusVariant(status: string) {
  switch (status) {
    case "approved": return "default" as const;
    case "denied": return "destructive" as const;
    case "needs_more_info": return "secondary" as const;
    default: return "outline" as const;
  }
}

export default function TutorApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    checkAuth();
    loadApplications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAuth() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (profile?.role !== "superadmin") router.push("/dashboard");
  }

  async function loadApplications() {
    setLoading(true);
    const res = await fetch("/api/admin/tutor-applications");
    if (res.ok) {
      const data = await res.json();
      setApplications(data.applications);
    }
    setLoading(false);
  }

  async function updateStatus(status: string) {
    if (!selected) return;
    setUpdating(true);
    const res = await fetch("/api/admin/tutor-applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, status, admin_notes: adminNotes }),
    });
    if (res.ok) {
      await loadApplications();
      setSelected(null);
    }
    setUpdating(false);
  }

  function openDetail(app: Application) {
    setSelected(app);
    setAdminNotes(app.admin_notes || "");
  }

  const columns = useMemo<Column<Application>[]>(() => [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => <span className="font-medium">{row.first_name} {row.last_name}</span>,
      sortValue: (row) => `${row.first_name} ${row.last_name}`,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      cellClassName: "text-muted-foreground",
      render: (row) => row.email,
      sortValue: (row) => row.email,
    },
    {
      key: "college",
      label: "College",
      sortable: true,
      render: (row) => row.college,
      sortValue: (row) => row.college,
    },
    {
      key: "degree",
      label: "Degree",
      sortable: true,
      render: (row) => row.degree_level,
      sortValue: (row) => row.degree_level,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => (
        <Badge variant={statusVariant(row.status)} className="text-xs capitalize">
          {row.status.replace(/_/g, " ")}
        </Badge>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: "date",
      label: "Date",
      sortable: true,
      cellClassName: "text-muted-foreground",
      render: (row) => new Date(row.created_at).toLocaleDateString(),
      sortValue: (row) => new Date(row.created_at).getTime(),
    },
  ], []);

  const filtered = filter === "all"
    ? applications
    : applications.filter((a) => a.status === filter);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tutor Applications</h1>
        <div className="flex gap-2">
          {["all", "pending", "approved", "needs_more_info", "denied"].map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "needs_more_info" ? "Needs Info" : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== "all" && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({applications.filter((a) => a.status === f).length})
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      <DataTable<Application>
        columns={columns}
        data={filtered}
        rowKey={(row) => row.id}
        onRowClick={(app) => openDetail(app)}
        emptyMessage="No applications found."
        defaultSort={{ key: "date", direction: "desc" }}
      />

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.first_name} {selected.last_name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Email</p>
                    <p className="text-sm">{selected.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Phone</p>
                    <p className="text-sm">{selected.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">College</p>
                    <p className="text-sm">{selected.college}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Degree Level</p>
                    <p className="text-sm">{selected.degree_level}</p>
                  </div>
                </div>

                {selected.linkedin_url && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">LinkedIn</p>
                    <a
                      href={selected.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {selected.linkedin_url}
                    </a>
                  </div>
                )}

                {selected.why_good_fit && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Why They&apos;d Be a Good Fit</p>
                    <p className="text-sm whitespace-pre-wrap">{selected.why_good_fit}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Resume</p>
                  <a
                    href={selected.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm hover:bg-muted/80 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    View Resume
                  </a>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs font-medium text-muted-foreground">Current Status:</p>
                    <Badge variant={statusVariant(selected.status)} className="text-xs capitalize">
                      {selected.status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin_notes">Admin Notes</Label>
                    <Textarea
                      id="admin_notes"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                      placeholder="Internal notes about this applicant..."
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <DialogClose>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="secondary"
                  disabled={updating}
                  onClick={() => updateStatus("needs_more_info")}
                >
                  Need More Info
                </Button>
                <Button
                  variant="destructive"
                  disabled={updating}
                  onClick={() => updateStatus("denied")}
                >
                  Deny
                </Button>
                <Button
                  disabled={updating}
                  onClick={() => updateStatus("approved")}
                >
                  Approve
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
